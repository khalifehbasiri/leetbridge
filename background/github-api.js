function createGitHubHeaders(token, additionalHeaders = {}) {
    return {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": GITHUB_CONFIG.apiVersion,
        ...additionalHeaders
    };
}

async function githubApiRequest(path, options = {}, retry = true) {
    const token = await getValidGitHubToken();
    const response = await fetch(`${GITHUB_CONFIG.apiBaseUrl}${path}`, {
        ...options,
        headers: createGitHubHeaders(token, options.headers)
    });

    if (response.status === 401 && retry) {
        await getValidGitHubToken(true);
        return githubApiRequest(path, options, false);
    }

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const error = new Error(
            errorBody.message ?? `GitHub request failed (${response.status})`
        );
        error.status = response.status;
        throw error;
    }

    return response.status === 204 ? null : response.json();
}

async function listGitHubRepositories() {
    const installationResult = await githubApiRequest(
        "/user/installations?per_page=100"
    );
    const installations = installationResult.installations ?? [];
    const repositoryGroups = await Promise.all(
        installations.map(async (installation) => {
            const result = await githubApiRequest(
                `/user/installations/${installation.id}/repositories?per_page=100`
            );

            return (result.repositories ?? []).map((repository) => ({
                id: repository.id,
                installationId: installation.id,
                owner: repository.owner.login,
                name: repository.name,
                fullName: repository.full_name,
                private: repository.private,
                defaultBranch: repository.default_branch,
                permissions: repository.permissions ?? null
            }));
        })
    );

    return repositoryGroups.flat();
}

async function selectGitHubRepository(repositoryId, installationId) {
    const repositories = await listGitHubRepositories();
    const selected = repositories.find((repository) => (
        String(repository.id) === String(repositoryId)
        && String(repository.installationId) === String(installationId)
    ));

    if (!selected) {
        throw new Error("The selected repository is not available to LeetBridge");
    }

    await chrome.storage.local.set({
        [GITHUB_REPOSITORY_KEY]: selected
    });

    const current = await chrome.storage.local.get("leetBridgeCurrent");
    const currentData = current.leetBridgeCurrent;

    if (
        currentData?.submission?.accepted === true
        && typeof currentData.submission.code === "string"
    ) {
        try {
            await syncAcceptedSolutionToGitHub(currentData);
        } catch (error) {
            await recordGitHubSyncFailure(error);
        }
    }

    return selected;
}

async function getGitHubConnectionStatus() {
    const stored = await chrome.storage.local.get([
        GITHUB_AUTH_KEY,
        GITHUB_REPOSITORY_KEY,
        GITHUB_LAST_SYNC_KEY
    ]);

    const lastSync = stored[GITHUB_LAST_SYNC_KEY];

    return {
        configured: isGitHubConfigured(),
        authenticated: Boolean(stored[GITHUB_AUTH_KEY]?.accessToken),
        repository: stored[GITHUB_REPOSITORY_KEY] ?? null,
        lastSync: lastSync ? {
            ok: lastSync.ok,
            repository: lastSync.repository ?? null,
            path: lastSync.path ?? null,
            commitUrl: lastSync.commitUrl ?? null,
            error: lastSync.error ?? null,
            syncedAt: lastSync.syncedAt
        } : null,
        installUrl: getGitHubInstallUrl()
    };
}

function getSolutionFileExtension(language) {
    const extensions = {
        bash: "sh",
        c: "c",
        cpp: "cpp",
        csharp: "cs",
        dart: "dart",
        elixir: "ex",
        erlang: "erl",
        golang: "go",
        java: "java",
        javascript: "js",
        kotlin: "kt",
        mysql: "sql",
        php: "php",
        python: "py",
        python3: "py",
        racket: "rkt",
        ruby: "rb",
        rust: "rs",
        scala: "scala",
        swift: "swift",
        typescript: "ts"
    };

    return extensions[String(language ?? "").toLowerCase()] ?? "txt";
}

function encodeUtf8Base64(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = "";

    for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }

    return btoa(binary);
}

function encodeGitHubPath(path) {
    return path.split("/").map(encodeURIComponent).join("/");
}

function getCommitSubject(problem) {
    const label = String(problem.title ?? problem.slug)
        .replace(/[\r\n]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);

    return `Add accepted solution for ${label}`;
}

async function getSolutionFingerprint(repository, filePath, code) {
    const value = [repository.fullName, filePath, code].join("\n");
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(value)
    );

    return Array.from(new Uint8Array(digest), (byte) => (
        byte.toString(16).padStart(2, "0")
    )).join("");
}

async function syncAcceptedSolutionToGitHub(data) {
    const stored = await chrome.storage.local.get([
        GITHUB_REPOSITORY_KEY,
        GITHUB_LAST_SYNC_KEY
    ]);
    const repository = stored[GITHUB_REPOSITORY_KEY];

    if (!repository) {
        return { skipped: true, reason: "No GitHub repository selected" };
    }

    const extension = getSolutionFileExtension(data.submission.language);
    const folder = data.problem.number
        ? `${data.problem.number}-${data.problem.slug}`
        : data.problem.slug;
    const filePath = `${folder}/solution.${extension}`;
    const fingerprint = await getSolutionFingerprint(
        repository,
        filePath,
        data.submission.code
    );

    if (
        stored[GITHUB_LAST_SYNC_KEY]?.ok === true
        && stored[GITHUB_LAST_SYNC_KEY]?.fingerprint === fingerprint
    ) {
        return { skipped: true, reason: "Solution is already synced" };
    }

    const contentsPath = `/repos/${encodeURIComponent(repository.owner)}`
        + `/${encodeURIComponent(repository.name)}/contents/`
        + encodeGitHubPath(filePath);
    let existingFile = null;

    try {
        existingFile = await githubApiRequest(
            `${contentsPath}?ref=${encodeURIComponent(repository.defaultBranch)}`
        );
    } catch (error) {
        if (error.status !== 404) {
            throw error;
        }
    }

    const requestBody = {
        message: getCommitSubject(data.problem),
        content: encodeUtf8Base64(data.submission.code),
        branch: repository.defaultBranch
    };

    if (existingFile?.sha) {
        requestBody.sha = existingFile.sha;
    }

    const result = await githubApiRequest(contentsPath, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
    });
    const syncResult = {
        ok: true,
        repository: repository.fullName,
        path: filePath,
        commitUrl: result.commit?.html_url ?? null,
        fingerprint,
        syncedAt: new Date().toISOString()
    };

    await chrome.storage.local.set({
        [GITHUB_LAST_SYNC_KEY]: syncResult
    });

    return syncResult;
}

async function recordGitHubSyncFailure(error) {
    await chrome.storage.local.set({
        [GITHUB_LAST_SYNC_KEY]: {
            ok: false,
            error: error.message,
            syncedAt: new Date().toISOString()
        }
    });
}
