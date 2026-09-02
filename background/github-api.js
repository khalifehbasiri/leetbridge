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

    const current = await chrome.storage.local.get("leetBridgeCurrent");
    const currentData = current.leetBridgeCurrent;
    const initialization = await queueGitHubOperation(() => (
        initializeGitHubRepository(
            selected,
            currentData?.username ?? null
        )
    ));

    await chrome.storage.local.set({
        [GITHUB_REPOSITORY_KEY]: selected,
        [GITHUB_REPOSITORY_STATE_KEY]: {
            repository: selected.fullName,
            initialized: true,
            initializedAt: new Date().toISOString(),
            readmePath: ROOT_README_PATH
        }
    });

    if (
        currentData?.submission?.accepted === true
        && typeof currentData.submission.code === "string"
    ) {
        try {
            const settings = await getLeetBridgeSettings();

            if (settings.autoSync) {
                await syncAcceptedSolutionToGitHub(currentData, {
                    updateProblemReadme: settings.updateReadme,
                    updateRootReadme: settings.updateReadme
                });
            }
        } catch (error) {
            await recordGitHubSyncFailure(error);
        }
    }

    return { ...selected, initialization };
}

async function getGitHubConnectionStatus() {
    const stored = await chrome.storage.local.get([
        GITHUB_AUTH_KEY,
        GITHUB_REPOSITORY_KEY,
        GITHUB_LAST_SYNC_KEY,
        GITHUB_PROFILE_KEY,
        GITHUB_REPOSITORY_STATE_KEY
    ]);
    const authenticated = Boolean(stored[GITHUB_AUTH_KEY]?.accessToken);
    const lastSync = stored[GITHUB_LAST_SYNC_KEY];
    const [settings, importState] = await Promise.all([
        getLeetBridgeSettings(),
        getLeetBridgeImportState()
    ]);
    let githubUsername = stored[GITHUB_PROFILE_KEY]?.login ?? null;
    let repositoryState = stored[GITHUB_REPOSITORY_STATE_KEY] ?? null;
    let initializationError = null;

    if (authenticated && !githubUsername) {
        try {
            const viewer = await githubApiRequest("/user");
            githubUsername = viewer.login ?? null;
            await chrome.storage.local.set({
                [GITHUB_PROFILE_KEY]: {
                    login: githubUsername
                }
            });
        } catch {
            githubUsername = null;
        }
    }

    if (authenticated && stored[GITHUB_REPOSITORY_KEY] && !repositoryState) {
        try {
            const current = await chrome.storage.local.get("leetBridgeCurrent");

            await queueGitHubOperation(() => initializeGitHubRepository(
                stored[GITHUB_REPOSITORY_KEY],
                current.leetBridgeCurrent?.username ?? null
            ));
            repositoryState = {
                repository: stored[GITHUB_REPOSITORY_KEY].fullName,
                initialized: true,
                initializedAt: new Date().toISOString(),
                readmePath: ROOT_README_PATH
            };
            await chrome.storage.local.set({
                [GITHUB_REPOSITORY_STATE_KEY]: repositoryState
            });
        } catch (error) {
            initializationError = error.message;
        }
    }

    return {
        configured: isGitHubConfigured(),
        authenticated,
        githubUsername,
        repository: stored[GITHUB_REPOSITORY_KEY] ?? null,
        repositoryState,
        initializationError,
        settings,
        importState,
        lastSync: lastSync ? {
            ok: lastSync.ok,
            repository: lastSync.repository ?? null,
            path: lastSync.path ?? null,
            problemNumber: lastSync.problemNumber ?? null,
            problemTitle: lastSync.problemTitle ?? null,
            submissionId: lastSync.submissionId ?? null,
            commitUrl: lastSync.commitUrl ?? null,
            error: lastSync.error ?? null,
            syncedAt: lastSync.syncedAt
        } : null,
        installUrl: getGitHubInstallUrl()
    };
}

const REPOSITORY_FORMAT_VERSION = 1;

