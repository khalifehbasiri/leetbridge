const ROOT_README_PATH = "README.md";
const PROFILE_START_MARKER = "<!-- LEETBRIDGE_PROFILE_START -->";
const PROFILE_END_MARKER = "<!-- LEETBRIDGE_PROFILE_END -->";
const SOLUTIONS_START_MARKER = "<!-- SOLUTIONS_START -->";
const SOLUTIONS_END_MARKER = "<!-- SOLUTIONS_END -->";
const SUMMARY_CARD_PATH = ".leetbridge/summary.svg";
const LEGACY_DIFFICULTY_CHART_PATH = ".leetbridge/difficulty-chart.svg";

const LANGUAGE_COLORS = Object.freeze({
    Bash: "#89e051",
    C: "#a8b9cc",
    "C#": "#9b4f96",
    "C++": "#f34b7d",
    Dart: "#00b4ab",
    Elixir: "#6e4a7e",
    Erlang: "#b83998",
    Go: "#00add8",
    Java: "#f89820",
    JavaScript: "#f1e05a",
    Kotlin: "#a97bff",
    PHP: "#4f5d95",
    Python: "#4b8bbe",
    Ruby: "#cc342d",
    Rust: "#dea584",
    Scala: "#dc322f",
    Swift: "#f05138",
    TypeScript: "#3178c6"
});

const FALLBACK_LANGUAGE_COLORS = Object.freeze([
    "#ff4b91",
    "#8b5cf6",
    "#22d3ee",
    "#fb923c",
    "#a3e635",
    "#f472b6"
]);

function normalizeInlineText(value, fallback) {
    const normalized = String(value ?? "")
        .replace(/[\r\n]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    return normalized || fallback;
}

function escapeMarkdownTableText(value) {
    return normalizeInlineText(value, "Unknown")
        .replace(/\\/g, "\\\\")
        .replace(/\|/g, "\\|");
}

function escapeXmlText(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function unescapeXmlText(value) {
    return String(value)
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&gt;/g, ">")
        .replace(/&lt;/g, "<")
        .replace(/&amp;/g, "&");
}

function unescapeMarkdownTableText(value) {
    return value.replace(/\\\|/g, "|").replace(/\\\\/g, "\\");
}

function normalizeDifficulty(value) {
    const normalized = normalizeInlineText(value, "Unknown");

    return ["Easy", "Medium", "Hard"].find((difficulty) => (
        normalized.includes(difficulty)
    )) ?? normalized;
}

function getDifficultyIcon(difficulty) {
    return {
        Easy: "🟢",
        Medium: "🟡",
        Hard: "🔴"
    }[difficulty] ?? "⚪";
}

function truncateSvgLabel(value, maxLength = 18) {
    const label = normalizeInlineText(value, "Unknown");

    return label.length > maxLength
        ? `${label.slice(0, maxLength - 1)}…`
        : label;
}

function getLanguageColor(language, index) {
    return LANGUAGE_COLORS[language]
        ?? FALLBACK_LANGUAGE_COLORS[index % FALLBACK_LANGUAGE_COLORS.length];
}

function summarizeEntries(entries) {
    const difficultyCounts = entries.reduce((counts, entry) => {
        if (Object.hasOwn(counts, entry.difficulty)) {
            counts[entry.difficulty] += 1;
        }

        return counts;
    }, { Easy: 0, Medium: 0, Hard: 0 });
    const languageCounts = entries.reduce((counts, entry) => {
        for (const solution of entry.solutions) {
            const language = normalizeInlineText(solution.language, "Unknown");
            counts.set(language, (counts.get(language) ?? 0) + 1);
        }

        return counts;
    }, new Map());

    return {
        difficultyCounts,
        languages: [...languageCounts.entries()].sort((first, second) => (
            second[1] - first[1] || first[0].localeCompare(second[0])
        ))
    };
}

function buildSegmentedBar(segments, total, y) {
    if (total <= 0) {
        return "";
    }

    const barX = 32;
    const barWidth = 696;
    let usedWidth = 0;

    return segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        const width = isLast
            ? barWidth - usedWidth
            : Math.round((segment.count / total) * barWidth * 10) / 10;
        const rect = `<rect x="${barX + usedWidth}" y="${y}" `
            + `width="${Math.max(0, width)}" height="10" `
            + `fill="${segment.color}"/>`;

        usedWidth += width;
        return rect;
    }).join("");
}

