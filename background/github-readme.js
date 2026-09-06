const ROOT_README_PATH = "README.md";
const PROFILE_START_MARKER = "<!-- LEETBRIDGE_PROFILE_START -->";
const PROFILE_END_MARKER = "<!-- LEETBRIDGE_PROFILE_END -->";
const SOLUTIONS_START_MARKER = "<!-- SOLUTIONS_START -->";
const SOLUTIONS_END_MARKER = "<!-- SOLUTIONS_END -->";
const ARCHIVE_CELL_VERSION_MARKER = "<!-- LEETBRIDGE_ARCHIVE_CELLS_V3 -->";
const ARCHIVE_CELL_ASSET_VERSION = 3;
const PROGRESS_CARD_PATH = ".leetbridge/progress.svg";
const LANGUAGES_CARD_PATH = ".leetbridge/languages.svg";
const DIFFICULTY_CARD_PATH = ".leetbridge/difficulty.svg";
const ARCHIVE_HEADER_CARD_PATH = ".leetbridge/archive/header.svg";
const ARCHIVE_DIFFICULTY_CARD_PATHS = Object.freeze({
    Easy: ".leetbridge/archive/difficulties/easy.svg",
    Medium: ".leetbridge/archive/difficulties/medium.svg",
    Hard: ".leetbridge/archive/difficulties/hard.svg"
});
const ARCHIVE_PROBLEM_CARD_DIRECTORY = ".leetbridge/archive/problems";
const ARCHIVE_LANGUAGE_CARD_DIRECTORY = ".leetbridge/archive/languages";
const LEGACY_SUMMARY_CARD_PATH = ".leetbridge/summary.svg";
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

function getStableAssetKey(value) {
    const label = normalizeInlineText(value, "unknown");
    const readable = label.toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 32) || "item";
    let hash = 2166136261;

    for (const character of label) {
        hash ^= character.codePointAt(0);
        hash = Math.imul(hash, 16777619);
    }

    return `${readable}-${(hash >>> 0).toString(16)}`;
}

function getArchiveProblemCardPath(entry) {
    const number = entry.number
        ? String(entry.number).padStart(4, "0")
        : "unranked";
    const slug = String(entry.slug ?? "problem")
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "") || "problem";

    return `${ARCHIVE_PROBLEM_CARD_DIRECTORY}/${number}-${slug}.svg`;
}

function getArchiveLanguageCardPath(language) {
    return `${ARCHIVE_LANGUAGE_CARD_DIRECTORY}/`
        + `${getStableAssetKey(language)}.svg`;
}

function getArchiveDifficultyCardPath(difficulty) {
    return ARCHIVE_DIFFICULTY_CARD_PATHS[normalizeDifficulty(difficulty)]
        ?? `${ARCHIVE_DIFFICULTY_CARD_PATHS.Easy.replace("easy.svg", "other.svg")}`;
}

