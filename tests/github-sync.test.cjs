const assert = require("node:assert/strict");
const { test } = require("node:test");
const vm = require("node:vm");
const { setup, repository, submission, solutionPath } = require("./support/github-fixture.cjs");

test("one accepted solution publishes code, READMEs, cards and cleanup in one commit", async () => {
    const app = setup({ "notes.txt": "keep me", "README.md": "# My notes\n" });
    const legacy = vm.runInContext("LEGACY_SUMMARY_CARD_PATH", app.context);
    // Seed obsolete content before starting the submission.
    app.files()[legacy] = "obsolete card";
    const result = await app.sync();
    assert.equal(app.published, 1);
    assert.equal(app.calls.filter((call) => call.method === "POST" && call.path.endsWith("/commits")).length, 1);
    assert.equal(app.files()[solutionPath], submission.submission.code);
    assert.match(app.files()["0005-longest-palindromic-substring/README.md"], /solution.py/);
    assert.match(app.files()["README.md"], /# My notes/);
    assert.match(app.files()["README.md"], /longest-palindromic-substring/);
    assert.ok(Object.keys(app.files()).filter((path) => path.endsWith(".svg")).length >= 8);
    assert.equal(app.files()["notes.txt"], "keep me");
    assert.equal(app.files()[legacy], undefined);
    assert.match(result.commitUrl, /\/commit\/commit/);
    assert.equal(app.storage.githubLastSync.ok, true);
    assert.deepEqual(Array.from(app.storage.leetBridgeSyncedSubmissions[repository.fullName]), ["123"]);
    const commit = app.calls.find((call) => call.method === "POST" && call.path.endsWith("/commits"));
    assert.equal(commit.body.message, "Add accepted solution for Longest Palindromic Substring");
});

test("duplicate submissions and unchanged files do not add commits", async () => {
    const app = setup();
    await app.sync();
    assert.equal((await app.sync()).skipped, true);
    const result = await app.sync({
        ...submission, submission: { ...submission.submission, submissionId: "124" }
    });
    assert.equal(result.ok, true);
    assert.equal(app.published, 1);
    assert.equal(app.calls.filter((call) => call.path.endsWith("/git/trees")).length, 1);
});

test("README settings are respected and existing solution languages are retained", async () => {
    for (const updateReadme of [true, false]) {
        const javaPath = "0005-longest-palindromic-substring/solution.java";
        const app = setup({ [javaPath]: "class Solution {}", "README.md": "# Notes\n" }, {
            allowContentsWrites: !updateReadme
        });
        await app.sync(submission, { updateProblemReadme: updateReadme, updateRootReadme: updateReadme });
        assert.equal(app.published, 1);
        assert.equal(app.files()[javaPath], "class Solution {}");
        if (updateReadme) {
            const readme = app.files()["0005-longest-palindromic-substring/README.md"];
            assert.match(readme, /solution.java/);
            assert.match(readme, /solution.py/);
        } else {
            assert.equal(app.files()["README.md"], "# Notes\n");
            assert.equal(Object.keys(app.files()).length, 3);
        }
    }
});

test("concurrent pushes regenerate the batch and preserve new archive entries", async () => {
    const app = setup({}, { beforePublish: ({ push, context }) => {
        context.otherEntries = [{
            number: 1, slug: "two-sum", title: "Two Sum", difficulty: "Easy",
            solutions: [{ language: "Java", path: "0001-two-sum/solution.java" }]
        }];
        const readme = vm.runInContext(
            'updateRootReadme("# Concurrent notes\\n", buildRootReadmeSection(otherEntries))', context
        );
        push({ "README.md": readme, "0001-two-sum/solution.java": "class Solution {}" });
    } });
    await app.sync();
    assert.equal(app.published, 1);
    assert.match(app.files()["README.md"], /Concurrent notes/);
    assert.match(app.files()["README.md"], /two-sum/);
    assert.match(app.files()["README.md"], /longest-palindromic-substring/);
    assert.equal(app.files()["0001-two-sum/solution.java"], "class Solution {}");
    assert.equal(app.calls.filter((call) => call.method === "PATCH").length, 2);
});

test("failed uploads publish no partial files and never mark a submission synced", async () => {
    for (const hooks of [{ failTree: true }, { failCommit: true }, { rejectPublish: true }]) {
        const app = setup({ "README.md": "# Original\n" }, hooks);
        await assert.rejects(app.sync());
        assert.equal(app.published, 0);
        assert.deepEqual(app.files(), { "README.md": "# Original\n" });
        assert.equal(app.storage.githubLastSync, undefined);
        assert.equal(app.storage.leetBridgeSyncedSubmissions, undefined);
        assert.ok(app.calls.filter((call) => call.method === "PATCH").length <= 1);
    }
});

test("invalid README markers fail before publishing the solution", async () => {
    const app = setup();
    app.files()["README.md"] = vm.runInContext("SOLUTIONS_START_MARKER", app.context);
    await assert.rejects(app.sync(), /invalid LeetBridge solution markers/);
    assert.equal(app.published, 0);
    assert.equal(app.files()[solutionPath], undefined);
});

test("historical-import mode includes the problem README but leaves the root index unchanged", async () => {
    const app = setup({ "README.md": "# Original\n" });
    await app.sync(submission, { updateProblemReadme: true, updateRootReadme: false });
    assert.equal(app.published, 1);
    assert.equal(Object.keys(app.files()).length, 3);
    assert.equal(app.files()["README.md"], "# Original\n");
    assert.match(app.files()["0005-longest-palindromic-substring/README.md"], /solution.py/);
});

test("root-only mode includes the solution in the index without creating a problem README", async () => {
    const app = setup();
    await app.sync(submission, { updateProblemReadme: false, updateRootReadme: true });
    assert.equal(app.published, 1);
    assert.equal(app.files()["0005-longest-palindromic-substring/README.md"], undefined);
    assert.match(app.files()["README.md"], /solution.py/);
});

test("code-only sync retains the original two-request fast path", async () => {
    const app = setup({}, { allowContentsWrites: true });
    await app.sync(submission, { updateProblemReadme: false, updateRootReadme: false });
    assert.equal(app.calls.length, 2);
    assert.equal(app.published, 1);
    assert.equal(Object.keys(app.files()).length, 1);
});

test("concurrent submissions are queued and keep both index entries", async () => {
    const app = setup();
    await Promise.all([app.sync(), app.sync({
        ...submission,
        problem: { number: 1, slug: "two-sum", title: "Two Sum", difficulty: "Easy" },
        submission: { ...submission.submission, submissionId: "124" }
    })]);
    assert.equal(app.published, 2);
    assert.match(app.files()["README.md"], /two-sum/);
    assert.match(app.files()["README.md"], /longest-palindromic-substring/);
});

test("persistent conflicts stop after three attempts without recording success", async () => {
    const app = setup({}, { alwaysConflict: true });
    await assert.rejects(app.sync(), /not a fast forward/);
    assert.equal(app.calls.filter((call) => call.method === "PATCH").length, 3);
    assert.equal(app.published, 0);
    assert.equal(app.files()[solutionPath], undefined);
    assert.equal(app.storage.leetBridgeSyncedSubmissions, undefined);
});

test("missing branch fails without writes or a false success", async () => {
    const app = setup({}, { missingBranch: true });
    await assert.rejects(app.sync(), /Not Found/);
    assert.equal(app.calls.length, 1);
    assert.equal(app.storage.githubLastSync, undefined);
});

test("no repository selected performs no network requests", async () => {
    const app = setup();
    delete app.storage.githubRepository;
    assert.equal((await app.sync()).skipped, true);
    assert.equal(app.calls.length, 0);
});

test("one-megabyte source code survives batching unchanged", async () => {
    const app = setup();
    const code = "#" + "x".repeat(999999);
    await app.sync({ ...submission, submission: { ...submission.submission, code } });
    assert.equal(app.files()[solutionPath], code);
    assert.equal(app.published, 1);
});

test("batch reads cache the root README and skip parent/tree creation on a no-op", async () => {
    const app = setup();
    await app.sync();
    const callsBefore = app.calls.length;
    await app.sync({ ...submission, submission: { ...submission.submission, submissionId: "125" } });
    const calls = app.calls.slice(callsBefore);
    assert.equal(calls.filter((call) => call.path.includes("/contents/README.md?")).length, 1);
    assert.equal(calls.filter((call) => call.path.includes("/git/commits/")).length, 0);
    assert.ok(calls.every((call) => call.method === "GET"));
});
