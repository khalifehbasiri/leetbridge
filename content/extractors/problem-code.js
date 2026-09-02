let latestProblemCode = null;
let latestProblemSlug = null;

document.addEventListener("leetbridge:submission-captured", (event) => {
    try {
        const submission = JSON.parse(event.detail);
        latestProblemCode = submission.problemCode ?? null;
        latestProblemSlug = submission.problemSlug ?? null;

        if (typeof scheduleScan === "function") {
            scheduleScan();
        }
    } catch (error) {
        console.warn("LeetBridge could not read submitted code:", error);
    }
});

function getProblemCode() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const currentSlug = parts[0] === "problems" ? parts[1] : null;

    return currentSlug && currentSlug === latestProblemSlug
        ? latestProblemCode
        : null;
}