const LANGUAGE_DETAILS = Object.freeze({
    bash: { extension: "sh", name: "Bash" },
    c: { extension: "c", name: "C" },
    "c++": { extension: "cpp", name: "C++" },
    cpp: { extension: "cpp", name: "C++" },
    "c#": { extension: "cs", name: "C#" },
    csharp: { extension: "cs", name: "C#" },
    dart: { extension: "dart", name: "Dart" },
    elixir: { extension: "ex", name: "Elixir" },
    erlang: { extension: "erl", name: "Erlang" },
    go: { extension: "go", name: "Go" },
    golang: { extension: "go", name: "Go" },
    java: { extension: "java", name: "Java" },
    javascript: { extension: "js", name: "JavaScript" },
    kotlin: { extension: "kt", name: "Kotlin" },
    mssql: { extension: "sql", name: "MS SQL Server" },
    mysql: { extension: "sql", name: "MySQL" },
    oracle: { extension: "sql", name: "Oracle SQL" },
    oraclesql: { extension: "sql", name: "Oracle SQL" },
    pandas: { extension: "py", name: "Pandas" },
    php: { extension: "php", name: "PHP" },
    postgresql: { extension: "sql", name: "PostgreSQL" },
    python: { extension: "py", name: "Python" },
    python3: { extension: "py", name: "Python" },
    pythondata: { extension: "py", name: "Pandas" },
    racket: { extension: "rkt", name: "Racket" },
    ruby: { extension: "rb", name: "Ruby" },
    rust: { extension: "rs", name: "Rust" },
    scala: { extension: "scala", name: "Scala" },
    swift: { extension: "swift", name: "Swift" },
    typescript: { extension: "ts", name: "TypeScript" }
});

const EXTENSION_LANGUAGE_NAMES = Object.freeze({
    c: "C",
    cpp: "C++",
    cs: "C#",
    dart: "Dart",
    ex: "Elixir",
    erl: "Erlang",
    go: "Go",
    java: "Java",
    js: "JavaScript",
    kt: "Kotlin",
    php: "PHP",
    py: "Python",
    rkt: "Racket",
    rb: "Ruby",
    rs: "Rust",
    scala: "Scala",
    sh: "Bash",
    sql: "SQL",
    swift: "Swift",
    ts: "TypeScript",
    txt: "Text"
});

function getLanguageDetails(language) {
    return LANGUAGE_DETAILS[String(language ?? "").toLowerCase()]
        ?? { extension: "txt", name: "Text" };
}

function getSolutionFileExtension(language) {
    return getLanguageDetails(language).extension;
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

function decodeUtf8Base64(value) {
    const binary = atob(String(value ?? "").replace(/\s/g, ""));
    const bytes = Uint8Array.from(binary, (character) => (
        character.charCodeAt(0)
    ));

    return new TextDecoder().decode(bytes);
}

function getRepositoryContentsPath(repository, path) {
    return `/repos/${encodeURIComponent(repository.owner)}`
        + `/${encodeURIComponent(repository.name)}/contents/`
        + encodeGitHubPath(path);
}

async function getGitHubContent(repository, path) {
    const contentsPath = getRepositoryContentsPath(repository, path);

    try {
        return await githubApiRequest(
            `${contentsPath}?ref=${encodeURIComponent(repository.defaultBranch)}`
        );
    } catch (error) {
        if (error.status === 404) {
            return null;
        }

        throw error;
    }
}

async function upsertGitHubFile(repository, path, content, message) {
    const existingFile = await getGitHubContent(repository, path);

    if (Array.isArray(existingFile)) {
        throw new Error(`${path} is a directory, not a file`);
    }

    if (existingFile && typeof existingFile.content !== "string") {
        throw new Error(`${path} is too large for LeetBridge to update safely`);
    }

    if (
        existingFile
        && decodeUtf8Base64(existingFile.content) === content
    ) {
        return { changed: false, commitUrl: null };
    }

    const requestBody = {
        message,
        content: encodeUtf8Base64(content),
        branch: repository.defaultBranch
    };

    if (existingFile?.sha) {
        requestBody.sha = existingFile.sha;
    }

    const result = await githubApiRequest(
        getRepositoryContentsPath(repository, path),
        {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody)
        }
    );

    return {
        changed: true,
        commitUrl: result.commit?.html_url ?? null
    };
}

async function listGitHubDirectory(repository, path) {
    const contents = await getGitHubContent(repository, path);

    if (contents === null) {
        return [];
    }

    if (!Array.isArray(contents)) {
        throw new Error(`${path} is a file, not a directory`);
    }

    return contents;
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
    const value = [
        REPOSITORY_FORMAT_VERSION,
        repository.fullName,
        filePath,
        code
    ].join("\n");
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(value)
    );

    return Array.from(new Uint8Array(digest), (byte) => (
        byte.toString(16).padStart(2, "0")
    )).join("");
}

function getProblemFolderName(problem) {
    if (!problem.number) {
        return problem.slug;
    }

    return `${String(problem.number).padStart(4, "0")}-${problem.slug}`;
}

function getLanguageNameFromFile(fileName, currentLanguage) {
    const extension = fileName.split(".").pop()?.toLowerCase() ?? "txt";
    const currentDetails = getLanguageDetails(currentLanguage);

    if (extension === currentDetails.extension) {
        return currentDetails.name;
    }

    return EXTENSION_LANGUAGE_NAMES[extension]
        ?? extension.toUpperCase();
}

