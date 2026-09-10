/**
 * Finds an existing active task whose time range overlaps with
 * [candidateStart, candidateEnd]. A task with only a start time (no end)
 * is treated as a zero-width point for comparison — it still conflicts
 * with anything whose range contains that instant (including a range that
 * starts at exactly the same time).
 *
 * Ranges are half-open ([start, end)), so back-to-back tasks — one ending
 * exactly when the next starts — do NOT conflict. Points are closed
 * (a single instant), so two tasks both starting at 09:00 DO conflict.
 *
 * Same-day ranges only: a task whose end time is earlier than its start
 * (implying it crosses midnight) is skipped from checking, since "HH:MM"
 * string comparison can't represent that without extra date context this
 * app doesn't track per time-range.
 */
export function findTimeConflict(candidateStart, candidateEnd, existingTasks, excludeTaskId) {
  if (!candidateStart) return null;
  if (candidateEnd && candidateEnd < candidateStart) return null;

  const s2 = candidateStart;
  const e2 = candidateEnd || candidateStart;

  for (const task of existingTasks) {
    if (task.id === excludeTaskId) continue;
    if (!task.startTime) continue;
    if (task.endTime && task.endTime < task.startTime) continue;

    const s1 = task.startTime;
    const e1 = task.endTime || task.startTime;

    if (overlaps(s1, e1, s2, e2)) {
      return task;
    }
  }
  return null;
}

/** Interval overlap: points are closed (start === end), ranges are
 *  half-open [start, end). A point at t overlaps a range [s, e) whenever
 *  s <= t < e. */
function overlaps(s1, e1, s2, e2) {
  const p1 = s1 === e1;
  const p2 = s2 === e2;
  if (p1 && p2) return s1 === s2;
  if (p1) return s2 <= s1 && s1 < e2;
  if (p2) return s1 <= s2 && s2 < e1;
  return s1 < e2 && s2 < e1;
}
