// Progressive leveling curve: level N -> N+1 costs BASE + (N-1)*INCREMENT.
// With the defaults below: 100, 120, 140, 160, ... — each level takes a
// little more than the last, like most RPGs. Level 1 still starts at 0 EXP.
// To reshape the curve, just change these two numbers.
const BASE_EXP_PER_LEVEL = 100;
const EXP_INCREMENT_PER_LEVEL = 20;

function expRequiredForLevel(level) {
  return BASE_EXP_PER_LEVEL + (level - 1) * EXP_INCREMENT_PER_LEVEL;
}

/**
 * Returns everything the UI needs to render the level badge + progress bar:
 * { level, totalExp, currentLevelExp, expPerLevel, percent }
 * expPerLevel is now level-specific (not a flat constant) — it's simply
 * "how much EXP the current level needs", so existing call sites that read
 * progress.expPerLevel don't need to change at all.
 *
 * Walks level-by-level rather than solving the curve algebraically —
 * easier to verify correct, and even decades of daily use is at most a
 * few hundred iterations, which is irrelevant at human-interaction speed.
 */
export function getLevelProgress(totalExp) {
  const exp = Math.max(0, totalExp);
  let level = 1;
  let remaining = exp;

  while (remaining >= expRequiredForLevel(level)) {
    remaining -= expRequiredForLevel(level);
    level += 1;
  }

  const needed = expRequiredForLevel(level);
  const percent = (remaining / needed) * 100;

  return {
    level,
    totalExp: exp,
    currentLevelExp: remaining,
    expPerLevel: needed,
    percent: Math.min(100, Math.max(0, percent)),
  };
}

export function getLevel(totalExp) {
  return getLevelProgress(totalExp).level;
}
