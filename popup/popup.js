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
        const response = await chrome.runtime.sendMessage({
            type: "LEETBRIDGE_GET_STORED_DATA"
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

async function loadGitHubStatus() {
    const response = await chrome.runtime.sendMessage({
        type: "GITHUB_GET_STATUS"
    });
    const statusElement = document.getElementById("github-status");
    const repositoryElement = document.getElementById("github-repository");
    const syncElement = document.getElementById("github-sync");
    const button = document.getElementById("github-button");

    if (!response?.ok) {
        statusElement.textContent = response?.error ?? "Unable to check GitHub";
        return;
    }

    const status = response.status;

    if (!status.configured) {
        statusElement.textContent = "GitHub connection unavailable";
        button.textContent = "View details";
        return;
    }

    if (!status.repository) {
        statusElement.textContent = status.authenticated
            ? "Choose a repository"
            : "Not connected";
        button.textContent = status.authenticated
            ? "Select repository"
            : "Connect GitHub";
        return;
    }

    statusElement.textContent = "✓ Connected";
    repositoryElement.textContent = status.repository.fullName;
    repositoryElement.hidden = false;
    button.textContent = "Manage connection";

    if (status.lastSync) {
        syncElement.textContent = status.lastSync.ok
            ? `Last sync: ${status.lastSync.path}`
            : `Sync error: ${status.lastSync.error}`;
        syncElement.hidden = false;
    }
}

document.getElementById("github-button").addEventListener("click", async () => {
    await chrome.tabs.create({
        url: chrome.runtime.getURL("github/connect.html")
    });
    window.close();
});

detectLeetCode();
loadGitHubStatus();
