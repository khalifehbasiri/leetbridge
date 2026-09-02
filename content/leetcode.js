function getProblemSlug() {
    const parts = window.location.pathname.split("/").filter(Boolean);

    return parts.length >= 2 && parts[0] === "problems"
        ? parts[1]
        : null;
}

let lastSlug = null;
let lastSnapshot = null;
let scanTimer = null;

function collectProblemData() {
    return {
        username: getUsername(),
        problem: {
            number: getProblemNumber(),
            title: getProblemName(),
            slug: getProblemSlug(),
            difficulty: getDifficulty()
        },
        submission: {
            submissionId: getSubmissionId(),
            language: getSubmissionLanguage(),
            code: getProblemCode(),
            status: getSubmissionStatus(),
            accepted: isSubmissionAccepted()
        }
    };
}

async function persistProblemData(data) {
    try {
        const response = await chrome.runtime.sendMessage({
            type: "LEETBRIDGE_STORE_DATA",
            data
        });

        if (!response?.ok) {
            throw new Error(response?.error ?? "Storage request failed");
        }
    } catch (error) {
        console.warn("LeetBridge could not save problem data:", error);
    }
}

function handleUrlChange() {
    const problemSlug = getProblemSlug();

    if (!problemSlug) {
        if (lastSlug !== null) {
            chrome.runtime.sendMessage({
                type: "LEETBRIDGE_CLEAR_CURRENT"
            }).catch(() => {});
        }

        lastSlug = null;
        lastSnapshot = null;
        return;
    }

    if (problemSlug !== lastSlug) {
        lastSlug = problemSlug;
        lastSnapshot = null;
        console.log("LeetBridge detected problem:", problemSlug);
    }

    const data = collectProblemData();
    const snapshot = JSON.stringify(data);

    if (snapshot !== lastSnapshot) {
        lastSnapshot = snapshot;
        persistProblemData(data);

        if (data.submission.accepted) {
            console.log("LeetBridge detected an accepted submission ✓");
        }
    }
}

function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(handleUrlChange, 250);
}

handleUrlChange();

const observer = new MutationObserver(scheduleScan);
observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "LEETBRIDGE_GET_DATA") {
        sendResponse({
            ok: true,
            data: getProblemSlug() ? collectProblemData() : null
        });
        return false;
    }

    if (message?.type === "LEETBRIDGE_IMPORT_HISTORY") {
        const requestId = message.requestId;
        historyRequestId = message.requestId;
        clearInterval(historyHeartbeat);
        historyHeartbeat = setInterval(() => {
            chrome.runtime.sendMessage({
                type: "LEETBRIDGE_IMPORT_HEARTBEAT", requestId
            }).then((response) => {
                if (!response?.ok) stopHistoryBridge(requestId);
            }).catch(() => stopHistoryBridge(requestId));
        }, 10000);
        document.dispatchEvent(new CustomEvent(
            "leetbridge:history-import-request",
            { detail: JSON.stringify({
                requestId: message.requestId,
                checkpoint: message.checkpoint,
                syncedSubmissionIds: message.syncedSubmissionIds,
                retryAt: message.retryAt
            }) }
        ));
        sendResponse({ ok: true });
        return false;
    }

    if (message?.type === "LEETBRIDGE_CANCEL_IMPORT") {
        stopHistoryBridge(message.requestId);
        sendResponse({ ok: true });
        return false;
    }

    return false;
});

let historyRequestId = null;
let historyHeartbeat = null;
const historyActions = new Set([
    "LEETBRIDGE_IMPORT_INITIALIZE", "LEETBRIDGE_IMPORT_ITEM",
    "LEETBRIDGE_IMPORT_CHECKPOINT", "LEETBRIDGE_IMPORT_PROGRESS",
    "LEETBRIDGE_IMPORT_COMPLETE", "LEETBRIDGE_IMPORT_ERROR"
]);

function stopHistoryBridge(requestId) {
    if (!requestId || historyRequestId !== requestId) return;
    clearInterval(historyHeartbeat);
    historyRequestId = null;
    document.dispatchEvent(new CustomEvent("leetbridge:history-import-cancel", {
        detail: JSON.stringify({ requestId })
    }));
}

document.addEventListener("leetbridge:history-import-call", async (event) => {
    let payload;
    try { payload = JSON.parse(event.detail); } catch { return; }
    if (payload.requestId !== historyRequestId || !historyActions.has(payload.type)) return;
    let response;
    try {
        response = await chrome.runtime.sendMessage(payload);
    } catch {
        response = { ok: false, error: "Extension connection lost. Refresh this tab and resume the import." };
    }
    // Only send acknowledgements to the page, never extension storage or tokens.
    document.dispatchEvent(new CustomEvent("leetbridge:history-import-reply", {
        detail: JSON.stringify({
            requestId: payload.requestId, callId: payload.callId,
            ok: response?.ok === true, error: response?.error
        })
    }));
});

document.addEventListener("leetbridge:history-import-ended", (event) => {
    try { stopHistoryBridge(JSON.parse(event.detail).requestId); } catch { /* Ignore malformed events. */ }
});
