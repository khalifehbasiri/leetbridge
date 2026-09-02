function getProblemName() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const slug = parts[0] === "problems" ? parts[1] : null;

    if (!slug) {
        return null;
    }

    const titleLink = document.querySelector(
        `a[href="/problems/${CSS.escape(slug)}/"]`
    );
    const title = titleLink?.textContent?.trim();

    return title ? title.replace(/^\d+\.\s*/, "") : null;
}
