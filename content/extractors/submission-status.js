let latestSubmissionStatus = null;
let latestSubmissionAccepted = false;
let latestStatusSlug = null;
let latestSubmissionId = null;

function refreshSubmissionData() {
    if (typeof scheduleScan === "function") {
        scheduleScan();
    }
}

document.addEventListener("leetbridge:submission-captured", (event) => {
    try {
        const submission = JSON.parse(event.detail);

        if (submission.requestType !== "submit") {
            return;
        }

        latestSubmissionStatus = "Pending";
        latestSubmissionAccepted = false;
        latestStatusSlug = submission.problemSlug ?? null;
        latestSubmissionId = null;
        refreshSubmissionData();
    } catch (error) {
        console.warn("LeetBridge could not initialize submission status:", error);
    }
});

document.addEventListener("leetbridge:submission-result", (event) => {
    try {
        const submission = JSON.parse(event.detail);

        latestSubmissionStatus = submission.status ?? null;
        latestSubmissionAccepted = submission.accepted === true;
        latestStatusSlug = submission.problemSlug ?? null;
        latestSubmissionId = submission.submissionId != null
            ? String(submission.submissionId)
            : null;
        refreshSubmissionData();
    } catch (error) {
        console.warn("LeetBridge could not read submission status:", error);
    }
});

function isCurrentStatusSlug() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const currentSlug = parts[0] === "problems" ? parts[1] : null;

    return Boolean(currentSlug && currentSlug === latestStatusSlug);
}

function getSubmissionStatus() {
    return isCurrentStatusSlug() ? latestSubmissionStatus : null;
}

function isSubmissionAccepted() {
    return isCurrentStatusSlug() && latestSubmissionAccepted;
}

function getSubmissionId() {
    return isCurrentStatusSlug() ? latestSubmissionId : null;
}
