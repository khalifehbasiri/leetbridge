let detectedUsername = null;

document.addEventListener("leetbridge:username-detected", (event) => {
    try {
        const user = JSON.parse(event.detail);
        detectedUsername = user.username ?? null;

        if (typeof scheduleScan === "function") {
            scheduleScan();
        }
    } catch (error) {
        console.warn("LeetBridge could not read the username:", error);
    }
});

function getUsername() {
    if (detectedUsername) {
        return detectedUsername;
    }

    const profileLink = document.querySelector([
        'nav a[href^="/u/"]',
        'header a[href^="/u/"]',
        'a[href^="/u/"][aria-label*="profile" i]'
    ].join(", "));
    const profilePath = profileLink?.getAttribute("href");
    const match = profilePath?.match(/^\/u\/([^/]+)\/?$/);

    return match ? decodeURIComponent(match[1]) : null;
}

document.dispatchEvent(new CustomEvent("leetbridge:username-request"));
