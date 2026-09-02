const CURRENT_DATA_KEY = "leetBridgeCurrent";
const ACCEPTED_SOLUTIONS_KEY = "leetBridgeAcceptedSolutions";

function isLeetCodeSender(sender) {
    return sender.tab?.url?.startsWith("https://leetcode.com/") === true;
}

function isValidProblemData(data) {
    return Boolean(
        data
        && typeof data === "object"
        && data.problem
        && typeof data.problem.slug === "string"
        && data.submission
        && typeof data.submission === "object"
    );
}

async function storeProblemData(data) {
    await chrome.storage.local.set({
        [CURRENT_DATA_KEY]: data
    });

    if (data.submission.accepted !== true) {
        return;
    }

    if (typeof data.submission.code !== "string") {
        return;
    }

    const stored = await chrome.storage.local.get(ACCEPTED_SOLUTIONS_KEY);
    const solutions = stored[ACCEPTED_SOLUTIONS_KEY] ?? {};
    const solutionKey = [
        data.username ?? "anonymous",
        data.problem.slug,
        data.submission.language ?? "unknown"
    ].join(":");

    solutions[solutionKey] = {
        ...data,
        capturedAt: new Date().toISOString()
    };

    await chrome.storage.local.set({
        [ACCEPTED_SOLUTIONS_KEY]: solutions
    });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "LEETBRIDGE_STORE_DATA") {
        if (!isLeetCodeSender(sender) || !isValidProblemData(message.data)) {
            sendResponse({ ok: false, error: "Invalid problem data" });
            return false;
        }

        storeProblemData(message.data)
            .then(() => sendResponse({ ok: true }))
            .catch((error) => sendResponse({
                ok: false,
                error: error.message
            }));
        return true;
    }

    if (message?.type === "LEETBRIDGE_CLEAR_CURRENT") {
        if (!isLeetCodeSender(sender)) {
            sendResponse({ ok: false, error: "Invalid sender" });
            return false;
        }

        chrome.storage.local.remove(CURRENT_DATA_KEY)
            .then(() => sendResponse({ ok: true }))
            .catch((error) => sendResponse({
                ok: false,
                error: error.message
            }));
        return true;
    }

    if (message?.type === "LEETBRIDGE_GET_STORED_DATA") {
        chrome.storage.local.get(CURRENT_DATA_KEY)
            .then((stored) => sendResponse({
                ok: true,
                data: stored[CURRENT_DATA_KEY] ?? null
            }))
            .catch((error) => sendResponse({
                ok: false,
                error: error.message
            }));
        return true;
    }

    return false;
});
