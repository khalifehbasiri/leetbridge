function getProblemSlug() {
    const parts = window.location.pathname
        .split("/")
        .filter(Boolean);

    if (parts.length >= 2 && parts[0] === "problems") {
        return parts[1];
    }
    return null;
}

// Track the last processed slug to avoid duplicate logs on every tiny DOM change
let lastSlug = null;

function handleUrlChange() {
    const problemSlug = getProblemSlug();

    // Only run if we are on a valid problem page and it's a NEW problem
    if (problemSlug && problemSlug !== lastSlug) {
        lastSlug = problemSlug;
        console.log("LeetBridge detected problem:", problemSlug);
    }
}

// 1. Run immediately on initial hard page load
handleUrlChange();

// 2. Set up the MutationObserver to listen for SPA navigation changes
const observer = new MutationObserver(() => {
    handleUrlChange();
});

// 3. Start observing the document body for changes
observer.observe(document.body, {
    childList: true,
    subtree: true
});
