// Opt-in integration test. Creates and removes a temporary branch in the supplied
// repository. Uses a dedicated browser profile and the current gh CLI login.
// Usage: node tests/browser-live-sync.cjs <browser-websocket-url> <owner/repo> [unpacked-extension]
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { resolve } = require("node:path");
const { connectCDP, evaluate } = require("./support/cdp.cjs");

async function main() {
    const [browserUrl, fullName, unpackedPath] = process.argv.slice(2);
    const extensionRoot = resolve(unpackedPath ?? resolve(__dirname, ".."));
    assert.ok(browserUrl?.startsWith("ws://127.0.0.1:"));
    assert.match(fullName ?? "", /^[\w.-]+\/[\w.-]+$/);
    const [owner, name] = fullName.split("/");
    const token = execFileSync("gh", ["auth", "token"], { encoding: "utf8", windowsHide: true }).trim();
    const api = async (path, method = "GET", body) => {
        const response = await fetch(`https://api.github.com${path}`, {
            method, headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2026-03-10", "Content-Type": "application/json" },
            ...(body ? { body: JSON.stringify(body) } : {})
        });
        if (!response.ok) throw new Error(`GitHub ${method} ${path}: ${response.status}`);
        return response.status === 204 ? null : response.json();
    };
    const cdp = await connectCDP(browserUrl);
    let branchCreated = false;
    let workerSession;
    let contentTarget;
    const branch = `codex/verify-single-commit-${Date.now()}`;
    const base = `/repos/${fullName}`;
    try {
        const extensions = await cdp.call("Extensions.getExtensions");
        const loaded = extensions.extensions.find((item) => resolve(item.path) === extensionRoot);
        if (loaded) await cdp.call("Extensions.uninstall", { id: loaded.id });
        const { id } = await cdp.call("Extensions.loadUnpacked", { path: extensionRoot });
        const { targetId: popupTarget } = await cdp.call("Target.createTarget", {
            url: `chrome-extension://${id}/popup/popup.html`
        });
        const { sessionId: popupSession } = await cdp.call("Target.attachToTarget", {
            targetId: popupTarget, flatten: true
        });
        const targets = await cdp.call("Target.getTargets");
        const worker = targets.targetInfos.find((target) => target.type === "service_worker"
            && target.url.startsWith(`chrome-extension://${id}/`));
        assert.ok(worker, "packaged service worker must start");
        ({ sessionId: workerSession } = await cdp.call("Target.attachToTarget", {
            targetId: worker.targetId, flatten: true
        }));
        await cdp.call("Runtime.enable", {}, workerSession);
        for (let attempt = 0; attempt < 50; attempt += 1) {
            if (await evaluate(cdp, workerSession, 'typeof storeProblemData === "function"')) break;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        await evaluate(cdp, workerSession, "trustedStorageReady");
        const manifest = await evaluate(cdp, workerSession, "chrome.runtime.getManifest()");
        assert.equal(manifest.version, "1.0.4");
        const repo = await api(base);
        const original = await api(`${base}/git/ref/heads/${repo.default_branch}`);
        await api(`${base}/git/refs`, "POST", { ref: `refs/heads/${branch}`, sha: original.object.sha });
        branchCreated = true;
        const repository = { owner, name, fullName, defaultBranch: branch };
        await evaluate(cdp, workerSession, `chrome.storage.local.set(${JSON.stringify({
            githubAuth: { accessToken: token, expiresAt: null },
            githubRepository: repository,
            githubRepositoryState: { repository: fullName, initialized: true },
            githubProfile: { login: owner },
            leetBridgeSettings: { autoSync: true, updateReadme: true }
        })})`);
        const problem = { number: 5, slug: "longest-palindromic-substring",
            title: "Longest Palindromic Substring", difficulty: "Medium" };
        const data = { username: owner, problem, submission: {
            submissionId: "999999990001", language: "python3", status: "Accepted", accepted: true,
            code: "# LeetBridge integration test — UTF-8 🐍\nclass Solution:\n    def longestPalindrome(self, s):\n        best = ''\n        for i in range(len(s)):\n            for j in range(i + 1, len(s) + 1):\n                part = s[i:j]\n                if part == part[::-1] and len(part) > len(best):\n                    best = part\n        return best\n"
        } };
        const started = performance.now();
        await evaluate(cdp, workerSession, `storeProblemData(${JSON.stringify(data)})`);
        const stored = await evaluate(cdp, workerSession,
            'chrome.storage.local.get(["githubLastSync", "leetBridgeSyncedSubmissions"])');
        assert.equal(stored.githubLastSync?.ok, true, stored.githubLastSync?.error);
        const firstHead = await api(`${base}/git/ref/heads/${branch}`);
        const firstCommit = await api(`${base}/commits/${firstHead.object.sha}`);
        assert.equal(firstCommit.parents.length, 1);
        assert.equal(firstCommit.parents[0].sha, original.object.sha);
        assert.equal(firstCommit.commit.message, "Add accepted solution for Longest Palindromic Substring");
        assert.ok(firstCommit.files.length >= 8);
        for (const path of ["0005-longest-palindromic-substring/solution.py",
            "0005-longest-palindromic-substring/README.md", "README.md", ".leetbridge/progress.svg"]) {
            assert.ok(firstCommit.files.some((file) => file.filename === path), `missing ${path}`);
        }
        const source = await api(`${base}/contents/0005-longest-palindromic-substring/solution.py?ref=${firstHead.object.sha}`);
        assert.equal(Buffer.from(source.content, "base64").toString("utf8"), data.submission.code);
        const elapsedMs = Math.round(performance.now() - started);
        console.log(JSON.stringify({ stage: "live-worker-sync", version: manifest.version,
            commit: firstHead.object.sha, changedFiles: firstCommit.files.length, elapsedMs }));
        await evaluate(cdp, workerSession, `storeProblemData(${JSON.stringify(data)})`);
        assert.equal((await api(`${base}/git/ref/heads/${branch}`)).object.sha, firstHead.object.sha);
        console.log(JSON.stringify({ stage: "duplicate-submission", addedCommits: 0 }));
        await evaluate(cdp, workerSession, 'updateLeetBridgeSettings({updateReadme: false})');
        const second = { ...data, submission: { ...data.submission, submissionId: "999999990002",
            code: `${data.submission.code}\n# second test submission\n` } };
        await evaluate(cdp, workerSession, `storeProblemData(${JSON.stringify(second)})`);
        const secondHead = await api(`${base}/git/ref/heads/${branch}`);
        const secondCommit = await api(`${base}/commits/${secondHead.object.sha}`);
        assert.equal(secondCommit.parents[0].sha, firstHead.object.sha);
        assert.equal(secondCommit.files.length, 1);
        console.log(JSON.stringify({ stage: "code-only-sync", changedFiles: 1 }));
        const popupStatus = await evaluate(cdp, popupSession,
            'chrome.runtime.sendMessage({type: "GITHUB_GET_STATUS"})');
        assert.equal(popupStatus.ok, true);
        assert.equal(popupStatus.status.lastSync.ok, true);
        assert.ok(popupStatus.status.lastSync.commitUrl.endsWith(secondHead.object.sha));
        console.log(JSON.stringify({ stage: "popup-worker-message", ok: true }));

        // Exercise the real MAIN-world capture, isolated-world extractors and
        // runtime message boundary. Only LeetCode responses are simulated;
        // the extension's GitHub upload continues to use the live API.
        await evaluate(cdp, workerSession, 'updateLeetBridgeSettings({updateReadme: true})');
        ({ targetId: contentTarget } = await cdp.call("Target.createTarget", { url: "about:blank" }));
        const { sessionId: contentSession } = await cdp.call("Target.attachToTarget", {
            targetId: contentTarget, flatten: true
        });
        let routeError;
        const removeListener = cdp.onEvent((event) => {
            if (event.method !== "Fetch.requestPaused" || event.sessionId !== contentSession) return;
            const { requestId, request } = event.params;
            const path = new URL(request.url).pathname;
            let contentType = "application/json";
            let body = "{}";
            if (path === "/problems/longest-palindromic-substring/") {
                contentType = "text/html; charset=utf-8";
                body = '<!doctype html><html><body><nav><a href="/u/tester/">Profile</a></nav>'
                    + '<a href="/problems/longest-palindromic-substring/">5. Longest Palindromic Substring</a>'
                    + '<div class="text-difficulty-medium">Medium</div></body></html>';
            } else if (path.endsWith("/submit/")) {
                body = JSON.stringify({ submission_id: "999999990003" });
            } else if (path.includes("/check/")) {
                body = JSON.stringify({ state: "SUCCESS", status_msg: "Accepted" });
            }
            cdp.call("Fetch.fulfillRequest", {
                requestId, responseCode: 200,
                responseHeaders: [{ name: "Content-Type", value: contentType }],
                body: Buffer.from(body).toString("base64")
            }, contentSession).catch((error) => { routeError = error; });
        });
        await cdp.call("Fetch.enable", { patterns: [{ urlPattern: "*" }] }, contentSession);
        await cdp.call("Page.navigate", {
            url: "https://leetcode.com/problems/longest-palindromic-substring/"
        }, contentSession);
        for (let attempt = 0; attempt < 100; attempt += 1) {
            const ready = await evaluate(cdp, contentSession,
                'document.readyState === "complete" && window.__leetBridgeSubmissionCaptureInstalled === true');
            if (ready) break;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        const thirdCode = `${data.submission.code}\n# captured through browser fetch\n`;
        await evaluate(cdp, contentSession, `fetch("/problems/longest-palindromic-substring/submit/", {
            method: "POST", body: JSON.stringify(${JSON.stringify({ lang: "python3", typed_code: thirdCode })})
        }).then(response => response.json())`);
        let finalSync;
        for (let attempt = 0; attempt < 200; attempt += 1) {
            finalSync = await evaluate(cdp, workerSession,
                'chrome.storage.local.get("githubLastSync").then(value => value.githubLastSync)');
            if (finalSync?.submissionId === "999999990003" || finalSync?.ok === false) break;
            if (routeError) throw routeError;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        assert.equal(finalSync?.ok, true, finalSync?.error);
        assert.equal(finalSync?.submissionId, "999999990003", "content-script submission must reach GitHub");
        const thirdHead = await api(`${base}/git/ref/heads/${branch}`);
        const thirdCommit = await api(`${base}/commits/${thirdHead.object.sha}`);
        assert.equal(thirdCommit.parents[0].sha, secondHead.object.sha);
        const thirdSource = await api(`${base}/contents/0005-longest-palindromic-substring/solution.py?ref=${thirdHead.object.sha}`);
        assert.equal(Buffer.from(thirdSource.content, "base64").toString("utf8"), thirdCode);
        removeListener();
        await cdp.call("Target.closeTarget", { targetId: contentTarget });
        contentTarget = null;
        console.log(JSON.stringify({ stage: "browser-capture-to-live-github", ok: true,
            leetcodeResponses: "simulated", githubApi: "live", commit: thirdHead.object.sha }));
        assert.equal((await api(`${base}/git/ref/heads/${repo.default_branch}`)).object.sha, original.object.sha);
    } finally {
        try {
            if (contentTarget) await cdp.call("Target.closeTarget", { targetId: contentTarget });
            if (workerSession) await evaluate(cdp, workerSession, "chrome.storage.local.clear()");
        } finally {
            try {
                if (branchCreated) {
                    await api(`${base}/git/refs/heads/${branch}`, "DELETE");
                    console.log(JSON.stringify({ stage: "cleanup", branchDeleted: true }));
                }
            } finally { cdp.close(); }
        }
    }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
