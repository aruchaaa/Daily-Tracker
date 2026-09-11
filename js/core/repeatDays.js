/**
 * Per-task weekly schedule. A task may carry a `repeatDays` array of
 * weekday integers, 0 (Sunday) through 6 (Saturday). Missing or empty
 * means the task applies EVERY day — the default for every legacy task
 * and for "all days" in the picker. Tasks with a list only appear on the
 * listed weekdays: Home's checklist, reminders, History's day rows, and
 * the monthly report denominator all filter by this.
 */

/** 0 (Sunday) - 6 (Saturday) for a local YYYY-MM-DD string. Parsed with
 *  the local constructor (y, m-1, d) so the weekday never drifts from
 *  the stored date in non-UTC zones. */
export function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** A task applies on the given day when it has no repeatDays list or the
 *  day's weekday is listed. */
export function appliesOnWeekday(task, dateStr) {
  const days = task && task.repeatDays;
  if (!Array.isArray(days) || days.length === 0) return true;
  return days.includes(weekdayOf(dateStr));
}

/** True when the task is restricted to a subset of weekdays. */
export function hasRepeatDays(task) {
  return Boolean(task && Array.isArray(task.repeatDays) && task.repeatDays.length > 0);
}

/** Keeps only valid weekday ints (unique, sorted); returns [] for "every
 *  day". Junk input is dropped so a malformed backup or form value can
 *  never wedge the weekday filter. */
export function normalizeRepeatDays(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const d of value) {
    const n = Number(d);
    if (Number.isInteger(n) && n >= 0 && n <= 6 && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out.sort((a, b) => a - b);
}