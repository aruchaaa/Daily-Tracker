import * as tasksRepo from "../db/tasksRepo.js";
import * as completionsRepo from "../db/completionsRepo.js";
import * as metaRepo from "../db/metaRepo.js";
import { getLevel } from "./expEngine.js";
import { calculateLongestStreak } from "./streak.js";

/**
 * Note on "total active task occurrences": each currently-active task
 * contributes one slot per day it has actually existed within the report
 * range — not one slot per day for the WHOLE range regardless of when it
 * was created. A task added on day 15 of a month that's 19 days in only
 * contributes 5 slots, not 19. This uses each task's own createdAt, which
 * already existed for every task, so no schema change was needed.
 * Residual limitation: a task toggled inactive/active more than once
 * within the month isn't tracked precisely (only creation date is), so
 * that specific case still isn't perfectly accurate — full accuracy there
 * would need a proper activation history log, a bigger change than this
 * warrants for how rarely that pattern actually comes up.
 */
export async function generateReport(year, month) {
  const activeTasks = await tasksRepo.getActiveTasks();
  const activeCount = activeTasks.length;

  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1;
  const isFutureMonth = new Date(year, month - 1, 1) > today && !isCurrentMonth;
  // Current month: only count days elapsed so far, so today's not-yet-done
  // tasks don't unfairly drag down the percentage. Future month: 0.
  const effectiveDays = isCurrentMonth ? today.getDate() : isFutureMonth ? 0 : daysInMonth;

  const rangeStart = new Date(year, month - 1, 1);
  const rangeEnd = new Date(year, month - 1, Math.max(effectiveDays, 1));

  const totalActiveOccurrences =
    effectiveDays > 0
      ? activeTasks.reduce((sum, task) => sum + daysTaskExistedInRange(task, rangeStart, rangeEnd), 0)
      : 0;

  const monthCompletions = await completionsRepo.getCompletionsForMonth(year, month);
  const completedOccurrences = monthCompletions.length;

  const completionPercent =
    totalActiveOccurrences > 0 ? (completedOccurrences / totalActiveOccurrences) * 100 : 0;

  const totalExpEarned = monthCompletions.reduce((sum, c) => sum + c.expAwarded, 0);

  const lifetimeExp = await metaRepo.getLifetimeExp();
  const currentLevel = getLevel(lifetimeExp); // current level, not "level as of that month"

  const longestStreak = calculateLongestStreak(monthCompletions.map((c) => c.date));

  const grade = getGrade(completionPercent);
  const taskTally = buildTaskTally(monthCompletions);

  return {
    year,
    month,
    daysInMonth,
    effectiveDays,
    activeTaskCount: activeCount,
    totalActiveOccurrences,
    completedOccurrences,
    completionPercent: Math.round(completionPercent * 10) / 10,
    totalExpEarned,
    currentLevel,
    longestStreak,
    grade,
    taskTally,
  };
}

/** How many days of [rangeStart, rangeEnd] (inclusive) fall on or after
 *  the task's creation date — i.e. how many of those days it could
 *  actually have been completed on. Compares calendar dates only (not
 *  time-of-day), so a task created any time on day X still counts as
 *  available for the whole of day X. */
function daysTaskExistedInRange(task, rangeStart, rangeEnd) {
  const created = new Date(task.createdAt);
  const createdDateOnly = new Date(created.getFullYear(), created.getMonth(), created.getDate());
  const effectiveStart = createdDateOnly > rangeStart ? createdDateOnly : rangeStart;
  if (effectiveStart > rangeEnd) return 0;
  return Math.round((rangeEnd - effectiveStart) / 86400000) + 1;
}

/**
 * How many times each task was completed this month, sorted most-to-least.
 * Grouped by taskId (not name) so a mid-month rename doesn't split one
 * task into two rows — the display name just uses whichever snapshot was
 * seen last. Works for deleted tasks too, since it only reads from
 * completions' own snapshots, never the live tasks store.
 */
function buildTaskTally(completions) {
  const tally = new Map();
  completions.forEach((c) => {
    const entry = tally.get(c.taskId) || { count: 0, name: c.taskName };
    entry.count += 1;
    entry.name = c.taskName;
    tally.set(c.taskId, entry);
  });
  return Array.from(tally.values())
    .map((e) => ({ name: e.name, count: e.count }))
    .sort((a, b) => b.count - a.count);
}

function getGrade(percent) {
  if (percent >= 90) return "A+";
  if (percent >= 80) return "A";
  if (percent >= 70) return "B";
  if (percent >= 60) return "C";
  return "D";
}
