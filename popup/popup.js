async function detectLeetCode() {

    const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
    });

    const status = document.getElementById("status");

    if (!tab || !tab.url) {
        status.textContent = "Unable to detect current page.";
        return;
    }

    if (tab.url.startsWith("https://leetcode.com/problems/")) {
        status.textContent = "✓ LeetCode problem detected";
    } else {
        status.textContent = "LeetCode problem not detected";
    }
}

detectLeetCode();