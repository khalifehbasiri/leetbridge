let activeTab = null;
let leetCodeData = null;
let githubStatus = null;
let importRefreshTimer = null;

const elements = Object.fromEntries([
    "onboarding-panel", "onboarding-button", "leetcode-step", "github-step",
    "repository-step", "leetcode-indicator", "leetcode-account",
    "current-problem", "leetcode-button", "github-indicator",
    "github-account", "github-repository", "github-button",
    "auto-sync-toggle", "readme-toggle", "last-sync", "import-panel",
    "import-title", "import-summary", "import-spinner", "import-button",
    "cancel-import-button", "rebuild-button", "message"
].map((id) => [id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()),
    document.getElementById(id)]));

function isLeetCodeProblemTab() {
    return activeTab?.url?.startsWith("https://leetcode.com/problems/") === true;
}

function showMessage(message, isError = false) {
    elements.message.textContent = message;
    elements.message.classList.toggle("error", isError);
    elements.message.hidden = false;
}

function clearMessage() {
    elements.message.hidden = true;
    elements.message.classList.remove("error");
}

function formatTime(value) {
    if (!value) {
        return "";
    }

    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(new Date(value));
}

async function loadLeetCodeState() {
    [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
    });

    if (!isLeetCodeProblemTab()) {
        leetCodeData = null;
        renderLeetCodeState();
        return;
    }

    const response = await chrome.runtime.sendMessage({
        type: "LEETBRIDGE_GET_STORED_DATA"
    });

    leetCodeData = response?.ok ? response.data : null;
    renderLeetCodeState();
}

function renderLeetCodeState() {
    const connected = isLeetCodeProblemTab() && Boolean(leetCodeData?.username);
    const problem = leetCodeData?.problem;

    elements.leetcodeIndicator.classList.toggle("connected", connected);
    elements.leetcodeAccount.textContent = connected
        ? leetCodeData.username
        : isLeetCodeProblemTab() ? "Sign in required" : "Not detected";
    elements.currentProblem.textContent = problem?.title
        ? `#${problem.number ?? "?"} ${problem.title} · ${problem.difficulty ?? "Unknown"}`
        : isLeetCodeProblemTab()
            ? "Loading current problem"
            : "Open a LeetCode problem to begin";
    elements.leetcodeButton.textContent = isLeetCodeProblemTab()
        ? "Refresh"
        : "Open";
}

async function loadGitHubStatus() {
    const response = await chrome.runtime.sendMessage({
        type: "GITHUB_GET_STATUS"
    });

    if (!response?.ok) {
        throw new Error(response?.error ?? "Unable to read GitHub status");
    }

    githubStatus = response.status;
    renderGitHubState();
    renderSettings();
    renderLastSync();
    renderImportState();
    renderOnboarding();

    if (githubStatus.initializationError) {
        showMessage(
            `Repository setup needs attention: ${githubStatus.initializationError}`,
            true
        );
    }
}

function renderGitHubState() {
    const connected = Boolean(githubStatus?.repository);

    elements.githubIndicator.classList.toggle("connected", connected);
    elements.githubAccount.textContent = connected
        ? githubStatus.githubUsername ?? githubStatus.repository.owner
        : githubStatus?.authenticated ? "Repository required" : "Not connected";
    elements.githubRepository.textContent = connected
        ? githubStatus.repository.fullName
        : "No repository selected";
    elements.githubButton.textContent = connected ? "Manage" : "Connect";
    elements.importButton.disabled = !connected || !isLeetCodeProblemTab();
    elements.rebuildButton.disabled = !connected;
}

function renderSettings() {
    elements.autoSyncToggle.checked = githubStatus?.settings?.autoSync !== false;
    elements.readmeToggle.checked = githubStatus?.settings?.updateReadme !== false;
}

function renderLastSync() {
    const sync = githubStatus?.lastSync;

    elements.lastSync.classList.remove("success", "error");

    if (!sync) {
        elements.lastSync.innerHTML = "<span class=\"sync-icon\">○</span>"
            + "<div><strong>No solutions synced yet</strong>"
            + "<span>Your next accepted solution will appear here.</span></div>";
        return;
    }

    const title = sync.ok
        ? sync.problemTitle ?? sync.path ?? "Solution synced"
        : "Sync needs attention";
    const detail = sync.ok
        ? `${sync.path} · ${formatTime(sync.syncedAt)}`
        : sync.error ?? "Unknown sync error";

    elements.lastSync.classList.add(sync.ok ? "success" : "error");
    elements.lastSync.replaceChildren();
    const icon = document.createElement("span");
    const copy = document.createElement("div");
    const strong = document.createElement("strong");
    const span = document.createElement("span");
    icon.className = "sync-icon";
    icon.textContent = sync.ok ? "✓" : "!";
    strong.textContent = title;
    span.textContent = detail;
    copy.append(strong, span);
    elements.lastSync.append(icon, copy);
}

function renderOnboarding() {
    const leetcodeReady = Boolean(leetCodeData?.username);
    const githubReady = githubStatus?.authenticated === true;
    const repositoryReady = Boolean(githubStatus?.repositoryState?.initialized);

    elements.onboardingPanel.hidden = leetcodeReady && repositoryReady;
    elements.leetcodeStep.classList.toggle("complete", leetcodeReady);
    elements.githubStep.classList.toggle("complete", githubReady);
    elements.repositoryStep.classList.toggle("complete", repositoryReady);
    elements.onboardingButton.textContent = leetcodeReady
        ? "Connect GitHub"
        : "Open LeetCode";
}

