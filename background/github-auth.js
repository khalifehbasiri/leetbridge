const GITHUB_AUTH_KEY = "githubAuth";
const GITHUB_DEVICE_FLOW_KEY = "githubDeviceFlow";
const GITHUB_REPOSITORY_KEY = "githubRepository";
const GITHUB_LAST_SYNC_KEY = "githubLastSync";
const GITHUB_PROFILE_KEY = "githubProfile";

async function postGitHubOAuthForm(parameters) {
    const response = await fetch(
        "https://github.com/login/oauth/access_token",
        {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams(parameters)
        }
    );
    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.error_description ?? "GitHub authentication failed");
    }

    return result;
}

async function startGitHubDeviceFlow() {
    if (!isGitHubConfigured()) {
        throw new Error("GitHub connection is unavailable in this build");
    }

    const response = await fetch("https://github.com/login/device/code", {
        method: "POST",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
            client_id: GITHUB_CONFIG.clientId
        })
    });
    const result = await response.json();

    if (!response.ok || result.error) {
        throw new Error(
            result.error_description ?? "Could not start GitHub authentication"
        );
    }

    const verificationUrl = new URL(result.verification_uri);

    if (
        verificationUrl.origin !== "https://github.com"
        || verificationUrl.pathname !== "/login/device"
    ) {
        throw new Error("GitHub returned an unexpected authorization URL");
    }

    const deviceFlow = {
        deviceCode: result.device_code,
        userCode: result.user_code,
        verificationUri: verificationUrl.href,
        interval: result.interval ?? 5,
        expiresAt: Date.now() + (result.expires_in * 1000)
    };

    await chrome.storage.session.set({
        [GITHUB_DEVICE_FLOW_KEY]: deviceFlow
    });

    return {
        userCode: deviceFlow.userCode,
        verificationUri: deviceFlow.verificationUri,
        interval: deviceFlow.interval,
        expiresAt: deviceFlow.expiresAt
    };
}

async function pollGitHubDeviceFlow() {
    const stored = await chrome.storage.session.get(GITHUB_DEVICE_FLOW_KEY);
    const deviceFlow = stored[GITHUB_DEVICE_FLOW_KEY];

    if (!deviceFlow) {
        throw new Error("No GitHub authentication is in progress");
    }

    if (Date.now() >= deviceFlow.expiresAt) {
        await chrome.storage.session.remove(GITHUB_DEVICE_FLOW_KEY);
        throw new Error("The GitHub authorization code expired");
    }

    const result = await postGitHubOAuthForm({
        client_id: GITHUB_CONFIG.clientId,
        device_code: deviceFlow.deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code"
    });

    if (result.error === "authorization_pending") {
        return {
            status: "pending",
            interval: deviceFlow.interval
        };
    }

    if (result.error === "slow_down") {
        deviceFlow.interval += 5;
        await chrome.storage.session.set({
            [GITHUB_DEVICE_FLOW_KEY]: deviceFlow
        });
        return {
            status: "pending",
            interval: deviceFlow.interval
        };
    }

    if (result.error) {
        await chrome.storage.session.remove(GITHUB_DEVICE_FLOW_KEY);
        throw new Error(result.error_description ?? result.error);
    }

    const auth = createStoredGitHubAuth(result);

    await chrome.storage.local.set({
        [GITHUB_AUTH_KEY]: auth
    });
    await chrome.storage.session.remove(GITHUB_DEVICE_FLOW_KEY);

    return { status: "complete" };
}

function createStoredGitHubAuth(result) {
    const expiresIn = Number(result.expires_in ?? 0);
    const refreshExpiresIn = Number(result.refresh_token_expires_in ?? 0);

    return {
        accessToken: result.access_token,
        refreshToken: result.refresh_token ?? null,
        expiresAt: expiresIn ? Date.now() + (expiresIn * 1000) : null,
        refreshTokenExpiresAt: refreshExpiresIn
            ? Date.now() + (refreshExpiresIn * 1000)
            : null,
        tokenType: result.token_type ?? "bearer"
    };
}

async function getValidGitHubToken(forceRefresh = false) {
    const stored = await chrome.storage.local.get(GITHUB_AUTH_KEY);
    const auth = stored[GITHUB_AUTH_KEY];

    if (!auth?.accessToken) {
        throw new Error("GitHub is not connected");
    }

    const expiresSoon = auth.expiresAt
        && Date.now() >= auth.expiresAt - (5 * 60 * 1000);

    if (!forceRefresh && !expiresSoon) {
        return auth.accessToken;
    }

    if (!auth.refreshToken) {
        throw new Error("GitHub authorization expired. Connect again.");
    }

    if (
        auth.refreshTokenExpiresAt
        && Date.now() >= auth.refreshTokenExpiresAt
    ) {
        throw new Error("GitHub authorization expired. Connect again.");
    }

    const result = await postGitHubOAuthForm({
        client_id: GITHUB_CONFIG.clientId,
        grant_type: "refresh_token",
        refresh_token: auth.refreshToken
    });

    if (result.error || !result.access_token) {
        throw new Error(
            result.error_description ?? "Could not refresh GitHub authorization"
        );
    }

    const refreshedAuth = createStoredGitHubAuth(result);

    await chrome.storage.local.set({
        [GITHUB_AUTH_KEY]: refreshedAuth
    });

    return refreshedAuth.accessToken;
}

async function disconnectGitHub() {
    await chrome.storage.local.remove([
        GITHUB_AUTH_KEY,
        GITHUB_REPOSITORY_KEY,
        GITHUB_LAST_SYNC_KEY,
        GITHUB_PROFILE_KEY,
        GITHUB_REPOSITORY_STATE_KEY,
        LEETBRIDGE_IMPORT_STATE_KEY,
        LEETBRIDGE_SYNCED_SUBMISSIONS_KEY
    ]);
    await chrome.storage.session.remove(GITHUB_DEVICE_FLOW_KEY);
}
