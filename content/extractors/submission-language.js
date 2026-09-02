let latestSubmissionLanguage = null;
let latestLanguageSlug = null;

document.addEventListener("leetbridge:submission-captured", (event) => {
    try {
        const submission = JSON.parse(event.detail);

        if (submission.requestType !== "submit") {
            return;
        }

        latestSubmissionLanguage = submission.language ?? null;
        latestLanguageSlug = submission.problemSlug ?? null;

        if (typeof scheduleScan === "function") {
            scheduleScan();
        }
    } catch (error) {
        console.warn("LeetBridge could not read submission language:", error);
    }
});

function getSubmissionLanguage() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const currentSlug = parts[0] === "problems" ? parts[1] : null;

    return currentSlug && currentSlug === latestLanguageSlug
        ? latestSubmissionLanguage
        : null;
}
