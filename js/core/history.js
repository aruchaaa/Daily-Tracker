import * as completionsRepo from "../db/completionsRepo.js";
import * as tasksRepo from "../db/tasksRepo.js";
import * as notesRepo from "../db/notesRepo.js";
import { formatDate } from "../utils.js";

/**
 * Historical records are read-only by design: there is no edit/delete path
 * wired to past dates anywhere in the UI. Completion records are
 * self-contained snapshots (taskName/expAwarded captured at completion
 * time), so this never needs to join back to the live tasks store for what
 * was done — but the day list is not just completions anymore.
 *
 * Each day shows EVERY task that existed on it (created on or before that
 * date), completed or not, so History answers "what was asked of me that
 * day and why didn't I check some off" via that day's notes. The rules:
 *
 * - A currently-existing task is included once its creation date <= the
 *   day, in Home's current sortOrder (best-effort mirror of the checklist
 *   as it reads today; the app deliberately does not track when a task was
 *   renamed/deactivated, so past ordering and active-state are approximations).
 * - Completed tasks that were later deleted still appear from their
 *   completion snapshot (rename/delete can't erase history).
 * - Deleted, never-completed tasks still appear when they carry a note for
 *   that day — the written skip reason must not vanish with the task.
 */
export async function getDayRecord(date) {
  const [completions, tasks, notes] = await Promise.all([
    completionsRepo.getCompletionsForDate(date),
    tasksRepo.getAllTasks(),
    notesRepo.getNotesForDate(date),
  ]);

  const noteByTaskId = new Map(notes.map((n) => [n.taskId, n.note]));
  const completionByTaskId = new Map(completions.map((c) => [c.taskId, c]));
  const totalExp = completions.reduce((sum, c) => sum + c.expAwarded, 0);

  const rows = [];
  const seen = new Set();

  for (const task of tasks) {
    // createdAt is an ISO timestamp; compare its local calendar date.
    if (formatDate(new Date(task.createdAt)) > date) continue;
    const done = completionByTaskId.get(task.id);
    rows.push({
      taskId: task.id,
      taskName: task.name,
      expValue: task.expValue,
      isCompleted: Boolean(done),
      completedAt: done ? done.completedAt || null : null,
      note: noteByTaskId.get(task.id) || "",
    });
    seen.add(task.id);
  }

  for (const c of completions) {
    if (seen.has(c.taskId)) continue;
    rows.push({
      taskId: c.taskId,
      taskName: c.taskName || c.taskId,
      expValue: c.expAwarded,
      isCompleted: true,
      completedAt: c.completedAt || null,
      note: noteByTaskId.get(c.taskId) || "",
    });
    seen.add(c.taskId);
  }

  for (const n of notes) {
    if (seen.has(n.taskId)) continue;
    rows.push({
      taskId: n.taskId,
      deleted: true,
      expValue: 0,
      isCompleted: false,
      completedAt: null,
      note: n.note,
    });
    seen.add(n.taskId);
  }

  return { date, rows, totalExp };
}