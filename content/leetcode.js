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
            language: getSubmissionLanguage(),
            code: getProblemCode(),
            status: getSubmissionStatus(),
            accepted: isSubmissionAccepted()
        }
    };
}

async function persistProblemData(data) {
    try {
        await chrome.storage.local.set({
            leetBridgeCurrent: data
        });

        if (!data.submission.accepted || !data.submission.code) {
            return;
        }

        const result = await chrome.storage.local.get(
            "leetBridgeAcceptedSolutions"
        );
        const solutions = result.leetBridgeAcceptedSolutions ?? {};
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
            leetBridgeAcceptedSolutions: solutions
        });
    } catch (error) {
        console.warn("LeetBridge could not save problem data:", error);
    }
}

function handleUrlChange() {
    const problemSlug = getProblemSlug();

    if (!problemSlug) {
        if (lastSlug !== null) {
            chrome.storage.local.set({ leetBridgeCurrent: null });
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
        console.log("LeetBridge problem data:", data);
        persistProblemData(data);

        if (data.submission.accepted) {
            console.log("Accepted detected ✓", data);
        }
    }
}

function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(handleUrlChange, 250);
}

chrome.runtime.sendMessage({
    type: "LEETCODE_PAGE_DETECTED",
    message: "LeetCode is open"
});

handleUrlChange();

const observer = new MutationObserver(scheduleScan);
observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "LEETBRIDGE_GET_DATA") {
        return false;
    }

    sendResponse({
        ok: true,
        data: getProblemSlug() ? collectProblemData() : null
    });
    return false;
});
