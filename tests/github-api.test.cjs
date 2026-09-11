const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

function setup(fetch) {
    const refreshes = [];
    const context = vm.createContext({ fetch });
    for (const file of ["github-config.js", "github-api.js"]) {
        vm.runInContext(readFileSync(join(__dirname, "../background", file), "utf8"), context);
    }
    context.getValidGitHubToken = async (forceRefresh = false) => {
        refreshes.push(forceRefresh);
        return "test-token";
    };
    return { context, refreshes };
}

test("consecutive branch reads bypass a stale browser HTTP cache", async () => {
    let serverHead = "first-commit";
    let cachedHead;
    const { context } = setup(async (_url, options) => {
        const head = options.cache === "no-store" ? serverHead : cachedHead ?? serverHead;
        if (options.cache !== "no-store") cachedHead = head;
        return { ok: true, status: 200, json: async () => ({ object: { sha: head } }) };
    });
    const path = "/repos/tester/solutions/git/ref/heads/main";
    assert.equal((await context.githubApiRequest(path)).object.sha, "first-commit");
    serverHead = "second-commit";
    assert.equal((await context.githubApiRequest(path)).object.sha, "second-commit");
});

test("a 401 refreshes auth once and preserves the request body and headers", async () => {
    const calls = [];
    const { context, refreshes } = setup(async (url, options) => {
        calls.push({ url, options });
        return calls.length === 1
            ? { ok: false, status: 401 }
            : { ok: true, status: 201, json: async () => ({ sha: "created" }) };
    });
    const body = JSON.stringify({ message: "test", tree: "tree", parents: ["parent"] });
    const result = await context.githubApiRequest("/repos/tester/solutions/git/commits", {
        method: "POST", headers: { "Content-Type": "application/json" }, body
    });
    assert.equal(result.sha, "created");
    assert.deepEqual(refreshes, [false, true, false]);
    assert.equal(calls.length, 2);
    for (const call of calls) {
        assert.equal(call.options.body, body);
        assert.equal(call.options.method, "POST");
        assert.equal(call.options.headers["Content-Type"], "application/json");
        assert.equal(call.options.headers["X-GitHub-Api-Version"], "2026-03-10");
    }
});

test("repeated 401 responses stop instead of retrying forever", async () => {
    let count = 0;
    const { context } = setup(async () => {
        count += 1;
        return { ok: false, status: 401, json: async () => ({ message: "Bad credentials" }) };
    });
    await assert.rejects(context.githubApiRequest("/user"), (error) => error.status === 401);
    assert.equal(count, 2);
});

test("non-JSON failures retain the HTTP status for safe conflict handling", async () => {
    const { context } = setup(async () => ({
        ok: false, status: 503, json: async () => { throw new Error("not JSON"); }
    }));
    await assert.rejects(context.githubApiRequest("/user"), (error) => (
        error.status === 503 && error.message === "GitHub request failed (503)"
    ));
});
