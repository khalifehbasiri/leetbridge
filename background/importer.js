// Serialize state changes so canceled or superseded runs cannot overwrite a new run.
let importOperationQueue = Promise.resolve();
const IMPORT_HEARTBEAT_TIMEOUT_MS = 120000;

function queueImportOperation(operation) {
    const result = importOperationQueue.then(operation);
    importOperationQueue = result.catch(() => {});
    return result;
}

function isImportingState(state) {
    return state?.status === "running";
}

async function updateHistoricalImportState(changes) {
    const current = await getLeetBridgeImportState();
    return setLeetBridgeImportState({
        ...(current ?? {}), ...changes, updatedAt: new Date().toISOString()
    });
}

async function getHistoricalImportStatus() {
    const state = await getLeetBridgeImportState();
    if (isImportingState(state) && Date.now() - (state.heartbeatAt ?? 0) > IMPORT_HEARTBEAT_TIMEOUT_MS) {
        return queueImportOperation(async () => {
            const latest = await getLeetBridgeImportState();
            if (!isImportingState(latest) || Date.now() - (latest.heartbeatAt ?? 0) <= IMPORT_HEARTBEAT_TIMEOUT_MS) return latest;
            return updateHistoricalImportState({
                status: "failed", phase: "stopped",
                lastError: "The LeetCode tab stopped responding. Refresh a problem tab and resume from saved progress."
            });
        });
    }
    return state;
}

