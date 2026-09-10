/**
 * Longest run of consecutive calendar days with at least one completed
 * task. Takes an array of "YYYY-MM-DD" strings (duplicates fine, order
 * doesn't matter) — typically the dates of a month's completion records.
 */
export function calculateLongestStreak(dateStrings) {
  const unique = [...new Set(dateStrings)].sort();
  if (unique.length === 0) return 0;

  let longest = 1;
  let current = 1;

  for (let i = 1; i < unique.length; i++) {
    // Parsed as UTC midnight for both sides, so the diff is a clean day
    // count regardless of the reader's local timezone.
    const prev = new Date(unique[i - 1] + "T00:00:00Z");
    const curr = new Date(unique[i] + "T00:00:00Z");
    const diffDays = Math.round((curr - prev) / 86400000);

    if (diffDays === 1) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }

  return longest;
}

/**
 * The streak currently in progress, counting backward from today. If
 * today isn't done yet but yesterday was, the streak isn't considered
 * broken yet (today just hasn't happened for the app's purposes) — it
 * only counts as broken once a full day passes with nothing logged.
 */
export function calculateCurrentStreak(dateStrings, todayStr) {
  const uniqueDates = new Set(dateStrings);
  if (uniqueDates.size === 0) return 0;

  let checkDate = uniqueDates.has(todayStr) ? todayStr : shiftDate(todayStr, -1);
  if (!uniqueDates.has(checkDate)) return 0;

  let streak = 0;
  while (uniqueDates.has(checkDate)) {
    streak += 1;
    checkDate = shiftDate(checkDate, -1);
  }
  return streak;
}

function shiftDate(dateStr, deltaDays) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}
