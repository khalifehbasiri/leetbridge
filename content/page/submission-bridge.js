(() => {
    const captureKey = "__leetBridgeSubmissionCaptureInstalled";

    if (window[captureKey]) {
        return;
    }

    window[captureKey] = true;

    function isCodeRequest(url) {
        return /\/(submit|interpret_solution)\/?(?:\?|$)/.test(url);
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

    function captureSubmission(body) {
        const payload = parseRequestBody(body);
        const problemCode = payload?.typed_code
            ?? payload?.typedCode
            ?? payload?.code;

        if (typeof problemCode !== "string") {
            return;
        }

        const pathParts = window.location.pathname.split("/").filter(Boolean);
        const problemSlug = pathParts[0] === "problems"
            ? pathParts[1] ?? null
            : null;

        document.dispatchEvent(new CustomEvent(
            "leetbridge:submission-captured",
            {
                detail: JSON.stringify({
                    problemCode,
                    language: payload.lang ?? payload.language ?? null,
                    problemSlug
                })
            }
        ));
    }

    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
        const url = typeof input === "string" ? input : input?.url ?? "";

        if (isCodeRequest(url)) {
            if (init?.body) {
                captureSubmission(init.body);
            } else if (input instanceof Request) {
                input.clone().text().then(captureSubmission).catch(() => {});
            }
        }

        return originalFetch.apply(this, arguments);
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
        this.__leetBridgeRequestUrl = String(url);
        return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function(body) {
        if (isCodeRequest(this.__leetBridgeRequestUrl ?? "")) {
            captureSubmission(body);
        }

        return originalSend.apply(this, arguments);
    };
})();