function getDifficultySegments(difficultyCounts, total) {
    const segments = [
        { label: "Easy", count: difficultyCounts.Easy, color: "#00b8a3" },
        { label: "Medium", count: difficultyCounts.Medium, color: "#ffc01e" },
        { label: "Hard", count: difficultyCounts.Hard, color: "#ef4743" }
    ].filter((segment) => segment.count > 0);
    const knownTotal = Object.values(difficultyCounts)
        .reduce((sum, count) => sum + count, 0);

    if (total > knownTotal) {
        segments.push({
            label: "Other",
            count: total - knownTotal,
            color: "#8b949e"
        });
    }

    return segments;
}

function getPiePoint(centerX, centerY, radius, angle) {
    const radians = ((angle - 90) * Math.PI) / 180;

    return {
        x: centerX + (radius * Math.cos(radians)),
        y: centerY + (radius * Math.sin(radians))
    };
}

function buildPieSlice(centerX, centerY, radius, startAngle, endAngle, color) {
    if (endAngle - startAngle >= 359.999) {
        return `<circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="${color}"/>`;
    }

    const start = getPiePoint(centerX, centerY, radius, startAngle);
    const end = getPiePoint(centerX, centerY, radius, endAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;

    return `<path d="M ${centerX} ${centerY} L ${start.x.toFixed(2)} `
        + `${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 `
        + `${end.x.toFixed(2)} ${end.y.toFixed(2)} Z" fill="${color}"/>`;
}

function buildSummaryCard(entries) {
    const { difficultyCounts, languages } = summarizeEntries(entries);
    const difficultySegments = getDifficultySegments(
        difficultyCounts,
        entries.length
    );
    const totalSolutions = languages.reduce((total, [, count]) => (
        total + count
    ), 0);
    const languageSegments = languages.map(([language, count], index) => ({
        count,
        color: getLanguageColor(language, index)
    }));
    const visibleLanguages = languages.slice(0, 6);
    const languageLegend = visibleLanguages.map(([language, count], index) => {
        const column = index % 3;
        const row = Math.floor(index / 3);
        const x = 32 + (column * 232);
        const y = 248 + (row * 30);
        const color = getLanguageColor(language, index);
        const label = escapeXmlText(truncateSvgLabel(language));

        return [
            `<circle cx="${x + 6}" cy="${y - 5}" r="6" fill="${color}"/>`,
            `<text x="${x + 20}" y="${y}" class="legend">${label}</text>`,
            `<text x="${x + 212}" y="${y}" class="legend-count" `
                + `text-anchor="end">${count}</text>`
        ].join("");
    }).join("");
    const moreLanguages = languages.length > visibleLanguages.length
        ? ` + ${languages.length - visibleLanguages.length} more`
        : "";
    let currentAngle = 0;
    const pieSlices = entries.length === 0
        ? "<circle cx=\"160\" cy=\"458\" r=\"78\" fill=\"#262438\"/>"
        : difficultySegments.map((segment) => {
            const nextAngle = currentAngle
                + ((segment.count / entries.length) * 360);
            const slice = buildPieSlice(
                160,
                458,
                78,
                currentAngle,
                nextAngle,
                segment.color
            );

            currentAngle = nextAngle;
            return slice;
        }).join("");
    const difficultyLegend = difficultySegments.map((segment, index) => {
        const percentage = entries.length === 0
            ? 0
            : Math.round((segment.count / entries.length) * 100);
        const y = 414 + (index * 42);

        return [
            `<circle cx="334" cy="${y - 5}" r="7" fill="${segment.color}"/>`,
            `<text x="352" y="${y}" class="difficulty-label">${segment.label}</text>`,
            `<text x="704" y="${y}" class="difficulty-share" `
                + `text-anchor="end">${percentage}%</text>`
        ].join("");
    }).join("");
    const problemLabel = entries.length === 1 ? "problem" : "problems";
    const accessibleTitle = escapeXmlText(
        `${entries.length} ${problemLabel} solved: `
        + `${difficultyCounts.Easy} easy, `
        + `${difficultyCounts.Medium} medium, `
        + `${difficultyCounts.Hard} hard`
    );

    return [
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"760\" height=\"570\" viewBox=\"0 0 760 570\" role=\"img\" aria-labelledby=\"title desc\">",
        `<title id="title">${accessibleTitle}</title>`,
        `<desc id="desc">LeetBridge progress, language summary, and difficulty pie chart${escapeXmlText(moreLanguages)}</desc>`,
        "<defs>",
        "<linearGradient id=\"accent\" x1=\"0\" x2=\"1\"><stop stop-color=\"#ff2e88\"/><stop offset=\"1\" stop-color=\"#8b5cf6\"/></linearGradient>",
        "<clipPath id=\"language-bar\"><rect x=\"32\" y=\"208\" width=\"696\" height=\"10\" rx=\"5\"/></clipPath>",
        "<style>",
        ".heading{font:600 22px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;fill:#ff4b91}",
        ".eyebrow{font:600 11px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:1.2px;fill:#8b949e}",
        ".total{font:700 44px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;fill:#f0f6fc}",
        ".metric{font:700 25px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;fill:#f0f6fc}",
        ".label{font:500 13px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;fill:#b7c0ca}",
        ".legend{font:500 13px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;fill:#dbe4ee}",
        ".legend-count{font:600 13px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;fill:#8b949e}",
        ".difficulty-label{font:600 15px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;fill:#dbe4ee}",
        ".difficulty-share{font:600 15px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;fill:#b7c0ca}",
        "</style>",
        "</defs>",
        "<rect x=\"1\" y=\"1\" width=\"758\" height=\"568\" rx=\"12\" fill=\"#141321\" stroke=\"#30363d\"/>",
        "<rect x=\"1\" y=\"1\" width=\"758\" height=\"4\" rx=\"2\" fill=\"url(#accent)\"/>",
        "<text x=\"32\" y=\"45\" class=\"heading\">LeetBridge Progress</text>",
        "<text x=\"32\" y=\"83\" class=\"eyebrow\">PROBLEMS SOLVED</text>",
        `<text x="32" y="132" class="total">${entries.length}</text>`,
        "<line x1=\"242\" y1=\"72\" x2=\"242\" y2=\"143\" stroke=\"#30363d\"/>",
        "<text x=\"284\" y=\"83\" class=\"eyebrow\">EASY</text>",
        `<text x="284" y="120" class="metric">${difficultyCounts.Easy}</text>`,
        "<circle cx=\"410\" cy=\"112\" r=\"5\" fill=\"#00b8a3\"/>",
        "<text x=\"440\" y=\"83\" class=\"eyebrow\">MEDIUM</text>",
        `<text x="440" y="120" class="metric">${difficultyCounts.Medium}</text>`,
        "<circle cx=\"566\" cy=\"112\" r=\"5\" fill=\"#ffc01e\"/>",
        "<text x=\"596\" y=\"83\" class=\"eyebrow\">HARD</text>",
        `<text x="596" y="120" class="metric">${difficultyCounts.Hard}</text>`,
        "<circle cx=\"722\" cy=\"112\" r=\"5\" fill=\"#ef4743\"/>",
        "<text x=\"32\" y=\"190\" class=\"eyebrow\">SOLUTION LANGUAGES</text>",
        `<text x="728" y="190" class="label" text-anchor="end">${totalSolutions} files${escapeXmlText(moreLanguages)}</text>`,
        "<rect x=\"32\" y=\"208\" width=\"696\" height=\"10\" rx=\"5\" fill=\"#262438\"/>",
        `<g clip-path="url(#language-bar)">${buildSegmentedBar(languageSegments, totalSolutions, 208)}</g>`,
        languageLegend,
        "<line x1=\"32\" y1=\"326\" x2=\"728\" y2=\"326\" stroke=\"#30363d\"/>",
        "<text x=\"32\" y=\"365\" class=\"heading\">Difficulty Mix</text>",
        "<text x=\"334\" y=\"380\" class=\"eyebrow\">DIFFICULTY</text>",
        "<text x=\"704\" y=\"380\" class=\"eyebrow\" text-anchor=\"end\">SHARE</text>",
        pieSlices,
        difficultyLegend,
        "</svg>",
        ""
    ].join("\n");
}

function buildProblemReadme(problem, solutions) {
    const title = normalizeInlineText(problem.title, problem.slug);
    const numberPrefix = problem.number ? `${problem.number}. ` : "";
    const difficulty = normalizeInlineText(problem.difficulty, "Unknown");
    const solutionRows = solutions.map((solution) => {
        const fileName = solution.path.split("/").pop();

        return `| ${escapeMarkdownTableText(solution.language)} `
            + `| [${fileName}](${fileName}) |`;
    });

    return [
        "<!-- This file is automatically generated by LeetBridge. -->",
        "",
        `# ${numberPrefix}${title}`,
        "",
        `**Difficulty:** ${difficulty}`,
        "",
        `[View the problem on LeetCode](https://leetcode.com/problems/${problem.slug}/)`,
        "",
        "## Solutions",
        "",
        "| Language | File |",
        "| --- | --- |",
        ...solutionRows,
        ""
    ].join("\n");
}

function titleFromProblemSlug(slug) {
    return String(slug ?? "")
        .split("-")
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

function parseProblemReadmeMetadata(readme, fallback) {
    const headingMatch = readme.match(/^#\s+(?:(\d+)\.\s+)?(.+)$/m);
    const difficultyMatch = readme.match(/^\*\*Difficulty:\*\*\s+(.+)$/m);

    return {
        number: headingMatch?.[1]
            ? Number(headingMatch[1])
            : fallback.number,
        slug: fallback.slug,
        title: normalizeInlineText(
            headingMatch?.[2],
            titleFromProblemSlug(fallback.slug)
        ),
        difficulty: normalizeInlineText(
            difficultyMatch?.[1],
            "Unknown"
        )
    };
}

function splitMarkdownTableRow(line) {
    const placeholder = "\u0000";

    return line
        .slice(1, -1)
        .replace(/\\\|/g, placeholder)
        .split("|")
        .map((cell) => (
            cell.trim().replaceAll(placeholder, "\\|")
        ));
}

function parseRootReadmeEntries(readme) {
    const startIndex = readme.indexOf(SOLUTIONS_START_MARKER);
    const endIndex = readme.indexOf(SOLUTIONS_END_MARKER);

    if (startIndex === -1 || endIndex <= startIndex) {
        return [];
    }

    const generatedSection = readme.slice(startIndex, endIndex);
    const entries = [];

    for (const line of generatedSection.split(/\r?\n/)) {
        const htmlProblemMatch = line.match(
            /^<tr><td><a href="https:\/\/leetcode\.com\/problems\/([a-z0-9-]+)\/"><strong>(\d+)\s+·\s+(.+)<\/strong><\/a><\/td><td>[^<]*<strong>([^<]+)<\/strong><\/td><td>(.*)<\/td><\/tr>$/
        );

        if (htmlProblemMatch) {
            const solutions = [];
            const solutionPattern = /<a href="([^"]+)">([^<]+)<\/a>/g;
            let solutionMatch = solutionPattern.exec(htmlProblemMatch[5]);

            while (solutionMatch) {
                solutions.push({
                    language: unescapeXmlText(solutionMatch[2]),
                    path: unescapeXmlText(solutionMatch[1])
                });
                solutionMatch = solutionPattern.exec(htmlProblemMatch[5]);
            }

            entries.push({
                number: Number(htmlProblemMatch[2]),
                slug: htmlProblemMatch[1],
                title: unescapeXmlText(htmlProblemMatch[3]),
                difficulty: normalizeDifficulty(htmlProblemMatch[4]),
                solutions
            });
            continue;
        }

        if (!line.startsWith("| [") || !line.endsWith("|")) {
            continue;
        }

        const cells = splitMarkdownTableRow(line);

        const isCompactRow = cells.length === 3;

        if (!isCompactRow && cells.length !== 4) {
            continue;
        }

        const problemMatch = isCompactRow
            ? cells[0].match(
                /^\[(\d+)\s+·\s+(.+)\]\(https:\/\/leetcode\.com\/problems\/([a-z0-9-]+)\/\)$/
            )
            : cells[0].match(
                /^\[(\d+)\]\(https:\/\/leetcode\.com\/problems\/([a-z0-9-]+)\/\)$/
            );

        if (!problemMatch) {
            continue;
        }

        const solutionCell = isCompactRow ? cells[2] : cells[3];
        const solutions = [];
        const solutionPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
        let solutionMatch = solutionPattern.exec(solutionCell);

        while (solutionMatch) {
            solutions.push({
                language: unescapeMarkdownTableText(solutionMatch[1]),
                path: solutionMatch[2]
            });
            solutionMatch = solutionPattern.exec(solutionCell);
        }

        entries.push({
            number: Number(problemMatch[1]),
            slug: isCompactRow ? problemMatch[3] : problemMatch[2],
            title: unescapeMarkdownTableText(
                isCompactRow ? problemMatch[2] : cells[1]
            ),
            difficulty: normalizeDifficulty(
                isCompactRow ? cells[1] : cells[2]
            ),
            solutions
        });
    }

    return entries;
}

function mergeProblemEntry(entries, problem, solutions) {
    const nextEntry = {
        number: problem.number ?? null,
        slug: problem.slug,
        title: normalizeInlineText(problem.title, problem.slug),
        difficulty: normalizeDifficulty(problem.difficulty),
        solutions
    };
    const filteredEntries = entries.filter((entry) => (
        entry.slug !== nextEntry.slug
        && (
            !nextEntry.number
            || entry.number !== nextEntry.number
        )
    ));

    return [...filteredEntries, nextEntry].sort((first, second) => {
        if (first.number && second.number) {
            return first.number - second.number;
        }

        if (first.number) {
            return -1;
        }

        if (second.number) {
            return 1;
        }

        return first.slug.localeCompare(second.slug);
    });
}

function buildRootReadmeSection(entries) {
    const { difficultyCounts } = summarizeEntries(entries);
    const solutionRows = entries.map((entry) => {
        const number = entry.number
            ? String(entry.number).padStart(4, "0")
            : "N/A";
        const solutions = entry.solutions.map((solution) => (
            `<a href="${escapeXmlText(solution.path)}">`
            + `${escapeXmlText(solution.language)}</a>`
        )).join("&nbsp; · &nbsp;");

        return `<tr><td><a href="https://leetcode.com/problems/${entry.slug}/">`
            + `<strong>${number} · ${escapeXmlText(entry.title)}</strong></a>`
            + `</td><td>${getDifficultyIcon(entry.difficulty)} `
            + `<strong>${escapeXmlText(entry.difficulty)}</strong></td>`
            + `<td>${solutions || "None"}</td></tr>`;
    });
    const problemLabel = entries.length === 1 ? "problem" : "problems";

    return [
        SOLUTIONS_START_MARKER,
        "",
        "<p align=\"center\">",
        `  <img src="${SUMMARY_CARD_PATH}" alt="${entries.length} solved: `
            + `${difficultyCounts.Easy} Easy, `
            + `${difficultyCounts.Medium} Medium, `
            + `${difficultyCounts.Hard} Hard" width="760">`,
        "</p>",
        "",
        "<table width=\"100%\">",
        "<thead>",
        `<tr><th align="left" colspan="3"><strong>Solution Archive</strong>`
            + `<br><sub>${entries.length} accepted ${problemLabel} synced by `
            + "LeetBridge</sub></th></tr>",
        "<tr><th align=\"left\">Problem</th><th align=\"left\">Difficulty</th><th align=\"left\">Solutions</th></tr>",
        "</thead>",
        "<tbody>",
        ...solutionRows,
        "</tbody>",
        "</table>",
        "",
        SOLUTIONS_END_MARKER
    ].join("\n");
}

function removeRepositoryProfileSection(existingReadme) {
    const startIndex = existingReadme.indexOf(PROFILE_START_MARKER);
    const endIndex = existingReadme.indexOf(PROFILE_END_MARKER);

    if ((startIndex === -1) !== (endIndex === -1) || endIndex < startIndex) {
        throw new Error(
            "The repository README has invalid LeetBridge profile markers"
        );
    }

    if (startIndex !== -1) {
        const suffixIndex = endIndex + PROFILE_END_MARKER.length;

        return (
            existingReadme.slice(0, startIndex).trimEnd()
            + "\n\n"
            + existingReadme.slice(suffixIndex).trimStart()
        );
    }

    const legacySectionPattern = new RegExp(
        "## LeetCode Profile\\r?\\n\\r?\\n"
        + "\\[!\\[LeetCode Stats\\]\\([^\\r\\n]+\\)\\]"
        + "\\([^\\r\\n]+\\)\\r?\\n\\r?\\n"
        + "\\[!\\[LeetCode Activity\\]\\([^\\r\\n]+\\)\\]"
        + "\\([^\\r\\n]+\\)"
    );

    return existingReadme
        .replace(legacySectionPattern, "")
        .replace(/\n{3,}/g, "\n\n");
}

function buildRepositoryReadmeIntroduction() {
    return [
        "# LeetCode Solutions",
        "",
        "A collection of accepted LeetCode solutions automatically synced by LeetBridge."
    ].join("\n");
}

function updateRootReadme(
    existingReadme,
    generatedSection
) {
    const readme = removeRepositoryProfileSection(existingReadme);
    const startIndex = readme.indexOf(SOLUTIONS_START_MARKER);
    const endIndex = readme.indexOf(SOLUTIONS_END_MARKER);
    const hasDuplicateStart = startIndex !== -1
        && readme.indexOf(
            SOLUTIONS_START_MARKER,
            startIndex + SOLUTIONS_START_MARKER.length
        ) !== -1;
    const hasDuplicateEnd = endIndex !== -1
        && readme.indexOf(
            SOLUTIONS_END_MARKER,
            endIndex + SOLUTIONS_END_MARKER.length
        ) !== -1;

    if (
        (startIndex === -1) !== (endIndex === -1)
        || (startIndex !== -1 && endIndex <= startIndex)
        || hasDuplicateStart
        || hasDuplicateEnd
    ) {
        throw new Error(
            "The repository README has invalid LeetBridge solution markers"
        );
    }

    if (startIndex !== -1) {
        const suffixIndex = endIndex + SOLUTIONS_END_MARKER.length;

        return readme.slice(0, startIndex)
            + generatedSection
            + readme.slice(suffixIndex);
    }

    const existing = readme.trimEnd();
    const introduction = existing
        || buildRepositoryReadmeIntroduction();

    return `${introduction}\n\n${generatedSection}\n`;
}
