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
        document.dispatchEvent(new CustomEvent(
            "leetbridge:history-import-request",
            { detail: JSON.stringify({ requestId: message.requestId }) }
        ));
        sendResponse({ ok: true });
        return false;
    }

    if (message?.type === "LEETBRIDGE_CANCEL_IMPORT") {
        document.dispatchEvent(new CustomEvent(
            "leetbridge:history-import-cancel"
        ));
        sendResponse({ ok: true });
        return false;
    }

    return false;
});

let historyImportMessageQueue = Promise.resolve();

function queueHistoryImportMessage(type, detail) {
    historyImportMessageQueue = historyImportMessageQueue.then(async () => {
        const payload = JSON.parse(detail);
        const response = await chrome.runtime.sendMessage({ type, ...payload });

        if (!response?.ok) {
            throw new Error(response?.error ?? "Historical import failed");
        }
    }).catch((error) => {
        console.warn("LeetBridge historical import error:", error);
    });
}

document.addEventListener("leetbridge:history-import-batch", (event) => {
    queueHistoryImportMessage("LEETBRIDGE_IMPORT_BATCH", event.detail);
});

document.addEventListener("leetbridge:history-import-complete", (event) => {
    queueHistoryImportMessage("LEETBRIDGE_IMPORT_COMPLETE", event.detail);
});

document.addEventListener("leetbridge:history-import-error", (event) => {
    queueHistoryImportMessage("LEETBRIDGE_IMPORT_ERROR", event.detail);
});
