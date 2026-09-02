const LEETBRIDGE_SETTINGS_KEY = "leetBridgeSettings";
const LEETBRIDGE_IMPORT_STATE_KEY = "leetBridgeImportState";
const LEETBRIDGE_SYNCED_SUBMISSIONS_KEY = "leetBridgeSyncedSubmissions";
const GITHUB_REPOSITORY_STATE_KEY = "githubRepositoryState";

const DEFAULT_LEETBRIDGE_SETTINGS = Object.freeze({
    autoSync: true,
    updateReadme: true
});

async function getLeetBridgeSettings() {
    const stored = await chrome.storage.local.get(LEETBRIDGE_SETTINGS_KEY);

    return {
        ...DEFAULT_LEETBRIDGE_SETTINGS,
        ...(stored[LEETBRIDGE_SETTINGS_KEY] ?? {})
    };
}

async function updateLeetBridgeSettings(changes) {
    const current = await getLeetBridgeSettings();
    const next = { ...current };

    for (const key of ["autoSync", "updateReadme"]) {
        if (typeof changes?.[key] === "boolean") {
            next[key] = changes[key];
        }
    }

    await chrome.storage.local.set({
        [LEETBRIDGE_SETTINGS_KEY]: next
    });

    return next;
}

async function getLeetBridgeImportState() {
    const stored = await chrome.storage.local.get(
        LEETBRIDGE_IMPORT_STATE_KEY
    );

    return stored[LEETBRIDGE_IMPORT_STATE_KEY] ?? null;
}

async function setLeetBridgeImportState(state) {
    await chrome.storage.local.set({
        [LEETBRIDGE_IMPORT_STATE_KEY]: state
    });

    return state;
}
