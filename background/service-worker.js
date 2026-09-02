importScripts(
    "github-config.js",
    "settings.js",
    "github-auth.js",
    "github-readme.js",
    "github-api.js",
    "importer.js"
);

const CURRENT_DATA_KEY = "leetBridgeCurrent";
const LEGACY_ACCEPTED_SOLUTIONS_KEY = "leetBridgeAcceptedSolutions";
const MAX_SOLUTION_BYTES = 1_000_000;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const trustedStorageReady = Promise.all([
    chrome.storage.local.setAccessLevel({
        accessLevel: "TRUSTED_CONTEXTS"
    }),
    chrome.storage.session.setAccessLevel({
        accessLevel: "TRUSTED_CONTEXTS"
    })
]);

trustedStorageReady.catch((error) => {
    console.error("LeetBridge could not secure extension storage:", error);
});

chrome.runtime.onInstalled.addListener(() => {
    trustedStorageReady
        .then(() => chrome.storage.local.remove(LEGACY_ACCEPTED_SOLUTIONS_KEY))
        .catch((error) => {
            console.error("LeetBridge could not secure extension storage:", error);
        });
});

function isLeetCodeSender(sender) {
    try {
        const url = new URL(sender.tab?.url);

        return sender.id === chrome.runtime.id
            && url.origin === "https://leetcode.com"
            && url.pathname.startsWith("/problems/");
    } catch {
        return false;
    }
}

function isExtensionPageSender(sender) {
    return sender.id === chrome.runtime.id
        && sender.url?.startsWith(chrome.runtime.getURL("")) === true;
}

function getSenderProblemSlug(sender) {
    if (!isLeetCodeSender(sender)) {
        return null;
    }

    const parts = new URL(sender.tab.url).pathname.split("/").filter(Boolean);

    return parts[0] === "problems" ? parts[1] ?? null : null;
}

function isOptionalString(value, maxLength) {
    return value == null
        || (typeof value === "string" && value.length <= maxLength);
}

function isValidProblemData(data, sender, requireCurrentProblem = true) {
    const code = data?.submission?.code;
    const codeSize = typeof code === "string"
        ? new TextEncoder().encode(code).byteLength
        : 0;

    return Boolean(
        data
        && typeof data === "object"
        && data.problem
        && (
            !requireCurrentProblem
            || data.problem.slug === getSenderProblemSlug(sender)
        )
        && SLUG_PATTERN.test(data.problem.slug)
        && (
            data.problem.number == null
            || (Number.isInteger(data.problem.number) && data.problem.number > 0)
        )
        && isOptionalString(data.problem.title, 200)
        && (
            data.problem.difficulty == null
            || ["Easy", "Medium", "Hard"].includes(data.problem.difficulty)
        )
        && isOptionalString(data.username, 100)
        && data.submission
        && typeof data.submission === "object"
        && isOptionalString(data.submission.submissionId, 100)
        && isOptionalString(data.submission.language, 50)
        && isOptionalString(data.submission.status, 100)
        && typeof data.submission.accepted === "boolean"
        && (code == null || typeof code === "string")
        && codeSize <= MAX_SOLUTION_BYTES
        && (
            data.submission.accepted === false
            || (
                data.submission.status?.toLowerCase() === "accepted"
                && typeof code === "string"
                && code.length > 0
                && typeof data.submission.language === "string"
                && data.submission.language.length > 0
            )
        )
    );
}

async function storeProblemData(data) {
    await trustedStorageReady;
    await chrome.storage.local.set({
        [CURRENT_DATA_KEY]: data
    });

    if (data.submission.accepted !== true) {
        return;
    }

    if (typeof data.submission.code !== "string") {
        return;
    }

    const settings = await getLeetBridgeSettings();

    if (!settings.autoSync) {
        return;
    }

    try {
        await syncAcceptedSolutionToGitHub(data, {
            updateProblemReadme: settings.updateReadme,
            updateRootReadme: settings.updateReadme
        });
    } catch (error) {
        await recordGitHubSyncFailure(error);
        console.warn("LeetBridge could not sync to GitHub:", error);
    }
}

function sendAsyncResponse(promise, sendResponse) {
    promise
        .then((result) => sendResponse({
            ok: true,
            ...result
        }))
        .catch((error) => sendResponse({
            ok: false,
            error: error.message
        }));

    return true;
}

