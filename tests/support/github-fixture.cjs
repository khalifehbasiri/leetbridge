const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const repository = {
    owner: "tester", name: "solutions", fullName: "tester/solutions",
    defaultBranch: "main"
};
const submission = {
    username: "tester",
    problem: {
        number: 5, slug: "longest-palindromic-substring",
        title: "Longest Palindromic Substring", difficulty: "Medium"
    },
    submission: { submissionId: "123", language: "python3", code: "# café 🐍\npass\n" }
};
const solutionPath = "0005-longest-palindromic-substring/solution.py";

// In-memory GitHub: commits are immutable; only a successful ref update publishes.
function setup(initialFiles = {}, hooks = {}) {
    const storage = { githubRepository: repository };
    const trees = new Map([["tree0", { ...initialFiles }]]);
    const commits = new Map([["head0", { tree: { sha: "tree0" } }]]);
    const calls = [];
    let head = "head0";
    let published = 0;
    let serial = 0;
    const context = vm.createContext({
        TextEncoder, TextDecoder, btoa, atob, crypto: webcrypto,
        chrome: { storage: { local: {
            get: async () => ({ ...storage }),
            set: async (values) => Object.assign(storage, values)
        } } }
    });
    for (const file of ["settings.js", "github-auth.js", "github-readme.js", "github-api.js"]) {
        const source = file === "github-api.js" && hooks.apiSource
            ? hooks.apiSource : readFileSync(join(__dirname, "../../background", file), "utf8");
        vm.runInContext(source, context);
    }
    const fail = (message, status) => Object.assign(new Error(message), { status });
    function files() {
        return trees.get(commits.get(head).tree.sha);
    }
    function push(changes) {
        const treeSha = `external-tree${++serial}`;
        trees.set(treeSha, { ...files(), ...changes });
        head = `external-head${serial}`;
        commits.set(head, { tree: { sha: treeSha } });
    }
    context.githubApiRequest = async (path, options = {}) => {
        const method = options.method ?? "GET";
        const body = options.body ? JSON.parse(options.body) : null;
        calls.push({ path, method, body });
        const url = new URL(`https://api.github.com${path}`);
        if (path.includes("/contents/")) {
            const filePath = decodeURIComponent(url.pathname.split("/contents/")[1]);
            if (method !== "GET") {
                assert.ok(hooks.allowContentsWrites, "multi-file submissions must never commit individual files");
                assert.ok(["PUT", "DELETE"].includes(method));
                if (method === "PUT") {
                    push({ [filePath]: Buffer.from(body.content, "base64").toString("utf8") });
                } else {
                    push({});
                    delete files()[filePath];
                }
                published += 1;
                return { commit: { html_url: `https://github.com/tester/solutions/commit/${head}` } };
            }
            const ref = url.searchParams.get("ref");
            assert.ok(commits.has(ref) || hooks.allowContentsWrites && ref === "main",
                "batch reads must use an immutable commit SHA");
            const snapshot = trees.get(commits.get(ref === "main" ? head : ref).tree.sha);
            if (filePath in snapshot) {
                return { sha: `blob-${filePath}`, content: Buffer.from(snapshot[filePath]).toString("base64") };
            }
            const children = Object.keys(snapshot)
                .filter((key) => key.startsWith(`${filePath}/`))
                .map((key) => ({ type: "file", name: key.slice(filePath.length + 1) }));
            if (children.length) return children;
            throw fail("Not Found", 404);
        }
        if (path.endsWith("/git/ref/heads/main")) {
            if (hooks.missingBranch) throw fail("Not Found", 404);
            return { object: { sha: head } };
        }
        if (method === "GET" && path.includes("/git/commits/")) {
            return commits.get(path.split("/").pop());
        }
        if (method === "POST" && path.endsWith("/git/trees")) {
            if (hooks.failTree) throw fail("Tree creation failed", 500);
            const next = { ...trees.get(body.base_tree) };
            for (const entry of body.tree) {
                if (entry.sha === null) {
                    assert.ok(entry.path in next, "cannot delete an absent file");
                    delete next[entry.path];
                } else next[entry.path] = entry.content;
            }
            const sha = `tree${++serial}`;
            trees.set(sha, next);
            return { sha };
        }
        if (method === "POST" && path.endsWith("/git/commits")) {
            if (hooks.failCommit) throw fail("Commit creation failed", 500);
            const sha = `commit${++serial}`;
            commits.set(sha, { ...body, tree: { sha: body.tree } });
            return { sha, html_url: `https://github.com/tester/solutions/commit/${sha}` };
        }
        if (method === "PATCH" && path.endsWith("/git/refs/heads/main")) {
            assert.equal(body.force, false);
            if (hooks.beforePublish) {
                const hook = hooks.beforePublish;
                delete hooks.beforePublish;
                hook({ push, context });
            }
            if (hooks.rejectPublish) throw fail("Branch is protected", 422);
            if (hooks.alwaysConflict) push({ "external.txt": String(serial) });
            if (commits.get(body.sha).parents[0] !== head) {
                throw fail("Update is not a fast forward", 422);
            }
            head = body.sha;
            published += 1;
            return { object: { sha: head } };
        }
        throw new Error(`Unexpected request: ${method} ${path}`);
    };
    return {
        context, storage, calls, files,
        get published() { return published; },
        sync: (data = submission, options) => context.syncAcceptedSolutionToGitHub(data, options)
    };
}


module.exports = { setup, repository, submission, solutionPath };
