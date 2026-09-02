(() => {
    const captureKey = "__leetBridgeSubmissionCaptureInstalled";

    if (window[captureKey]) {
        return;
    }

    window[captureKey] = true;
    let latestSubmissionId = null;
    let latestSubmissionSlug = null;
    let latestUsername = null;
    let activePollToken = 0;
    let polledSubmissionId = null;
    let completedSubmissionId = null;

    function normalizeUrl(input) {
        if (typeof input === "string") {
            return input;
        }

        if (input instanceof Request || input instanceof URL) {
            return input.url || input.href;
        }

        return String(input?.url ?? input ?? "");
    }

    function getRequestType(url) {
        if (/\/submit\/?(?:\?|$)/.test(url)) {
            return "submit";
        }

        if (/\/interpret_solution\/?(?:\?|$)/.test(url)) {
            return "run";
        }

        return null;
    }

    function getCurrentProblemSlug() {
        const parts = window.location.pathname.split("/").filter(Boolean);

        return parts[0] === "problems" ? parts[1] ?? null : null;
    }

    function dispatchBridgeEvent(name, detail) {
        document.dispatchEvent(new CustomEvent(name, {
            detail: JSON.stringify(detail)
        }));
    }

    function parseRequestBody(body) {
        if (typeof body === "string") {
            try {
                return JSON.parse(body);
            } catch {
                return null;
            }
        }

        if (body instanceof URLSearchParams) {
            return Object.fromEntries(body.entries());
        }

        if (body instanceof FormData) {
            return Object.fromEntries(body.entries());
        }

        return body && typeof body === "object" ? body : null;
    }

    function captureCodeRequest(requestType, body) {
        const payload = parseRequestBody(body);
        const problemCode = payload?.typed_code
            ?? payload?.typedCode
            ?? payload?.code;

        if (typeof problemCode !== "string") {
            return;
        }

        const problemSlug = getCurrentProblemSlug();

        if (requestType === "submit") {
            latestSubmissionId = null;
            latestSubmissionSlug = problemSlug;
            polledSubmissionId = null;
            completedSubmissionId = null;
            activePollToken += 1;
        }

        dispatchBridgeEvent("leetbridge:submission-captured", {
            requestType,
            problemCode,
            language: payload.lang ?? payload.language ?? null,
            problemSlug
        });
    }

    function readSubmissionResult(payload) {
        const result = payload?.data?.submissionResult
            ?? payload?.data?.submissionDetail
            ?? payload;
        const state = result?.state ?? null;
        let status = result?.status_msg
            ?? result?.statusMsg
            ?? result?.statusDisplay
            ?? null;

        if (!status && state === "PENDING") {
            status = "Pending";
        } else if (!status && state === "STARTED") {
            status = "Judging";
        }

        return { state, status };
    }

    function processSubmissionResult(submissionId, payload, problemSlug) {
        const { state, status } = readSubmissionResult(payload);

        if (typeof status !== "string") {
            return false;
        }

        const accepted = status.toLowerCase() === "accepted";
        const isFinal = state === "SUCCESS"
            || !["pending", "judging", "started"].includes(
                status.toLowerCase()
            );

        dispatchBridgeEvent("leetbridge:submission-result", {
            submissionId,
            problemSlug,
            status,
            accepted
        });

        if (isFinal) {
            completedSubmissionId = submissionId;
        }

        return isFinal;
    }

    function startSubmissionPolling(submissionId) {
        if (!submissionId || polledSubmissionId === submissionId) {
            return;
        }

        polledSubmissionId = submissionId;
        const pollToken = activePollToken;
        const problemSlug = latestSubmissionSlug;

        (async () => {
            for (let attempt = 0; attempt < 120; attempt += 1) {
                if (
                    pollToken !== activePollToken
                    || completedSubmissionId === submissionId
                ) {
                    return;
                }

                try {
                    const response = await originalFetch(
                        `/submissions/detail/${encodeURIComponent(submissionId)}/check/`,
                        { credentials: "same-origin" }
                    );
                    const payload = await response.json();

                    if (processSubmissionResult(
                        submissionId,
                        payload,
                        problemSlug
                    )) {
                        return;
                    }
                } catch {
                    // A later attempt can recover from a transient failure.
                }

                await new Promise((resolve) => setTimeout(resolve, 500));
            }

            if (
                pollToken === activePollToken
                && completedSubmissionId !== submissionId
            ) {
                dispatchBridgeEvent("leetbridge:submission-result", {
                    submissionId,
                    problemSlug,
                    status: "Unable to verify",
                    accepted: false
                });
            }
        })();
    }

    function inspectResponsePayload(url, payload) {
        const userStatus = payload?.data?.globalData?.userStatus;

        if (userStatus && typeof userStatus.username === "string") {
            latestUsername = userStatus.username;
            dispatchBridgeEvent("leetbridge:username-detected", {
                username: latestUsername
            });
        }

        if (getRequestType(url) === "submit") {
            const submissionId = payload?.submission_id
                ?? payload?.submissionId;

            if (submissionId != null) {
                latestSubmissionId = String(submissionId);
                startSubmissionPolling(latestSubmissionId);
            }
        }

        const checkMatch = url.match(
            /\/submissions\/detail\/([^/?#]+)\/check\/?/
        );

        if (!checkMatch) {
            return;
        }

        const submissionId = checkMatch[1];

        if (latestSubmissionId && submissionId !== latestSubmissionId) {
            return;
        }

        latestSubmissionId = submissionId;
        processSubmissionResult(
            submissionId,
            payload,
            latestSubmissionSlug
        );
    }

    async function inspectFetchResponse(url, response) {
        try {
            const payload = await response.clone().json();
            inspectResponsePayload(url, payload);
        } catch {
            // Not every LeetCode response contains JSON.
        }
    }

    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
        const url = normalizeUrl(input);
        const requestType = getRequestType(url);

        if (requestType) {
            if (init?.body) {
                captureCodeRequest(requestType, init.body);
            } else if (input instanceof Request) {
                input.clone().text()
                    .then((body) => captureCodeRequest(requestType, body))
                    .catch(() => {});
            }
        }

        const responsePromise = originalFetch.apply(this, arguments);
        responsePromise
            .then((response) => inspectFetchResponse(url, response))
            .catch(() => {});

        return responsePromise;
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
        this.__leetBridgeRequestUrl = String(url);
        return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function(body) {
        const url = this.__leetBridgeRequestUrl ?? "";
        const requestType = getRequestType(url);

        if (requestType) {
            captureCodeRequest(requestType, body);
        }

        this.addEventListener("load", () => {
            try {
                const payload = this.responseType === "json"
                    ? this.response
                    : JSON.parse(this.responseText);
                inspectResponsePayload(url, payload);
            } catch {
                // Ignore non-JSON responses.
            }
        }, { once: true });

        return originalSend.apply(this, arguments);
    };


    document.addEventListener("leetbridge:username-request", () => {
        if (latestUsername) {
            dispatchBridgeEvent("leetbridge:username-detected", {
                username: latestUsername
            });
        }
    });
})();