async function getProblemSolutions(repository, folder, currentLanguage) {
    const directory = await listGitHubDirectory(repository, folder);

    return directory
        .filter((item) => (
            item.type === "file"
            && /^solution\.[a-z0-9]+$/i.test(item.name)
        ))
        .map((item) => ({
            language: getLanguageNameFromFile(item.name, currentLanguage),
            path: `${folder}/${item.name}`
        }))
        .sort((first, second) => (
            first.language.localeCompare(second.language)
        ));
}

async function getGitHubTextFile(repository, path) {
    const file = await getGitHubContent(repository, path);

    if (file === null) {
        return null;
    }

    if (Array.isArray(file)) {
        throw new Error(`${path} is a directory, not a file`);
    }

    if (typeof file.content !== "string") {
        throw new Error(`${path} is too large for LeetBridge to read safely`);
    }

    return decodeUtf8Base64(file.content);
}

async function initializeGitHubRepository(repository, leetcodeUsername) {
    const existingReadme = await getGitHubTextFile(
        repository,
        ROOT_README_PATH
    ) ?? "";
    const existingEntries = parseRootReadmeEntries(existingReadme);
    const nextReadme = updateRootReadme(
        existingReadme,
        buildRootReadmeSection(existingEntries),
        leetcodeUsername
    );
    const result = await upsertGitHubFile(
        repository,
        ROOT_README_PATH,
        nextReadme,
        "Initialize LeetBridge repository"
    );

    return {
        initialized: true,
        changed: result.changed,
        commitUrl: result.commitUrl
    };
}

async function updateRepositoryReadmes(
    repository,
    data,
    folder,
    solutions,
    options
) {
    const result = {
        problemReadmePath: `${folder}/README.md`,
        problemResult: null,
        rootResult: null
    };

    if (options.updateProblemReadme) {
        const problemReadme = buildProblemReadme(data.problem, solutions);

        result.problemResult = await upsertGitHubFile(
            repository,
            result.problemReadmePath,
            problemReadme,
            `Update README for ${normalizeInlineText(
                data.problem.title,
                data.problem.slug
            )}`
        );
    }

    if (options.updateRootReadme) {
        const existingRootReadme = await getGitHubTextFile(
            repository,
            ROOT_README_PATH
        ) ?? "";
        const entries = mergeProblemEntry(
            parseRootReadmeEntries(existingRootReadme),
            data.problem,
            solutions
        );
        const nextRootReadme = updateRootReadme(
            existingRootReadme,
            buildRootReadmeSection(entries),
            data.username
        );

        result.rootResult = await upsertGitHubFile(
            repository,
            ROOT_README_PATH,
            nextRootReadme,
            "Update LeetCode solutions index"
        );
    }

    return result;
}

async function mapWithConcurrency(items, limit, mapper) {
    const results = new Array(items.length);
    let nextIndex = 0;

    async function worker() {
        while (nextIndex < items.length) {
            const index = nextIndex;
            nextIndex += 1;
            results[index] = await mapper(items[index], index);
        }
    }

    await Promise.all(
        Array.from(
            { length: Math.min(limit, items.length) },
            () => worker()
        )
    );

    return results;
}

async function readProblemDirectoryEntry(repository, directory) {
    const folderMatch = directory.name.match(
        /^(\d{4,})-([a-z0-9]+(?:-[a-z0-9]+)*)$/
    );

    if (!folderMatch) {
        return null;
    }

    const fallback = {
        number: Number(folderMatch[1]),
        slug: folderMatch[2]
    };
    const [solutions, problemReadme] = await Promise.all([
        getProblemSolutions(repository, directory.name, null),
        getGitHubTextFile(repository, `${directory.name}/README.md`)
    ]);

    if (solutions.length === 0) {
        return null;
    }

    return {
        ...parseProblemReadmeMetadata(problemReadme ?? "", fallback),
        solutions
    };
}

async function rebuildRepositoryReadme(repository, leetcodeUsername = null) {
    const rootItems = await listGitHubDirectory(repository, "");
    const directories = rootItems.filter((item) => (
        item.type === "dir"
        && /^\d{4,}-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.name)
    ));
    const entries = (await mapWithConcurrency(
        directories,
        5,
        (directory) => readProblemDirectoryEntry(repository, directory)
    )).filter(Boolean).sort((first, second) => (
        first.number - second.number
    ));
    const existingReadme = await getGitHubTextFile(
        repository,
        ROOT_README_PATH
    ) ?? "";
    const nextReadme = updateRootReadme(
        existingReadme,
        buildRootReadmeSection(entries),
        leetcodeUsername
    );
    const result = await upsertGitHubFile(
        repository,
        ROOT_README_PATH,
        nextReadme,
        "Rebuild LeetCode solutions index"
    );

    return {
        changed: result.changed,
        commitUrl: result.commitUrl,
        problemCount: entries.length
    };
}