function getArchiveAssetSource(path) {
    return `${path}?v=${ARCHIVE_CELL_ASSET_VERSION}`;
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

function buildSegmentedBar(segments, total, x, y, width, height = 8) {
    if (total <= 0) {
        return "";
    }

    let usedWidth = 0;

    return segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        const segmentWidth = isLast
            ? width - usedWidth
            : Math.round((segment.count / total) * width * 10) / 10;
        const rect = `<rect x="${x + usedWidth}" y="${y}" `
            + `width="${Math.max(0, segmentWidth)}" height="${height}" `
            + `fill="${segment.color}"/>`;

        usedWidth += segmentWidth;
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

function buildCardSvg(accessibleTitle, description, body) {
    return [
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"360\" height=\"345\" viewBox=\"0 0 360 345\" role=\"img\" aria-labelledby=\"title desc\">",
        `<title id="title">${escapeXmlText(accessibleTitle)}</title>`,
        `<desc id="desc">${escapeXmlText(description)}</desc>`,
        "<defs>",
        "<linearGradient id=\"accent\" x1=\"0\" x2=\"1\"><stop stop-color=\"#ff2e88\"/><stop offset=\"1\" stop-color=\"#8b5cf6\"/></linearGradient>",
        "<clipPath id=\"bar\"><rect x=\"32\" y=\"82\" width=\"296\" height=\"8\" rx=\"4\"/></clipPath>",
        "<style>",
        ".heading{font:600 22px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;fill:#ff4b91}",
        ".eyebrow{font:600 10px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:1.2px;fill:#8b949e}",
        ".total{font:700 52px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;fill:#f0f6fc}",
        ".metric{font:600 15px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;fill:#f0f6fc}",
        ".count{font:700 16px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;fill:#f0f6fc}",
        ".muted{font:500 13px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;fill:#8b949e}",
        ".language{font:700 31px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;fill:#f0f6fc}",
        ".link{font:600 14px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;fill:#58a6ff}",
        "</style>",
        "</defs>",
        "<rect x=\"1\" y=\"1\" width=\"358\" height=\"343\" rx=\"12\" fill=\"#141321\" stroke=\"#30363d\"/>",
        "<rect x=\"1\" y=\"1\" width=\"358\" height=\"4\" rx=\"2\" fill=\"url(#accent)\"/>",
        ...body,
        "</svg>",
        ""
    ].join("\n");
}

function buildArchiveHeaderCard(entries) {
    const problemLabel = entries.length === 1 ? "problem" : "problems";

    return [
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1120\" height=\"128\" viewBox=\"0 0 1120 128\" role=\"img\" aria-labelledby=\"title desc\">",
        "<title id=\"title\">Solution Archive</title>",
        `<desc id="desc">${entries.length} accepted ${problemLabel} synced by LeetBridge</desc>`,
        "<defs>",
        "<linearGradient id=\"accent\" x1=\"0\" x2=\"1\"><stop stop-color=\"#ff2e88\"/><stop offset=\"1\" stop-color=\"#8b5cf6\"/></linearGradient>",
        "<style>",
        ".heading{font:600 24px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;fill:#ff4b91}",
        ".subtitle{font:500 14px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;fill:#b7c0ca}",
        ".column{font:600 11px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:1.2px;fill:#8b949e}",
        "</style>",
        "</defs>",
        "<rect x=\"1\" y=\"1\" width=\"1118\" height=\"126\" rx=\"12\" fill=\"#141321\" stroke=\"#30363d\"/>",
        "<rect x=\"1\" y=\"1\" width=\"1118\" height=\"4\" rx=\"2\" fill=\"url(#accent)\"/>",
        "<text x=\"32\" y=\"43\" class=\"heading\">Solution Archive</text>",
        `<text x="1088" y="42" class="subtitle" text-anchor="end">${entries.length} accepted ${problemLabel} synced by LeetBridge</text>`,
        "<line x1=\"32\" y1=\"70\" x2=\"1088\" y2=\"70\" stroke=\"#30363d\"/>",
        "<text x=\"32\" y=\"103\" class=\"column\">PROBLEM</text>",
        "<text x=\"610\" y=\"103\" class=\"column\">DIFFICULTY</text>",
        "<text x=\"810\" y=\"103\" class=\"column\">SOLUTIONS</text>",
        "</svg>",
        ""
    ].join("\n");
}

function buildArchiveCellSvg(width, accessibleTitle, body) {
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="58" viewBox="0 0 ${width} 58" role="img" aria-labelledby="title">`,
        `<title id="title">${escapeXmlText(accessibleTitle)}</title>`,
        "<defs>",
        "<linearGradient id=\"accent\" x1=\"0\" x2=\"1\"><stop stop-color=\"#ff2e88\"/><stop offset=\"1\" stop-color=\"#8b5cf6\"/></linearGradient>",
        "<style>",
        ".label{font:600 15px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;fill:#f0f6fc}",
        ".link{font:600 15px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;fill:#58a6ff}",
        "</style>",
        "</defs>",
        `<rect x="1" y="1" width="${width - 2}" height="56" rx="9" fill="#141321" stroke="#30363d"/>`,
        `<rect x="1" y="1" width="${width - 2}" height="3" rx="1.5" fill="url(#accent)"/>`,
        ...body,
        "</svg>",
        ""
    ].join("\n");
}

function buildArchiveProblemCard(entry) {
    const number = entry.number
        ? String(entry.number).padStart(4, "0")
        : "N/A";
    const title = truncateSvgLabel(entry.title, 46);
    const label = `${number} · ${title}`;

    return buildArchiveCellSvg(540, label, [
        `<text x="18" y="36" class="label">${escapeXmlText(label)}</text>`,
        "<text x=\"516\" y=\"36\" class=\"link\" text-anchor=\"end\">↗</text>"
    ]);
}

function buildArchiveDifficultyCard(difficulty) {
    const normalized = normalizeDifficulty(difficulty);
    const color = {
        Easy: "#00b8a3",
        Medium: "#ffc01e",
        Hard: "#ef4743"
    }[normalized] ?? "#8b949e";

    return buildArchiveCellSvg(162, normalized, [
        `<circle cx="24" cy="30" r="7" fill="${color}"/>`,
        `<text x="42" y="36" class="label">${escapeXmlText(normalized)}</text>`
    ]);
}

function buildArchiveLanguageCard(language) {
    const normalized = normalizeInlineText(language, "Unknown");
    const colorIndex = parseInt(getStableAssetKey(normalized).slice(-2), 16);
    const color = getLanguageColor(normalized, colorIndex);

    return buildArchiveCellSvg(297, normalized, [
        `<circle cx="24" cy="30" r="7" fill="${color}"/>`,
        `<text x="42" y="36" class="label">${escapeXmlText(truncateSvgLabel(normalized, 24))}</text>`,
        "<text x=\"277\" y=\"36\" class=\"link\" text-anchor=\"end\">↗</text>"
    ]);
}

function buildProgressCard(entries) {
    const { difficultyCounts } = summarizeEntries(entries);
    const problemLabel = entries.length === 1 ? "problem" : "problems";
    const rows = [
        { label: "Easy", count: difficultyCounts.Easy, color: "#00b8a3" },
        { label: "Medium", count: difficultyCounts.Medium, color: "#ffc01e" },
        { label: "Hard", count: difficultyCounts.Hard, color: "#ef4743" }
    ].map((item, index) => {
        const y = 210 + (index * 40);

        return `<circle cx="38" cy="${y - 5}" r="7" fill="${item.color}"/>`
            + `<text x="54" y="${y}" class="metric">${item.label}</text>`
            + `<text x="328" y="${y}" class="count" text-anchor="end">`
            + `${item.count}</text>`;
    });

    return buildCardSvg(
        `${entries.length} ${problemLabel} solved`,
        `${difficultyCounts.Easy} easy, ${difficultyCounts.Medium} medium, `
            + `${difficultyCounts.Hard} hard. Open the solution archive.`,
        [
            "<text x=\"32\" y=\"45\" class=\"heading\">Progress</text>",
            `<text x="32" y="119" class="total">${entries.length}</text>`,
            "<text x=\"32\" y=\"145\" class=\"eyebrow\">PROBLEMS SOLVED</text>",
            "<line x1=\"32\" y1=\"172\" x2=\"328\" y2=\"172\" stroke=\"#30363d\"/>",
            ...rows,
            "<text x=\"328\" y=\"326\" class=\"link\" text-anchor=\"end\">Open archive ↗</text>"
        ]
    );
}

function buildLanguagesCard(entries) {
    const { languages } = summarizeEntries(entries);
    const totalSolutions = languages.reduce((total, [, count]) => (
        total + count
    ), 0);
    const languageSegments = languages.map(([language, count], index) => ({
        count,
        color: getLanguageColor(language, index)
    }));
    const primaryLanguage = languages[0]?.[0] ?? "No languages yet";
    const primaryCount = languages[0]?.[1] ?? 0;
    const browseLabel = languages.length === 0
        ? "Open archive"
        : languages.length > 1
            ? "Browse languages"
            : `Browse ${truncateSvgLabel(primaryLanguage, 15)}`;
    const description = languages.length === 0
        ? "No solution languages have been synced yet."
        : `${primaryLanguage} is the most-used solution language.`;
    let content;

    if (languages.length <= 1) {
        content = [
            `<circle cx="52" cy="145" r="16" fill="${getLanguageColor(primaryLanguage, 0)}"/>`,
            `<text x="82" y="155" class="language">${escapeXmlText(truncateSvgLabel(primaryLanguage, 15))}</text>`,
            `<text x="82" y="188" class="muted">${primaryCount} solution${primaryCount === 1 ? "" : "s"}</text>`
        ];
    } else {
        const languageRows = languages.slice(0, 4).map(([language, count], index) => {
            const y = 128 + (index * 40);

            return `<circle cx="38" cy="${y - 5}" r="7" fill="${getLanguageColor(language, index)}"/>`
                + `<text x="54" y="${y}" class="metric">${escapeXmlText(truncateSvgLabel(language, 18))}</text>`
                + `<text x="328" y="${y}" class="count" text-anchor="end">${count}</text>`;
        });

        content = [
            "<rect x=\"32\" y=\"82\" width=\"296\" height=\"8\" rx=\"4\" fill=\"#262438\"/>",
            `<g clip-path="url(#bar)">${buildSegmentedBar(languageSegments, totalSolutions, 32, 82, 296)}</g>`,
            ...languageRows,
            ...(languages.length > 4 ? [
                `<text x="32" y="296" class="muted">+${languages.length - 4} more</text>`
            ] : [])
        ];
    }

    return buildCardSvg(
        `${totalSolutions} solutions by language`,
        description,
        [
            "<text x=\"32\" y=\"45\" class=\"heading\">Languages</text>",
            ...content,
            `<text x="328" y="326" class="link" text-anchor="end">${escapeXmlText(browseLabel)} ↗</text>`
        ]
    );
}

function buildDifficultyCard(entries) {
    const { difficultyCounts } = summarizeEntries(entries);
    const segments = getDifficultySegments(difficultyCounts, entries.length);
    let currentAngle = 0;
    const slices = entries.length === 0
        ? "<circle cx=\"112\" cy=\"166\" r=\"68\" fill=\"#262438\"/>"
        : segments.map((segment) => {
            const nextAngle = currentAngle
                + ((segment.count / entries.length) * 360);
            const slice = buildPieSlice(
                112,
                166,
                68,
                currentAngle,
                nextAngle,
                segment.color
            );

            currentAngle = nextAngle;
            return slice;
        }).join("");
    const legend = segments.map((segment, index) => {
        const y = 126 + (index * 42);
        const percentage = entries.length === 0
            ? 0
            : Math.round((segment.count / entries.length) * 100);

        return `<circle cx="216" cy="${y - 5}" r="7" fill="${segment.color}"/>`
            + `<text x="232" y="${y}" class="metric">${segment.label}</text>`
            + `<text x="328" y="${y}" class="count" text-anchor="end">`
            + `${percentage}%</text>`;
    });

    return buildCardSvg(
        "Solved problems by difficulty",
        `${difficultyCounts.Easy} easy, ${difficultyCounts.Medium} medium, `
            + `${difficultyCounts.Hard} hard. Open the LeetCode profile.`,
        [
            "<text x=\"32\" y=\"45\" class=\"heading\">Difficulty</text>",
            slices,
            "<circle cx=\"112\" cy=\"166\" r=\"34\" fill=\"#141321\"/>",
            ...legend,
            "<text x=\"328\" y=\"326\" class=\"link\" text-anchor=\"end\">View profile ↗</text>"
        ]
    );
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
        const svgProblemMatch = line.match(
            /^<tr><td[^>]*><a href="https:\/\/leetcode\.com\/problems\/([a-z0-9-]+)\/"><img [^>]*alt="([^"]+)"[^>]*><\/a><\/td><td[^>]*>(?:<picture>)?<img [^>]*alt="([^"]+)"[^>]*>(?:<\/picture>)?<\/td><td[^>]*>(.*)<\/td><\/tr>$/
        );

        if (svgProblemMatch) {
            const problemLabel = unescapeXmlText(svgProblemMatch[2]);
            const problemMatch = problemLabel.match(/^(\d+|N\/A)\s+·\s+(.+)$/);

            if (!problemMatch) {
                continue;
            }

            const solutions = [];
            const solutionPattern = /<a href="([^"]+)"><img [^>]*alt="([^"]+)"[^>]*><\/a>/g;
            let solutionMatch = solutionPattern.exec(svgProblemMatch[4]);

            while (solutionMatch) {
                solutions.push({
                    language: unescapeXmlText(solutionMatch[2]),
                    path: unescapeXmlText(solutionMatch[1])
                });
                solutionMatch = solutionPattern.exec(svgProblemMatch[4]);
            }

            entries.push({
                number: problemMatch[1] === "N/A"
                    ? null
                    : Number(problemMatch[1]),
                slug: svgProblemMatch[1],
                title: problemMatch[2],
                difficulty: normalizeDifficulty(
                    unescapeXmlText(svgProblemMatch[3])
                ),
                solutions
            });
            continue;
        }

        const htmlProblemMatch = line.match(
            /^<tr><td><a href="https:\/\/leetcode\.com\/problems\/([a-z0-9-]+)\/">(?:<kbd>)?<strong>(\d+)\s+·\s+(.+)<\/strong>(?:<\/kbd>)?<\/a><\/td><td>(?:<kbd>)?[^<]*<strong>([^<]+)<\/strong>(?:<\/kbd>)?<\/td><td>(.*)<\/td><\/tr>$/
        );

        if (htmlProblemMatch) {
            const solutions = [];
            const solutionPattern = /<a href="([^"]+)">(?:<kbd>)?([^<]+)(?:<\/kbd>)?<\/a>/g;
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

function buildRootReadmeSection(
    entries,
    repository = null,
    leetcodeUsername = null
) {
    const { difficultyCounts, languages } = summarizeEntries(entries);
    const solutionRows = entries.map((entry) => {
        const number = entry.number
            ? String(entry.number).padStart(4, "0")
            : "N/A";
        const problemLabel = `${number} · ${normalizeInlineText(
            entry.title,
            entry.slug
        )}`;
        const difficulty = normalizeDifficulty(entry.difficulty);
        const solutions = entry.solutions.map((solution) => (
            `<a href="${escapeXmlText(solution.path)}">`
            + `<img src="${getArchiveAssetSource(
                getArchiveLanguageCardPath(solution.language)
            )}" alt="${escapeXmlText(solution.language)}" `
            + "width=\"100%\"></a>"
        )).join("<br>");

        return `<tr><td width="53%"><a href="https://leetcode.com/problems/${entry.slug}/">`
            + `<img src="${getArchiveAssetSource(
                getArchiveProblemCardPath(entry)
            )}" alt="${escapeXmlText(problemLabel)}" width="100%"></a>`
            + `</td><td width="17%"><picture><img src="${getArchiveAssetSource(
                getArchiveDifficultyCardPath(difficulty)
            )}" alt="${escapeXmlText(difficulty)}" width="100%"></picture></td>`
            + `<td width="30%">${solutions || "None"}</td></tr>`;
    });
    const problemLabel = entries.length === 1 ? "problem" : "problems";
    const primaryLanguage = languages[0]?.[0] ?? null;
    const repositoryUrl = repository?.owner && repository?.name
        ? `https://github.com/${encodeURIComponent(repository.owner)}/`
            + encodeURIComponent(repository.name)
        : null;
    const languageUrl = repositoryUrl && primaryLanguage
        ? languages.length > 1
            ? repositoryUrl
            : `${repositoryUrl}/search?q=language%3A`
                + `${encodeURIComponent(primaryLanguage)}&type=code`
        : "#solution-archive";
    const normalizedUsername = typeof leetcodeUsername === "string"
        ? leetcodeUsername.trim()
        : "";
    const difficultyUrl = normalizedUsername
        ? `https://leetcode.com/u/${encodeURIComponent(normalizedUsername)}/`
        : "https://leetcode.com/problemset/";

    return [
        SOLUTIONS_START_MARKER,
        "",
        "<p align=\"center\">",
        `<a href="#solution-archive"><img src="${PROGRESS_CARD_PATH}" alt="${entries.length} solved: `
            + `${difficultyCounts.Easy} Easy, `
            + `${difficultyCounts.Medium} Medium, `
            + `${difficultyCounts.Hard} Hard" width="33.333%"></a>`
            + `<a href="${escapeXmlText(languageUrl)}"><img `
            + `src="${LANGUAGES_CARD_PATH}" alt="Solution languages" `
            + "width=\"33.333%\"></a>"
            + `<a href="${escapeXmlText(difficultyUrl)}"><img `
            + `src="${DIFFICULTY_CARD_PATH}" alt="Difficulty breakdown" `
            + "width=\"33.333%\"></a>",
        "</p>",
        "",
        ARCHIVE_CELL_VERSION_MARKER,
        "<a name=\"solution-archive\"></a>",
        "<p align=\"center\"><picture>",
        `<img src="${getArchiveAssetSource(ARCHIVE_HEADER_CARD_PATH)}" alt="Solution Archive: `
            + `${entries.length} accepted ${problemLabel} synced by LeetBridge" `
            + "width=\"100%\">",
        "</picture></p>",
        "<table align=\"center\" width=\"100%\">",
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
