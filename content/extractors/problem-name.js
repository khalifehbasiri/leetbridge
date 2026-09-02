function getProblemName() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const slug = parts[0] === "problems" ? parts[1] : null;

    if (!slug) {
        return null;
    }

    const escapedSlug = CSS.escape(slug);
    const titleElement = document.querySelector([
        `a[href="/problems/${escapedSlug}/"]`,
        `a[href^="/problems/${escapedSlug}/description"]`,
        '[data-cy="question-title"]',
        '[class*="text-title-large"]'
    ].join(", "));
    const title = titleElement?.textContent?.trim();

    return title ? title.replace(/^\d+\.\s*/, "") : null;
}