function renderImportState() {
    const state = githubStatus?.importState;
    const running = state?.status === "running";

    clearTimeout(importRefreshTimer);
    elements.importPanel.hidden = !state;
    elements.importSpinner.hidden = !running;
    elements.cancelImportButton.hidden = !running;
    elements.importButton.disabled = running
        || !githubStatus?.repository
        || !isLeetCodeProblemTab();
    elements.rebuildButton.disabled = running || !githubStatus?.repository;

    if (!state) {
        return;
    }

    const titles = {
        running: state.phase === "rebuilding_readme"
            ? "Rebuilding repository index"
            : "Importing previous solutions",
        complete: "Historical import complete",
        complete_with_errors: "Import completed with warnings",
        canceled: "Historical import canceled",
        failed: "Historical import stopped"
    };
    elements.importTitle.textContent = titles[state.status] ?? "Historical import";
    elements.importSummary.textContent = running
        ? `${state.scannedCount ?? 0} submissions scanned · `
            + `${state.syncedCount ?? 0} synced · ${state.skippedCount ?? 0} skipped`
        : state.lastError
            ? state.lastError
            : `${state.syncedCount ?? 0} synced · ${state.skippedCount ?? 0} skipped`
                + ` · ${state.failedCount ?? 0} failed`;
    elements.importButton.textContent = ["failed", "canceled"].includes(state.status)
        ? "Resume import"
        : "Import previous solutions";

    if (running) {
        importRefreshTimer = setTimeout(() => {
            loadGitHubStatus().catch((error) => showMessage(error.message, true));
        }, 1200);
    }
}

async function updateSettings() {
    const response = await chrome.runtime.sendMessage({
        type: "LEETBRIDGE_UPDATE_SETTINGS",
        settings: {
            autoSync: elements.autoSyncToggle.checked,
            updateReadme: elements.readmeToggle.checked
        }
    });

    if (!response?.ok) {
        throw new Error(response?.error ?? "Could not save settings");
    }

    githubStatus.settings = response.settings;
    showMessage("Settings saved.");
}

async function startImport() {
    if (!isLeetCodeProblemTab()) {
        throw new Error("Open a LeetCode problem before importing");
    }

    elements.importButton.disabled = true;
    clearMessage();
    const response = await chrome.runtime.sendMessage({
        type: "LEETBRIDGE_START_IMPORT",
        tabId: activeTab.id
    });

    if (!response?.ok) {
        throw new Error(response?.error ?? "Could not start historical import");
    }

    githubStatus.importState = response.importState;
    renderImportState();
}

async function rebuildReadme() {
    elements.rebuildButton.disabled = true;
    elements.rebuildButton.textContent = "Rebuilding...";
    clearMessage();

    try {
        const response = await chrome.runtime.sendMessage({
            type: "GITHUB_REBUILD_README"
        });

        if (!response?.ok) {
            throw new Error(response?.error ?? "Could not rebuild README");
        }

        const count = response.result.problemCount;
        showMessage(`README rebuilt from ${count} solution ${count === 1 ? "folder" : "folders"}.`);
    } finally {
        elements.rebuildButton.textContent = "Rebuild README";
        elements.rebuildButton.disabled = !githubStatus?.repository;
    }
}

async function openLeetCode() {
    if (isLeetCodeProblemTab()) {
        await chrome.tabs.reload(activeTab.id);
    } else {
        await chrome.tabs.create({ url: "https://leetcode.com/problemset/" });
    }

    window.close();
}

async function openGitHubConnection() {
    await chrome.tabs.create({
        url: chrome.runtime.getURL("github/connect.html")
    });
    window.close();
}

elements.leetcodeButton.addEventListener("click", openLeetCode);
elements.githubButton.addEventListener("click", openGitHubConnection);
elements.onboardingButton.addEventListener("click", () => {
    if (!leetCodeData?.username) {
        openLeetCode();
    } else {
        openGitHubConnection();
    }
});
elements.autoSyncToggle.addEventListener("change", () => {
    updateSettings().catch((error) => showMessage(error.message, true));
});
elements.readmeToggle.addEventListener("change", () => {
    updateSettings().catch((error) => showMessage(error.message, true));
});
elements.importButton.addEventListener("click", () => {
    startImport().catch((error) => {
        elements.importButton.disabled = false;
        showMessage(error.message, true);
    });
});
elements.cancelImportButton.addEventListener("click", async () => {
    const response = await chrome.runtime.sendMessage({
        type: "LEETBRIDGE_CANCEL_IMPORT"
    });

    if (response?.ok) {
        githubStatus.importState = response.importState;
        renderImportState();
    }
});
elements.rebuildButton.addEventListener("click", () => {
    rebuildReadme().catch((error) => showMessage(error.message, true));
});

Promise.all([loadLeetCodeState(), loadGitHubStatus()])
    .then(() => {
        renderGitHubState();
        renderImportState();
        renderOnboarding();
    })
    .catch((error) => showMessage(error.message, true));
