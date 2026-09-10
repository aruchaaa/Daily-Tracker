import * as tasksRepo from "../db/tasksRepo.js";
import * as completionsRepo from "../db/completionsRepo.js";
import { getTodayDateString } from "../utils.js";

/**
 * Joins today's active tasks with today's completion records.
 * Returns { date, items: [{task, isCompleted}], totalExpToday }
 * `allTasks` (optional, preloaded) avoids a redundant second read when the
 * caller already has the full task list — used by the Home screen.
 */
export async function getTodayState(allTasks) {
  const date = getTodayDateString();
  const [activeTasks, completions] = await Promise.all([
    allTasks ? Promise.resolve(allTasks.filter((t) => t.isActive)) : tasksRepo.getActiveTasks(),
    completionsRepo.getCompletionsForDate(date),
  ]);

  const completedTaskIds = new Set(completions.map((c) => c.taskId));

  const items = activeTasks
    .map((task) => ({
      task,
      isCompleted: completedTaskIds.has(task.id),
    }))
    // All tasks sorted by sortOrder — scheduled tasks have time-based
    // values, unscheduled tasks have drag-assigned values that can land
    // between scheduled ones.
    .sort((a, b) => (a.task.sortOrder ?? 0) - (b.task.sortOrder ?? 0));

  const totalExpToday = completions.reduce((sum, c) => sum + c.expAwarded, 0);

  return { date, items, totalExpToday };
}

/** Check or uncheck a task for today (once-per-day rule). */
export async function toggleTask(taskId) {
  const date = getTodayDateString();
  return completionsRepo.toggleCompletion(date, taskId);
}
