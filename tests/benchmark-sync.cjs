const { execFileSync } = require("node:child_process");
const { setup, submission } = require("./support/github-fixture.cjs");

async function main() {
    const apiSource = execFileSync("git", ["show", "1349b81:background/github-api.js"], { encoding: "utf8" });
    const seed = setup();
    await seed.sync({
        ...submission,
        problem: { number: 1, slug: "two-sum", title: "Two Sum", difficulty: "Easy" },
        submission: { ...submission.submission, submissionId: "1" }
    });
    const existing = setup();
    await existing.sync();
    const scenarios = [
        { name: "New problem, same language (8 changed files)", files: seed.files(), data: submission },
        { name: "Code edit, README updates enabled", files: existing.files(), data: {
            ...submission, submission: { ...submission.submission, submissionId: "124", code: "# revised\npass\n" }
        } },
        { name: "Code only, README updates disabled", files: {}, data: submission,
            options: { updateProblemReadme: false, updateRootReadme: false } },
        { name: "Historical import item (code + problem README)", files: seed.files(), data: submission,
            options: { updateProblemReadme: true, updateRootReadme: false } }
    ];
    const results = [];
    for (const scenario of scenarios) {
        const row = { scenario: scenario.name };
        for (const version of ["before", "after"]) {
            const app = setup({ ...scenario.files }, { allowContentsWrites: true,
                apiSource: version === "before" ? apiSource : undefined });
            await app.sync(scenario.data, scenario.options);
            row[version] = {
                requests: app.calls.length,
                reads: app.calls.filter((call) => call.method === "GET").length,
                writes: app.calls.filter((call) => call.method !== "GET").length,
                commits: app.published
            };
        }
        results.push(row);
    }
    console.log(JSON.stringify({
        note: "Deterministic API request counts; not a measurement of internet latency.", results
    }, null, 2));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