async function startHistoricalImport(tabId, restart = false) {
    const current = await getLeetBridgeImportState();
    if (isImportingState(current) && Date.now() - (current.heartbeatAt ?? 0) <= IMPORT_HEARTBEAT_TIMEOUT_MS) {
        throw new Error("An import is already running. Cancel it before starting another.");
    }
    const stored = await chrome.storage.local.get([
        GITHUB_REPOSITORY_KEY, LEETBRIDGE_SYNCED_SUBMISSIONS_KEY
    ]);
    const repository = stored[GITHUB_REPOSITORY_KEY];
    if (!repository) throw new Error("Connect a GitHub repository before importing");
    const tab = await chrome.tabs.get(tabId);
    const url = new URL(tab.url ?? "");
    if (url.origin !== "https://leetcode.com" || !url.pathname.startsWith("/problems/")) {
        throw new Error("Open a LeetCode problem before importing");
    }
    const resume = !restart && current?.checkpoint
        && current.repository === repository.fullName
        && ["failed", "canceled", "running"].includes(current.status);
    const checkpoint = resume ? current.checkpoint : {
        offset: 0, lastKey: "", scannedCount: 0, seen: [],
        username: null, done: false, lastPageSignature: ""
    };
    const requestId = crypto.randomUUID();
    const state = {
        requestId, tabId, repository: repository.fullName,
        status: "running", phase: "scanning", checkpoint,
        scannedCount: checkpoint.scannedCount,
        candidateCount: resume ? current.candidateCount : 0,
        processedCount: resume ? current.processedCount : 0,
        syncedCount: resume ? current.syncedCount : 0,
        skippedCount: resume ? current.skippedCount : 0,
        failedCount: 0, lastError: null,
        // A fresh scan does not bypass a server-requested cooldown.
        retryAt: current?.retryAt > Date.now() ? current.retryAt : null,
        heartbeatAt: Date.now(),
        startedAt: resume ? current.startedAt : new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    await setLeetBridgeImportState(state);
    try {
        const response = await chrome.tabs.sendMessage(tabId, {
            type: "LEETBRIDGE_IMPORT_HISTORY", requestId, checkpoint,
            retryAt: state.retryAt,
            syncedSubmissionIds: stored[LEETBRIDGE_SYNCED_SUBMISSIONS_KEY]?.[repository.fullName] ?? []
        });
        if (!response?.ok) throw new Error("The LeetCode page did not start the import");
    } catch (error) {
        await updateHistoricalImportState({
            status: "failed", phase: "stopped",
            lastError: error.message + ". Refresh the LeetCode tab and try again."
        });
        throw error;
    }
    return state;
}

async function requireHistoricalImport(message, sender) {
    const state = await getLeetBridgeImportState();
    const stored = await chrome.storage.local.get(GITHUB_REPOSITORY_KEY);
    if (!isImportingState(state) || state.requestId !== message.requestId
        || state.tabId !== sender.tab?.id) {
        throw new Error("This historical import is no longer active");
    }
    if (stored[GITHUB_REPOSITORY_KEY]?.fullName !== state.repository) {
        throw new Error("The selected GitHub repository changed. Start a new import.");
    }
    return state;
}

async function initializeHistoricalImport(message, sender) {
    const state = await requireHistoricalImport(message, sender);
    if (typeof message.username !== "string" || !message.username || message.username.length > 100) {
        throw new Error("Sign in to LeetCode before importing");
    }
    if (state.checkpoint.username && state.checkpoint.username !== message.username) {
        throw new Error("This progress belongs to another LeetCode account. Use Start new import for the current account.");
    }
    return updateHistoricalImportState({
        checkpoint: { ...state.checkpoint, username: message.username }, heartbeatAt: Date.now()
    });
}

async function processHistoricalImportItem(message, sender) {
    const state = await requireHistoricalImport(message, sender);
    const data = message.data;
    const identity = data?.problem?.slug + ":" + String(data?.submission?.language).toLowerCase();
    if (!state.checkpoint.username || data?.username !== state.checkpoint.username
        || message.identity !== identity || !SLUG_PATTERN.test(data?.problem?.slug ?? "")
        || typeof data?.submission?.submissionId !== "string"
        || !/^\d{1,100}$/.test(data.submission.submissionId)
        || typeof data.submission.language !== "string" || data.submission.language.length > 50) {
        throw new Error("Invalid historical submission");
    }
    if (state.checkpoint.seen.includes(identity)) return state;
    const repository = { fullName: state.repository };
    const alreadySynced = await hasSyncedSubmission(repository, data.submission.submissionId);
    if (!alreadySynced && !isValidProblemData(data, sender, false)) {
        throw new Error("LeetCode returned an invalid submission record");
    }
    const settings = await getLeetBridgeSettings();
    await updateHistoricalImportState({ phase: "syncing", heartbeatAt: Date.now() });
    const result = alreadySynced ? { skipped: true }
        : await syncAcceptedSolutionToGitHub(data, {
            updateProblemReadme: settings.updateReadme, updateRootReadme: false
        });
    // Save an identity only after successful sync; a failed item remains resumable.
    return updateHistoricalImportState({
        checkpoint: { ...state.checkpoint, seen: [...state.checkpoint.seen, identity] },
        candidateCount: state.candidateCount + 1,
        processedCount: state.processedCount + 1,
        syncedCount: state.syncedCount + (result.skipped ? 0 : 1),
        skippedCount: state.skippedCount + (result.skipped ? 1 : 0),
        phase: "scanning", heartbeatAt: Date.now()
    });
}

async function checkpointHistoricalImport(message, sender) {
    const state = await requireHistoricalImport(message, sender);
    const point = message.checkpoint;
    if (!state.checkpoint.username || !point || !Number.isSafeInteger(point.offset)
        || point.offset < state.checkpoint.offset || point.offset > state.checkpoint.offset + 20
        || !Number.isSafeInteger(point.scannedCount) || point.scannedCount !== point.offset
        || typeof point.lastKey !== "string" || point.lastKey.length > 10000
        || typeof point.lastPageSignature !== "string" || point.lastPageSignature.length > 2500
        || typeof point.done !== "boolean" || (!point.done && point.offset === state.checkpoint.offset)) {
        throw new Error("Invalid history checkpoint");
    }
    return updateHistoricalImportState({
        checkpoint: {
            ...state.checkpoint,
            offset: point.offset, lastKey: point.lastKey,
            scannedCount: point.scannedCount, done: point.done,
            lastPageSignature: point.lastPageSignature
        },
        scannedCount: point.scannedCount, phase: "scanning", heartbeatAt: Date.now()
    });
}

async function progressHistoricalImport(message, sender) {
    await requireHistoricalImport(message, sender);
    const changes = { heartbeatAt: Date.now() };
    if (message.type === "LEETBRIDGE_IMPORT_PROGRESS") {
        if (!["waiting", "scanning"].includes(message.phase)
            || (message.retryAt !== null && (!Number.isFinite(message.retryAt)
                || message.retryAt < 0 || message.retryAt > Date.now() + 86400000))) {
            throw new Error("Invalid retry progress");
        }
        changes.phase = message.phase;
        changes.retryAt = message.retryAt;
    }
    return updateHistoricalImportState(changes);
}

async function completeHistoricalImport(message, sender) {
    const state = await requireHistoricalImport(message, sender);
    if (!state.checkpoint.done) throw new Error("Submission history has not finished scanning");
    const stored = await chrome.storage.local.get(GITHUB_REPOSITORY_KEY);
    const settings = await getLeetBridgeSettings();
    await updateHistoricalImportState({ phase: "rebuilding_readme", heartbeatAt: Date.now() });
    let result = null;
    if (settings.updateReadme) {
        result = await queueGitHubOperation(() => rebuildRepositoryReadme(
            stored[GITHUB_REPOSITORY_KEY], state.checkpoint.username
        ));
    }
    return updateHistoricalImportState({
        status: "complete", phase: "complete", lastError: null, retryAt: null,
        completedAt: new Date().toISOString(), checkpoint: null,
        problemCount: result?.problemCount ?? null
    });
}

async function failHistoricalImport(message, sender) {
    await requireHistoricalImport(message, sender);
    return updateHistoricalImportState({
        status: "failed", phase: "stopped",
        lastError: typeof message.error === "string" ? message.error.slice(0, 500) : "History import failed"
    });
}

async function cancelHistoricalImport() {
    const state = await getLeetBridgeImportState();
    if (!isImportingState(state)) return state;
    // State is invalidated before asking the page to stop. Late replies are rejected.
    const result = await updateHistoricalImportState({
        status: "canceled", phase: "stopped", canceledAt: new Date().toISOString()
    });
    await chrome.tabs.sendMessage(state.tabId, {
        type: "LEETBRIDGE_CANCEL_IMPORT", requestId: state.requestId
    }).catch(() => {});
    return result;
}
