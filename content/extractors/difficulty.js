function getDifficulty() {
    const difficultyElement = document.querySelector([
        ".text-difficulty-easy",
        ".text-difficulty-medium",
        ".text-difficulty-hard"
    ].join(", "));
    const difficulty = difficultyElement?.textContent?.trim();

    return ["Easy", "Medium", "Hard"].includes(difficulty)
        ? difficulty
        : null;
}
