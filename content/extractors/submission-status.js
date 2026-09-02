function getSubmissionStatus() {
    const statusSelectors = [
        '[data-e2e-locator="submission-result"]',
        '[data-cy="submission-result"]',
        '[data-e2e-locator="console-result"]'
    ];
    const knownStatuses = [
        "Accepted",
        "Wrong Answer",
        "Time Limit Exceeded",
        "Memory Limit Exceeded",
        "Runtime Error",
        "Compile Error",
        "Output Limit Exceeded",
        "Internal Error",
        "Pending",
        "Judging"
    ];

    for (const selector of statusSelectors) {
        const text = document.querySelector(selector)?.textContent?.trim();
        const status = knownStatuses.find((value) => text?.includes(value));

        if (status) {
            return status;
        }
    }

    return null;
}
