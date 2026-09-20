import * as tasksRepo from "../db/tasksRepo.js";
import * as completionsRepo from "../db/completionsRepo.js";
import * as metaRepo from "../db/metaRepo.js";
import { getTodayDateString } from "../utils.js";
import { appliesOnWeekday } from "./repeatDays.js";
import { nudgeTimesForDate } from "./push.js";
import { t } from "./i18n.js";

/**
 * In-app reminder timers. Realistically scoped: timers only fire while the
 * app is open (no background/periodic sync), and only when the user has
 * granted notification permission and enabled Reminders in Settings. As soon
 * as background Push is enabled we stand down entirely — the push service
 * already delivers to an open or closed app, so scheduling here too would
 * show every reminder twice.
 */
const timers = new Set();

/**
 * Pure helper (no DOM — unit-testable): the in-app notifications still due
 * later today. `done` is a Set of taskIds already completed today. Tasks
 * without a completion are the ones that can still ring; tasks with no
 * reminder/start time are ignored. Nudges are generic (no task names).
 * Each entry: `{ at, title, body, taskId, nudge }`.
 */
export function buildInAppNotifications(tasks, done, now, nudgeTimes = []) {
  const out = [];

  for (const task of tasks) {
    if (done.has(task.id)) continue;
    const time = task.reminderTime || task.startTime;
    if (!time) continue;
    const [h, m] = time.split(":").map(Number);
    if (!Number.isInteger(h) || !Number.isInteger(m)) continue;
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0).getTime();
    if (at <= now.getTime()) continue;
    out.push({ at, title: t("push.title"), body: task.name, taskId: task.id, nudge: false });
  }

  for (const time of nudgeTimes) {
    const [h, m] = time.split(":").map(Number);
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0).getTime();
    if (at <= now.getTime()) continue;
    out.push({ at, title: t("nudge.title"), body: t("nudge.body"), taskId: null, nudge: true });
  }

  return out;
}

export async function scheduleTodayReminders() {
  try {
    timers.forEach((t) => clearTimeout(t));
    timers.clear();

    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if (!(await metaRepo.getRemindersEnabled())) return;
    // Push covers both open and closed app — never schedule the same
    // reminder twice. (Re-armed when Push is toggled off.)
    if (await metaRepo.getPushEnabled()) return;

    const today = getTodayDateString();
    const tasks = (await tasksRepo.getActiveTasks()).filter((task) => appliesOnWeekday(task, today));
    const completed = await completionsRepo.getCompletionsForDate(today);
    const done = new Set(completed.map((c) => c.taskId));
    const now = new Date();

    for (const note of buildInAppNotifications(tasks, done, now, nudgeTimesForDate(today))) {
      timers.add(
        setTimeout(async () => {
          try {
            // Re-check at fire time: the task may have been completed (or
            // removed / deactivated) since this timer was armed.
            const fresh = (await tasksRepo.getActiveTasks()).filter((task) => appliesOnWeekday(task, today));
            const doneNow = new Set((await completionsRepo.getCompletionsForDate(today)).map((c) => c.taskId));
            if (note.nudge) {
              if (!fresh.some((task) => !doneNow.has(task.id))) return;
            } else if (!fresh.some((task) => task.id === note.taskId) || doneNow.has(note.taskId)) {
              return;
            }
            new Notification(note.title, { body: note.body, icon: "icons/icon-192.png" });
          } catch (err) {
            console.warn("Notification failed:", err);
          }
        }, Math.max(0, note.at - now.getTime()))
      );
    }
  } catch (err) {
    // Best-effort feature: a failure here (e.g. a transient DB error at
    // boot) must never surface as an unhandled rejection.
    console.warn("scheduleTodayReminders failed:", err);
  }
}

/** Setting-only helper: checks permission and, if granted, turns the
 *  feature on and schedules today's reminders. Returns true when active. */
export async function enableReminders() {
  if (!("Notification" in window)) return false;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;
  await metaRepo.setRemindersEnabled(true);
  await scheduleTodayReminders();
  return true;
}

export async function disableReminders() {
  timers.forEach((t) => clearTimeout(t));
  timers.clear();
  await metaRepo.setRemindersEnabled(false);
}
