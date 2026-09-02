(() => {
    if (window.__leetBridgeHistoryInstalled) return;
    window.__leetBridgeHistoryInstalled = true;

    // This script loads before the live-submission interceptor.
    const originalFetch = window.fetch.bind(window);
    const PAGE_SIZE = 20;
    const REQUEST_GAP_MS = 3000;
    const MAX_RETRIES = 3;
    let activeImport = null;
    let nextRequestAt = 0;

    function emit(name, detail) {
        document.dispatchEvent(new CustomEvent(name, {
            detail: JSON.stringify(detail)
        }));
    }

    function wait(ms, signal) {
        signal.throwIfAborted();
        return new Promise((resolve, reject) => {
            const abort = () => {
                clearTimeout(timer);
                reject(signal.reason);
            };
            const timer = setTimeout(() => {
                signal.removeEventListener("abort", abort);
                resolve();
            }, Math.max(0, ms));
            signal.addEventListener("abort", abort, { once: true });
        });
    }

    function callBackground(run, type, data = {}) {
        run.signal.throwIfAborted();
        const callId = crypto.randomUUID();
        return new Promise((resolve, reject) => {
            const cleanup = () => {
                clearTimeout(timer);
                document.removeEventListener("leetbridge:history-import-reply", reply);
                run.signal.removeEventListener("abort", abort);
            };
            const abort = () => {
                cleanup();
                reject(run.signal.reason);
            };
            const reply = (event) => {
                let result;
                try { result = JSON.parse(event.detail); } catch { return; }
                if (result.requestId !== run.requestId || result.callId !== callId) return;
                cleanup();
                if (result.ok) resolve(result);
                else reject(new Error(result.error || "Import interrupted. Resume to continue."));
            };
            const timer = setTimeout(() => {
                cleanup();
                reject(new Error("The extension stopped responding. Refresh this tab and resume the import."));
            }, 240000);
            document.addEventListener("leetbridge:history-import-reply", reply);
            run.signal.addEventListener("abort", abort, { once: true });
            emit("leetbridge:history-import-call", { ...data, type, requestId: run.requestId, callId });
        });
    }

    function retryDelay(response, attempt) {
        const header = response?.headers.get("Retry-After");
        const seconds = header && /^\d+$/.test(header) ? Number(header) : null;
        const serverDelay = seconds !== null ? seconds * 1000
            : header ? Date.parse(header) - Date.now() : 0;
        return Math.max(15000 * (2 ** attempt), Number.isFinite(serverDelay) ? serverDelay : 0);
    }

    async function fetchJson(path, run) {
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
            await wait(nextRequestAt - Date.now(), run.signal);
            nextRequestAt = Date.now() + REQUEST_GAP_MS;
            const controller = new AbortController();
            const abort = () => controller.abort(run.signal.reason);
            run.signal.addEventListener("abort", abort, { once: true });
            const timeout = setTimeout(() => controller.abort(), 20000);
            let response;
            let body;
            let networkError = false;
            try {
                response = await originalFetch(path, {
                    credentials: "same-origin",
                    headers: { Accept: "application/json" },
                    signal: controller.signal
                });
                body = await response.text();
            } catch {
                run.signal.throwIfAborted();
                networkError = true;
            } finally {
                clearTimeout(timeout);
                run.signal.removeEventListener("abort", abort);
            }
            if (!networkError && response.ok) {
                try { return JSON.parse(body); } catch {
                    throw new Error("LeetCode returned a page instead of submission data. Open LeetCode, complete any verification, then resume.");
                }
            }
            const status = response?.status;
            // Log only endpoint and status, never cookies, code, or response bodies.
            console.warn("LeetBridge history request failed", {
                endpoint: path.split("?")[0], status: status ?? "network", attempt: attempt + 1
            });
            if (status === 401) {
                throw new Error("Your LeetCode session expired (401). Sign in on this tab, then resume the import.");
            }
            const throttled = status === 429 || (status === 403 && (
                response.headers.has("Retry-After")
                || /too many requests|rate.?limit|throttl|try again later|please (?:wait|slow)/i.test(body)
            ));
            const retryable = networkError || throttled || status === 408 || status >= 500;
            const delay = retryDelay(response, attempt);
            if (retryable) {
                nextRequestAt = Date.now() + delay;
                await callBackground(run, "LEETBRIDGE_IMPORT_PROGRESS", {
                    phase: "waiting", retryAt: nextRequestAt
                });
            }
            if (!retryable || attempt === MAX_RETRIES) {
                if (status === 403) {
                    throw new Error(throttled
                        ? "LeetCode is still limiting requests (403). Progress is saved. Wait before resuming."
                        : "LeetCode denied access to submission history (403). Progress is saved. Open LeetCode and complete any verification before resuming; signing in again may not resolve this.");
                }
                throw new Error(throttled
                    ? "LeetCode is still limiting requests (429). Progress is saved. Wait before resuming."
                    : `LeetCode request failed (${status ?? "network/timeout"}). Progress is saved; resume to retry.`);
            }
            // Do not shorten a server-requested cooldown, including on manual resume.
            await wait(delay, run.signal);
            await callBackground(run, "LEETBRIDGE_IMPORT_PROGRESS", {
                phase: "scanning", retryAt: null
            });
        }
    }

    function createCatalog(payload) {
        if (!Array.isArray(payload.stat_status_pairs)) {
            throw new Error("LeetCode returned an unexpected problem catalog. No progress was discarded.");
        }
        const catalog = new Map();
        for (const item of payload.stat_status_pairs) {
            const stat = item.stat ?? {};
            const slug = stat.question__title_slug;
            if (!slug) continue;
            const number = String(stat.frontend_question_id ?? "");
            catalog.set(slug, {
                number: /^\d+$/.test(number) ? Number(number) : null,
                title: stat.question__title ?? slug,
                slug,
                difficulty: { 1: "Easy", 2: "Medium", 3: "Hard" }[item.difficulty?.level] ?? null
            });
        }
        return catalog;
    }

    async function importHistory(request, run) {
        nextRequestAt = Math.max(nextRequestAt, Number(request.retryAt) || 0);
        const payload = await fetchJson("/api/problems/all/", run);
        const username = payload.user_name;
        if (typeof username !== "string" || !username.trim()) {
            throw new Error("Sign in to LeetCode on this tab before importing your submission history.");
        }
        const catalog = createCatalog(payload);
        const checkpoint = request.checkpoint ?? {
            offset: 0, lastKey: "", scannedCount: 0, seen: [], done: false
        };
        await callBackground(run, "LEETBRIDGE_IMPORT_INITIALIZE", { username });
        const seen = new Set(checkpoint.seen);
        const syncedIds = new Set(request.syncedSubmissionIds ?? []);
        let offset = checkpoint.offset;
        let lastKey = checkpoint.lastKey;
        let scannedCount = checkpoint.scannedCount;
        let previousPage = checkpoint.lastPageSignature ?? "";
        let done = checkpoint.done;

        while (!done) {
            const parameters = new URLSearchParams({
                offset: String(offset), limit: String(PAGE_SIZE), lastkey: lastKey
            });
            const page = await fetchJson(`/api/submissions/?${parameters}`, run);
            const submissions = page.submissions_dump;
            const hasNext = page.has_next ?? page.hasNext;
            if (!Array.isArray(submissions) || typeof hasNext !== "boolean") {
                throw new Error("LeetCode returned an unexpected history response. Progress is saved; the import was not marked complete.");
            }
            const signature = submissions.map((item) => item.id ?? item.submission_id).join(",");
            if ((hasNext && submissions.length === 0) || (signature && signature === previousPage)) {
                throw new Error("LeetCode pagination did not advance. Progress is saved; please try again later.");
            }
            for (const item of submissions) {
                run.signal.throwIfAborted();
                if (String(item.status_display ?? item.statusDisplay).toLowerCase() !== "accepted") continue;
                const slug = item.title_slug ?? item.titleSlug;
                const language = item.lang ?? item.language;
                const submissionId = String(item.id ?? item.submission_id ?? "");
                if (!slug || !language || !/^\d{1,100}$/.test(submissionId)) {
                    throw new Error("LeetCode returned an incomplete accepted submission. Progress is saved.");
                }
                const identity = `${slug}:${String(language).toLowerCase()}`;
                if (seen.has(identity)) continue;
                let code = item.code;
                const alreadySynced = syncedIds.has(submissionId);
                if (!alreadySynced && (typeof code !== "string" || !code.length)) {
                    const detail = await fetchJson(`/submissions/detail/${encodeURIComponent(submissionId)}/check/`, run);
                    code = detail.code;
                }
                if (!alreadySynced && (typeof code !== "string" || !code.length)) {
                    throw new Error("LeetCode did not return the accepted solution's code. Progress is saved; no older solution was substituted.");
                }
                await callBackground(run, "LEETBRIDGE_IMPORT_ITEM", {
                    identity,
                    alreadySynced,
                    data: {
                        username,
                        problem: catalog.get(slug) ?? {
                            number: null, title: item.title ?? slug, slug, difficulty: null
                        },
                        submission: {
                            submissionId, language, code: alreadySynced ? null : code,
                            status: "Accepted", accepted: true
                        }
                    }
                });
                // Advance only after the worker has synced and durably acknowledged it.
                seen.add(identity);
            }
            const nextKey = page.last_key ?? page.lastKey ?? page.lastkey ?? "";
            if (typeof nextKey !== "string") {
                throw new Error("LeetCode returned an invalid pagination cursor. Progress is saved.");
            }
            scannedCount += submissions.length;
            offset += submissions.length;
            lastKey = nextKey;
            done = !hasNext;
            await callBackground(run, "LEETBRIDGE_IMPORT_CHECKPOINT", {
                checkpoint: { offset, lastKey, scannedCount, done, lastPageSignature: signature }
            });
            previousPage = signature;
        }
        await callBackground(run, "LEETBRIDGE_IMPORT_COMPLETE");
    }

    document.addEventListener("leetbridge:history-import-request", (event) => {
        let request;
        try { request = JSON.parse(event.detail); } catch { return; }
        if (typeof request.requestId !== "string") return;
        activeImport?.controller.abort();
        const controller = new AbortController();
        const run = { requestId: request.requestId, controller, signal: controller.signal };
        activeImport = run;
        importHistory(request, run).catch(async (error) => {
            if (run.signal.aborted) return;
            await callBackground(run, "LEETBRIDGE_IMPORT_ERROR", {
                error: error.message
            }).catch(() => {});
        }).finally(() => {
            if (activeImport === run) activeImport = null;
            emit("leetbridge:history-import-ended", { requestId: run.requestId });
        });
    });

    document.addEventListener("leetbridge:history-import-cancel", (event) => {
        let request;
        try { request = JSON.parse(event.detail); } catch { return; }
        if (activeImport?.requestId === request.requestId) activeImport.controller.abort();
    });
})();
