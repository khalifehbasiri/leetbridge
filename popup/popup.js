async function detectLeetCode() {
    const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
    });

    const status = document.getElementById("status");
    const details = document.getElementById("details");

    if (!tab || !tab.url) {
        status.textContent = "Unable to detect current page.";
        return;
    }

    if (!tab.url.startsWith("https://leetcode.com/problems/")) {
        status.textContent = "LeetCode problem not detected";
        return;
    }

    status.textContent = "✓ LeetCode detected";
    details.hidden = false;

    try {
        const response = await chrome.tabs.sendMessage(tab.id, {
            type: "LEETBRIDGE_GET_DATA"
        });

        if (!response?.ok || !response.data) {
            return;
        }

        renderProblemData(response.data);
    } catch {
        status.textContent = "✓ LeetCode detected — refresh this tab";
    }
}

function renderProblemData(data) {
    const problem = data.problem ?? {};
    const submission = data.submission ?? {};
    const problemLabel = problem.title
        ? `#${problem.number ?? "?"} ${problem.title}`
        : "Loading problem...";

    document.getElementById("problem").textContent = problem.difficulty
        ? `${problemLabel} · ${problem.difficulty}`
        : problemLabel;
    document.getElementById("username").textContent = data.username
        ? `✓ ${data.username}`
        : "Not signed in or still loading";
    document.getElementById("submission").textContent = submission.accepted
        ? "Accepted detected ✓"
        : submission.status ?? "No submission yet";
    document.getElementById("solution").textContent = submission.code
        ? `${submission.language ?? "Unknown language"} code captured ✓`
        : "Waiting for a real submission";
}

detectLeetCode();
