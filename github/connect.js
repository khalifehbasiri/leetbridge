let installUrl = null;
let pollTimeout = null;

const messageElement = document.getElementById("message");
const unavailablePanel = document.getElementById("unavailable-panel");
const setupPanel = document.getElementById("setup-panel");
const devicePanel = document.getElementById("device-panel");
const repositoryPanel = document.getElementById("repository-panel");
const connectedPanel = document.getElementById("connected-panel");
const repositorySelect = document.getElementById("repository-select");

function showMessage(message, isError = false) {
    messageElement.textContent = message;
    messageElement.classList.toggle("error", isError);
}

function showOnly(panel) {
    for (const candidate of [
        unavailablePanel,
        setupPanel,
        devicePanel,
        repositoryPanel,
        connectedPanel
    ]) {
        candidate.hidden = candidate !== panel;
    }
}

async function loadConnectionStatus() {
    const response = await chrome.runtime.sendMessage({
        type: "GITHUB_GET_STATUS"
    });

    if (!response?.ok) {
        throw new Error(response?.error ?? "Could not read GitHub status");
    }

    const status = response.status;
    installUrl = status.installUrl;

    if (!status.configured) {
        showOnly(unavailablePanel);
        showMessage("GitHub connection is unavailable in this build.", true);
        return;
    }

    if (status.repository) {
        document.getElementById("connected-repository").textContent =
            status.repository.fullName;
        showOnly(connectedPanel);
        showMessage("GitHub is connected.");
        return;
    }

    if (status.authenticated) {
        await loadRepositories();
        return;
    }

    showOnly(setupPanel);
    showMessage("Choose a repository on GitHub, then connect your account.");
}

async function startAuthentication() {
    showMessage("Starting GitHub authentication...");
    const response = await chrome.runtime.sendMessage({
        type: "GITHUB_START_DEVICE_FLOW"
    });

    if (!response?.ok) {
        throw new Error(response?.error ?? "Could not start GitHub authentication");
    }

    const deviceFlow = response.deviceFlow;
    const codeButton = document.getElementById("user-code");
    const verificationLink = document.getElementById("verification-link");

    codeButton.textContent = deviceFlow.userCode;
    verificationLink.href = deviceFlow.verificationUri;
    showOnly(devicePanel);
    showMessage("Enter the displayed code on GitHub.");

    await navigator.clipboard.writeText(deviceFlow.userCode).catch(() => {});
    await chrome.tabs.create({ url: deviceFlow.verificationUri });
    schedulePoll(deviceFlow.interval);
}

function schedulePoll(interval) {
    clearTimeout(pollTimeout);
    pollTimeout = setTimeout(pollAuthentication, interval * 1000);
}

async function pollAuthentication() {
    try {
        const response = await chrome.runtime.sendMessage({
            type: "GITHUB_POLL_DEVICE_FLOW"
        });

        if (!response?.ok) {
            throw new Error(response?.error ?? "GitHub authentication failed");
        }

        if (response.auth.status === "pending") {
            schedulePoll(response.auth.interval);
            return;
        }

        showMessage("GitHub authenticated. Loading repositories...");
        await loadRepositories();
    } catch (error) {
        showMessage(error.message, true);
        showOnly(setupPanel);
    }
}

async function loadRepositories() {
    showMessage("Loading repositories available to LeetBridge...");
    const response = await chrome.runtime.sendMessage({
        type: "GITHUB_LIST_REPOSITORIES"
    });

    if (!response?.ok) {
        throw new Error(response?.error ?? "Could not load GitHub repositories");
    }

    repositorySelect.replaceChildren();

    for (const repository of response.repositories) {
        const option = document.createElement("option");
        option.value = `${repository.installationId}:${repository.id}`;
        option.textContent = repository.fullName
            + (repository.private ? " (private)" : "");
        repositorySelect.append(option);
    }

    showOnly(repositoryPanel);

    if (response.repositories.length === 0) {
        showMessage(
            "No repositories are available. Grant LeetBridge access on GitHub, then refresh.",
            true
        );
        return;
    }

    showMessage("Choose the repository that will receive accepted solutions.");
}

async function saveRepository() {
    if (!repositorySelect.value) {
        showMessage("Select a repository first.", true);
        return;
    }

    const [installationId, repositoryId] = repositorySelect.value.split(":");
    const response = await chrome.runtime.sendMessage({
        type: "GITHUB_SELECT_REPOSITORY",
        installationId,
        repositoryId
    });

    if (!response?.ok) {
        throw new Error(response?.error ?? "Could not select the repository");
    }

    await loadConnectionStatus();
}

async function disconnect() {
    const response = await chrome.runtime.sendMessage({
        type: "GITHUB_DISCONNECT"
    });

    if (!response?.ok) {
        throw new Error(response?.error ?? "Could not disconnect GitHub");
    }

    await loadConnectionStatus();
}

document.getElementById("install-button").addEventListener("click", async () => {
    if (installUrl) {
        await chrome.tabs.create({ url: installUrl });
    }
});

document.getElementById("authenticate-button").addEventListener("click", () => {
    startAuthentication().catch((error) => showMessage(error.message, true));
});

document.getElementById("user-code").addEventListener("click", async (event) => {
    await navigator.clipboard.writeText(event.currentTarget.textContent);
    showMessage("Authorization code copied.");
});

document.getElementById("refresh-repositories-button").addEventListener(
    "click",
    () => loadRepositories().catch((error) => showMessage(error.message, true))
);

document.getElementById("save-repository-button").addEventListener(
    "click",
    () => saveRepository().catch((error) => showMessage(error.message, true))
);

document.getElementById("disconnect-button").addEventListener("click", () => {
    disconnect().catch((error) => showMessage(error.message, true));
});

loadConnectionStatus().catch((error) => showMessage(error.message, true));
