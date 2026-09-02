function getUsername() {
    const profileLink = document.querySelector([
        'nav a[href^="/u/"]',
        'header a[href^="/u/"]',
        'a[href^="/u/"][aria-label*="profile" i]'
    ].join(", "));
    const profilePath = profileLink?.getAttribute("href");
    const match = profilePath?.match(/^\/u\/([^/]+)\/?$/);

    return match ? decodeURIComponent(match[1]) : null;
}
