/**
 * Weekly breakdown of a month for the Report screen: EXP/done tallies per
 * week (Monday-start buckets, clipped to the month) plus the "best day" —
 * the weekday with the highest completion rate, normalized by how many
 * times that weekday occurs in the month (so a 5-day month doesn't
 * unfairly beat a 4-day one). Pure data: no DOM, no i18n — labels are
 * built by the caller.
 */
import { formatDate } from "../utils.js";

/** From a month's completions, build week buckets + best day.
 *  `year`, `month` are 1-based (month 1 = January). Weeks start Monday. */
export function getWeeklySummary(completions, year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();

  // Every day of the month lands in a bucket keyed by its Monday.
  const buckets = new Map(); // "YYYY-MM-DD" (Monday) -> { start, end, done, exp }
  const weekdayOccurrences = [0, 0, 0, 0, 0, 0, 0];
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month - 1, day);
    const wd = d.getDay();
    weekdayOccurrences[wd] += 1;
    const key = formatDate(mondayOf(d));
    if (!buckets.has(key)) {
      buckets.set(key, { start: key, end: "", done: 0, exp: 0 });
    }
  }

  const weekdayDone = [0, 0, 0, 0, 0, 0, 0];
  for (const c of completions) {
    const [y, m, d] = c.date.split("-").map(Number);
    if (Number.isNaN(y) || y !== year || m !== month) continue;
    const day = new Date(y, m - 1, d);
    if (day.getMonth() !== month - 1) continue; // impossible dates (e.g. 31 Feb)
    const wd = day.getDay();
    weekdayDone[wd] += 1;
    const bucket = buckets.get(formatDate(mondayOf(day)));
    if (bucket) {
      bucket.done += 1;
      bucket.exp += Number(c.expAwarded) || 0;
    }
  }

  // Clip each bucket's end to the month's last day and order by start.
  const lastDate = formatDate(new Date(year, month - 1, daysInMonth));
  const weeks = Array.from(buckets.values())
    .map((b) => ({ ...b, end: b.end || lastDate }))
    .sort((a, b) => (a.start < b.start ? -1 : 1));

  // Best day = highest completion rate, weighting only weekdays that had
  // at least one completion this month (ties go to the earlier weekday).
  let bestDay = null;
  for (let wd = 0; wd < 7; wd++) {
    if (weekdayDone[wd] === 0 || weekdayOccurrences[wd] === 0) continue;
    const rate = weekdayDone[wd] / weekdayOccurrences[wd];
    if (!bestDay || rate > bestDay.rate) {
      bestDay = { day: wd, rate, done: weekdayDone[wd], days: weekdayOccurrences[wd] };
    }
  }

  return { weeks, bestDay };
}

/** Monday of the week containing `d`, truncated to a calendar date. */
function mondayOf(d) {
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  monday.setDate(monday.getDate() - ((d.getDay() + 6) % 7));
  return monday;
}