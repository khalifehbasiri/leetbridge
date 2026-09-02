const GITHUB_CONFIG = Object.freeze({
    clientId: "Iv23li9kVoRr3sXaVGdG",
    appSlug: "leetbridge",
    apiBaseUrl: "https://api.github.com",
    apiVersion: "2026-03-10"
});

function isGitHubConfigured() {
    return Boolean(
        GITHUB_CONFIG.clientId
        && GITHUB_CONFIG.appSlug
        && !GITHUB_CONFIG.clientId.startsWith("REPLACE_")
        && !GITHUB_CONFIG.appSlug.startsWith("REPLACE_")
    );
}

function getGitHubInstallUrl() {
    return isGitHubConfigured()
        ? `https://github.com/apps/${GITHUB_CONFIG.appSlug}/installations/new`
        : null;
}
