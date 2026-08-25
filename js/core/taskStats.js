import * as completionsRepo from "../db/completionsRepo.js";
import { calculateLongestStreak, calculateCurrentStreak } from "./streak.js";
import { getTodayDateString, formatDate } from "../utils.js";

/**
 * Everything the task detail screen needs: streaks (reusing the same
 * streak math as the monthly report, just scoped to one task's dates
 * instead of all tasks combined) and a heatmap grid for the last N weeks.
 *
 * The heatmap is aligned to real calendar weeks (Sun-first): the grid
 * starts on the Sunday on or before `today - (weeks*7 - 1)`, so every
 * column is a true Sun–Sat week and month labels line up with the actual
 * calendar. The visible range can be up to 6 days wider than `weeks` when
 * the window doesn't start on a Sunday; `heatmapStart`/`heatmapEnd` report
 * the exact dates so the UI can caption the range.
 */
export async function getTaskStats(taskId, heatmapWeeks = 24) {
  const completions = await completionsRepo.getCompletionsForTask(taskId);
  const dates = completions.map((c) => c.date);
  const dateSet = new Set(dates);

  const today = getTodayDateString();
  const longestStreak = calculateLongestStreak(dates);
  const currentStreak = calculateCurrentStreak(dates, today);

  const todayDate = new Date();
  const rangeStart = new Date(todayDate);
  rangeStart.setDate(rangeStart.getDate() - (heatmapWeeks * 7 - 1));
  const gridStart = new Date(rangeStart);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());

  const cells = [];
  for (let d = new Date(gridStart); d <= todayDate; d.setDate(d.getDate() + 1)) {
    const key = formatDate(d);
    cells.push({ date: key, done: dateSet.has(key) });
  }

  return {
    totalCompletions: completions.length,
    longestStreak,
    currentStreak,
    cells,
    heatmapWeeks,
    heatmapStart: formatDate(gridStart),
    heatmapEnd: today,
  };
}
