import * as completionsRepo from "../db/completionsRepo.js";
import { formatDate } from "../utils.js";

/**
 * Returns [{ date: "YYYY-MM-DD", exp: number }, ...] for the last `days`
 * calendar days (oldest first, today last). Days with no completions still
 * appear with exp: 0, so the chart has one bar per day regardless of gaps.
 */
export async function getRecentDailyExp(days = 14) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));

  const startStr = formatDate(start);
  const endStr = formatDate(today);
  const completions = await completionsRepo.getCompletionsInRange(startStr, endStr);

  const totals = new Map();
  completions.forEach((c) => {
    totals.set(c.date, (totals.get(c.date) || 0) + c.expAwarded);
  });

  const result = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = formatDate(d);
    result.push({ date: key, exp: totals.get(key) || 0 });
  }
  return result;
}