function sendTrustedResponse(action, sendResponse) {
    return sendAsyncResponse(trustedStorageReady.then(action), sendResponse);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "LEETBRIDGE_STORE_DATA") {
        if (!isValidProblemData(message.data, sender)) {
            sendResponse({ ok: false, error: "Invalid problem data" });
            return false;
        }

        storeProblemData(message.data)
            .then(() => sendResponse({ ok: true }))
            .catch((error) => sendResponse({
                ok: false,
                error: error.message
            }));
        return true;
    }

    if (message?.type === "LEETBRIDGE_CLEAR_CURRENT") {
        if (!isLeetCodeSender(sender)) {
            sendResponse({ ok: false, error: "Invalid sender" });
            return false;
        }

        trustedStorageReady
            .then(() => chrome.storage.local.remove(CURRENT_DATA_KEY))
            .then(() => sendResponse({ ok: true }))
            .catch((error) => sendResponse({
                ok: false,
                error: error.message
            }));
        return true;
    }

    if (message?.type === "LEETBRIDGE_GET_STORED_DATA") {
        if (!isExtensionPageSender(sender)) {
            sendResponse({ ok: false, error: "Invalid sender" });
            return false;
        }

        trustedStorageReady
            .then(() => chrome.storage.local.get(CURRENT_DATA_KEY))
            .then((stored) => sendResponse({
                ok: true,
                data: stored[CURRENT_DATA_KEY] ?? null
            }))
            .catch((error) => sendResponse({
                ok: false,
                error: error.message
            }));
        return true;
    }

    if (message?.type === "GITHUB_GET_STATUS") {
        if (!isExtensionPageSender(sender)) {
            sendResponse({ ok: false, error: "Invalid sender" });
            return false;
        }

        return sendTrustedResponse(
            () => getGitHubConnectionStatus().then((status) => ({ status })),
            sendResponse
        );
    }

    if (message?.type === "GITHUB_START_DEVICE_FLOW") {
        if (!isExtensionPageSender(sender)) {
            sendResponse({ ok: false, error: "Invalid sender" });
            return false;
        }

        return sendTrustedResponse(
            () => startGitHubDeviceFlow()
                .then((deviceFlow) => ({ deviceFlow })),
            sendResponse
        );
    }

    if (message?.type === "GITHUB_POLL_DEVICE_FLOW") {
        if (!isExtensionPageSender(sender)) {
            sendResponse({ ok: false, error: "Invalid sender" });
            return false;
        }

        return sendTrustedResponse(
            () => pollGitHubDeviceFlow().then((auth) => ({ auth })),
            sendResponse
        );
    }

    if (message?.type === "GITHUB_LIST_REPOSITORIES") {
        if (!isExtensionPageSender(sender)) {
            sendResponse({ ok: false, error: "Invalid sender" });
            return false;
        }

        return sendTrustedResponse(
            () => listGitHubRepositories()
                .then((repositories) => ({ repositories })),
            sendResponse
        );
    }

    if (message?.type === "GITHUB_SELECT_REPOSITORY") {
        if (!isExtensionPageSender(sender)) {
            sendResponse({ ok: false, error: "Invalid sender" });
            return false;
        }

        return sendTrustedResponse(
            () => queueImportOperation(async () => {
                await cancelHistoricalImport();
                const repository = await selectGitHubRepository(message.repositoryId, message.installationId);
                return { repository };
            }),
            sendResponse
        );
    }

    if (message?.type === "LEETBRIDGE_UPDATE_SETTINGS") {
        if (!isExtensionPageSender(sender)) {
            sendResponse({ ok: false, error: "Invalid sender" });
            return false;
        }

        return sendTrustedResponse(
            () => updateLeetBridgeSettings(message.settings)
                .then((settings) => ({ settings })),
            sendResponse
        );
    }

    if (message?.type === "GITHUB_REBUILD_README") {
        if (!isExtensionPageSender(sender)) {
            sendResponse({ ok: false, error: "Invalid sender" });
            return false;
        }

        return sendTrustedResponse(async () => {
            const stored = await chrome.storage.local.get([
                GITHUB_REPOSITORY_KEY,
                CURRENT_DATA_KEY
            ]);
            const repository = stored[GITHUB_REPOSITORY_KEY];

            if (!repository) {
                throw new Error("Connect a GitHub repository first");
            }

            const result = await queueGitHubOperation(() => (
                rebuildRepositoryReadme(
                    repository,
                    stored[CURRENT_DATA_KEY]?.username ?? null
                )
            ));

            return { result };
        }, sendResponse);
    }

    if (message?.type === "LEETBRIDGE_START_IMPORT") {
        if (!isExtensionPageSender(sender)) {
            sendResponse({ ok: false, error: "Invalid sender" });
            return false;
        }

        return sendTrustedResponse(
            () => queueImportOperation(() => startHistoricalImport(message.tabId, message.restart === true))
                .then((importState) => ({ importState })),
            sendResponse
        );
    }

    if (message?.type === "LEETBRIDGE_CANCEL_IMPORT") {
        if (!isExtensionPageSender(sender)) {
            sendResponse({ ok: false, error: "Invalid sender" });
            return false;
        }

        return sendTrustedResponse(
            () => queueImportOperation(cancelHistoricalImport)
                .then((importState) => ({ importState })),
            sendResponse
        );
    }

    const historyHandlers = {
        LEETBRIDGE_IMPORT_INITIALIZE: initializeHistoricalImport,
        LEETBRIDGE_IMPORT_ITEM: processHistoricalImportItem,
        LEETBRIDGE_IMPORT_CHECKPOINT: checkpointHistoricalImport,
        LEETBRIDGE_IMPORT_PROGRESS: progressHistoricalImport,
        LEETBRIDGE_IMPORT_HEARTBEAT: progressHistoricalImport,
        LEETBRIDGE_IMPORT_COMPLETE: completeHistoricalImport,
        LEETBRIDGE_IMPORT_ERROR: failHistoricalImport
    };
    if (Object.hasOwn(historyHandlers, message?.type)) {
        if (!isLeetCodeSender(sender)) {
            sendResponse({ ok: false, error: "Invalid sender" });
            return false;
        }

        return sendTrustedResponse(
            () => queueImportOperation(() => historyHandlers[message.type](message, sender))
                .then(() => ({})),
            sendResponse
        );
    }

    if (message?.type === "GITHUB_DISCONNECT") {
        if (!isExtensionPageSender(sender)) {
            sendResponse({ ok: false, error: "Invalid sender" });
            return false;
        }

        return sendTrustedResponse(
            () => queueImportOperation(async () => {
                await cancelHistoricalImport();
                await disconnectGitHub();
                return {};
            }),
            sendResponse
        );
    }

    return false;
});
