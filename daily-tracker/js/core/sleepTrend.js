import * as sleepRepo from "../db/sleepRepo.js";
import { formatDate } from "../utils.js";

/**
 * Returns [{ date: "YYYY-MM-DD", hours: number }, ...] for the last `days`
 * calendar days (oldest first, today last). Days with no log show hours: 0
 * — same shape/behavior as core/expTrend.js's getRecentDailyExp.
 */
export async function getRecentSleep(days = 14) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));

  const startStr = formatDate(start);
  const endStr = formatDate(today);
  const logs = await sleepRepo.getSleepInRange(startStr, endStr);
  const hoursByDate = new Map(logs.map((l) => [l.date, l.hours]));

  const result = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = formatDate(d);
    result.push({ date: key, hours: hoursByDate.has(key) ? hoursByDate.get(key) : 0 });
  }
  return result;
}