async function hasSyncedSubmission(repository, submissionId) {
    if (!submissionId) {
        return false;
    }

    const stored = await chrome.storage.local.get(
        LEETBRIDGE_SYNCED_SUBMISSIONS_KEY
    );
    const repositoryIds = stored[LEETBRIDGE_SYNCED_SUBMISSIONS_KEY]
        ?.[repository.fullName] ?? [];

    return repositoryIds.includes(String(submissionId));
}

async function rememberSyncedSubmission(repository, submissionId) {
    if (!submissionId) {
        return;
    }

    const stored = await chrome.storage.local.get(
        LEETBRIDGE_SYNCED_SUBMISSIONS_KEY
    );
    const allRepositories = stored[LEETBRIDGE_SYNCED_SUBMISSIONS_KEY] ?? {};
    const repositoryIds = allRepositories[repository.fullName] ?? [];
    const nextIds = [
        ...repositoryIds.filter((id) => id !== String(submissionId)),
        String(submissionId)
    ].slice(-2000);

    await chrome.storage.local.set({
        [LEETBRIDGE_SYNCED_SUBMISSIONS_KEY]: {
            ...allRepositories,
            [repository.fullName]: nextIds
        }
    });
}

async function performAcceptedSolutionSync(data, options) {
    const stored = await chrome.storage.local.get([
        GITHUB_REPOSITORY_KEY,
        GITHUB_LAST_SYNC_KEY
    ]);
    const repository = stored[GITHUB_REPOSITORY_KEY];

    if (!repository) {
        return { skipped: true, reason: "No GitHub repository selected" };
    }

    const submissionId = data.submission.submissionId
        ? String(data.submission.submissionId)
        : null;

    if (await hasSyncedSubmission(repository, submissionId)) {
        return {
            skipped: true,
            reason: "Submission is already synced",
            submissionId
        };
    }

    const extension = getSolutionFileExtension(data.submission.language);
    const folder = getProblemFolderName(data.problem);
    const filePath = `${folder}/solution.${extension}`;
    const fingerprint = await getSolutionFingerprint(
        repository,
        filePath,
        data.submission.code
    );

    if (
        !submissionId
        && stored[GITHUB_LAST_SYNC_KEY]?.ok === true
        && stored[GITHUB_LAST_SYNC_KEY]?.formatVersion
            === REPOSITORY_FORMAT_VERSION
        && stored[GITHUB_LAST_SYNC_KEY]?.fingerprint === fingerprint
    ) {
        return { skipped: true, reason: "Solution is already synced" };
    }

    const solutionResult = await upsertGitHubFile(
        repository,
        filePath,
        data.submission.code,
        getCommitSubject(data.problem)
    );
    let readmeResults = {
        problemReadmePath: `${folder}/README.md`,
        problemResult: null,
        rootResult: null
    };

    if (options.updateProblemReadme || options.updateRootReadme) {
        const solutions = await getProblemSolutions(
            repository,
            folder,
            data.submission.language
        );

        readmeResults = await updateRepositoryReadmes(
            repository,
            data,
            folder,
            solutions,
            options
        );
    }

    const commitUrl = readmeResults.rootResult?.commitUrl
        ?? readmeResults.problemResult?.commitUrl
        ?? solutionResult.commitUrl;
    const syncResult = {
        ok: true,
        repository: repository.fullName,
        path: filePath,
        problemNumber: data.problem.number ?? null,
        problemTitle: data.problem.title ?? data.problem.slug,
        submissionId,
        commitUrl,
        fingerprint,
        formatVersion: REPOSITORY_FORMAT_VERSION,
        updatedPaths: [filePath],
        syncedAt: new Date().toISOString()
    };

    if (options.updateProblemReadme) {
        syncResult.updatedPaths.push(readmeResults.problemReadmePath);
    }

    if (options.updateRootReadme) {
        syncResult.updatedPaths.push(ROOT_README_PATH);
    }

    await chrome.storage.local.set({
        [GITHUB_LAST_SYNC_KEY]: syncResult
    });
    await rememberSyncedSubmission(repository, submissionId);

    return syncResult;
}

let githubOperationQueue = Promise.resolve();

function queueGitHubOperation(operation) {
    const result = githubOperationQueue.then(operation);

    githubOperationQueue = result.catch(() => {});

    return result;
}

function syncAcceptedSolutionToGitHub(data, requestedOptions = {}) {
    const options = {
        updateProblemReadme: requestedOptions.updateProblemReadme !== false,
        updateRootReadme: requestedOptions.updateRootReadme !== false
    };
    return queueGitHubOperation(() => (
        performAcceptedSolutionSync(data, options)
    ));
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
