function getProblemNumber() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const slug = parts[0] === "problems" ? parts[1] : null;

    if (!slug) {
        return null;
    }

    const title = document
        .querySelector(`a[href="/problems/${CSS.escape(slug)}/"]`)
        ?.textContent?.trim();
    const match = title?.match(/^(\d+)\./);

    return match ? Number(match[1]) : null;
}
