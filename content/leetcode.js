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
        problemName: getProblemName(),
        problemNumber: getProblemNumber(),
        difficulty: getDifficulty(),
        username: getUsername(),
        submissionStatus: getSubmissionStatus(),
        problemCode: getProblemCode()
    };
}

function handleUrlChange() {
    const problemSlug = getProblemSlug();

    if (!problemSlug) {
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
