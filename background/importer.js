let activeHistoricalImport = null;

function isImportingState(state) {
    return state?.status === "running";
}

async function updateHistoricalImportState(changes) {
    const current = await getLeetBridgeImportState();
    const next = {
        ...(current ?? {}),
        ...changes,
        updatedAt: new Date().toISOString()
    };

    return setLeetBridgeImportState(next);
}

async function startHistoricalImport(tabId) {
    const currentState = await getLeetBridgeImportState();

    if (activeHistoricalImport && isImportingState(currentState)) {
        throw new Error("A historical import is already running");
    }

    const stored = await chrome.storage.local.get(GITHUB_REPOSITORY_KEY);
    const repository = stored[GITHUB_REPOSITORY_KEY];

    if (!repository) {
        throw new Error("Connect a GitHub repository before importing");
    }

    const tab = await chrome.tabs.get(tabId);
    const url = new URL(tab.url ?? "");

    if (
        url.origin !== "https://leetcode.com"
        || !url.pathname.startsWith("/problems/")
    ) {
        throw new Error("Open a LeetCode problem before importing");
    }

    const requestId = crypto.randomUUID();
    const state = {
        requestId,
        tabId,
        repository: repository.fullName,
        status: "running",
        phase: "scanning",
        scannedCount: 0,
        candidateCount: 0,
        processedCount: 0,
        syncedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        lastError: null,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    activeHistoricalImport = {
        requestId,
        tabId,
        canceled: false
    };
    await setLeetBridgeImportState(state);

    try {
        const response = await chrome.tabs.sendMessage(tabId, {
            type: "LEETBRIDGE_IMPORT_HISTORY",
            requestId
        });

        if (!response?.ok) {
            throw new Error("The LeetCode page did not start the import");
        }
    } catch (error) {
        activeHistoricalImport = null;
        await updateHistoricalImportState({
            status: "failed",
            phase: "stopped",
            lastError: `${error.message}. Refresh the LeetCode tab and try again.`
        });
        throw error;
    }

    return state;
}

async function assertActiveHistoricalImport(message, sender) {
    if (!activeHistoricalImport) {
        const state = await getLeetBridgeImportState();

        if (
            state?.status === "running"
            && state.requestId === message.requestId
            && state.tabId === sender.tab?.id
        ) {
            activeHistoricalImport = {
                requestId: state.requestId,
                tabId: state.tabId,
                canceled: false
            };
        }
    }

    if (
        !activeHistoricalImport
        || activeHistoricalImport.requestId !== message.requestId
        || activeHistoricalImport.tabId !== sender.tab?.id
    ) {
        throw new Error("This historical import is no longer active");
    }
}

async function processHistoricalImportBatch(message, sender) {
    await assertActiveHistoricalImport(message, sender);

    if (activeHistoricalImport.canceled) {
        return getLeetBridgeImportState();
    }

    const settings = await getLeetBridgeSettings();
    const state = await updateHistoricalImportState({
        phase: "syncing",
        scannedCount: Number(message.scannedCount ?? 0),
        candidateCount: Number(message.candidateCount ?? 0)
    });
    const counts = {
        processedCount: state.processedCount ?? 0,
        syncedCount: state.syncedCount ?? 0,
        skippedCount: state.skippedCount ?? 0,
        failedCount: state.failedCount ?? 0,
        lastError: state.lastError ?? null
    };

    for (const submission of message.submissions ?? []) {
        if (activeHistoricalImport.canceled) {
            break;
        }

        counts.processedCount += 1;

        if (!isValidProblemData(submission, sender, false)) {
            counts.failedCount += 1;
            counts.lastError = "LeetCode returned an invalid submission record";
            continue;
        }

        try {
            const result = await syncAcceptedSolutionToGitHub(submission, {
                updateProblemReadme: settings.updateReadme,
                updateRootReadme: false
            });

            if (result.skipped) {
                counts.skippedCount += 1;
            } else {
                counts.syncedCount += 1;
            }
        } catch (error) {
            counts.failedCount += 1;
            counts.lastError = error.message;
        }
    }

    return updateHistoricalImportState(counts);
}

async function completeHistoricalImport(message, sender) {
    await assertActiveHistoricalImport(message, sender);

    if (activeHistoricalImport.canceled) {
        return getLeetBridgeImportState();
    }

    const stored = await chrome.storage.local.get([
        GITHUB_REPOSITORY_KEY,
        "leetBridgeCurrent"
    ]);
    const settings = await getLeetBridgeSettings();
    let rebuildResult = null;

    await updateHistoricalImportState({
        phase: settings.updateReadme ? "rebuilding_readme" : "finishing",
        scannedCount: Number(message.scannedCount ?? 0),
        candidateCount: Number(message.candidateCount ?? 0),
        truncated: message.truncated === true
    });

    try {
        if (settings.updateReadme && stored[GITHUB_REPOSITORY_KEY]) {
            rebuildResult = await queueGitHubOperation(() => (
                rebuildRepositoryReadme(
                    stored[GITHUB_REPOSITORY_KEY],
                    stored.leetBridgeCurrent?.username ?? null
                )
            ));
        }
    } catch (error) {
        activeHistoricalImport = null;
        return updateHistoricalImportState({
            status: "failed",
            phase: "stopped",
            lastError: `Solutions were imported, but the README rebuild failed: ${error.message}`
        });
    }

    const previous = await getLeetBridgeImportState();
    const finalState = await updateHistoricalImportState({
        status: previous?.failedCount > 0
            ? "complete_with_errors"
            : "complete",
        phase: "complete",
        completedAt: new Date().toISOString(),
        problemCount: rebuildResult?.problemCount ?? null
    });

    activeHistoricalImport = null;
    return finalState;
}

async function failHistoricalImport(message, sender) {
    if (
        activeHistoricalImport
        && message.requestId
        && activeHistoricalImport.requestId === message.requestId
        && activeHistoricalImport.tabId === sender.tab?.id
    ) {
        activeHistoricalImport = null;
    }

    return updateHistoricalImportState({
        status: "failed",
        phase: "stopped",
        lastError: message.error ?? "LeetCode history import failed"
    });
}

async function cancelHistoricalImport() {
    const state = await getLeetBridgeImportState();

    if (!isImportingState(state)) {
        return state;
    }

    if (activeHistoricalImport) {
        activeHistoricalImport.canceled = true;
    }

    if (state.tabId != null) {
        await chrome.tabs.sendMessage(state.tabId, {
            type: "LEETBRIDGE_CANCEL_IMPORT"
        }).catch(() => {});
    }

    activeHistoricalImport = null;

    return updateHistoricalImportState({
        status: "canceled",
        phase: "stopped",
        canceledAt: new Date().toISOString()
    });
}
