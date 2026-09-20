import * as tasksRepo from "../db/tasksRepo.js";
import * as completionsRepo from "../db/completionsRepo.js";
import * as metaRepo from "../db/metaRepo.js";
import { getTodayDateString } from "../utils.js";
import { appliesOnWeekday } from "./repeatDays.js";
import { nudgeTimesForDate } from "./push.js";
import { t } from "./i18n.js";

/**
 * Schedule reminders for today's tasks. Each task can carry its own
 * `reminderTime` (set on the task detail screen); scheduled tasks without
 * one fall back to their `startTime`, so existing behavior is unchanged.
 * Realistically scoped: timers only fire while the app is open (no
 * background/periodic sync), and only when the user has granted
 * notification permission and enabled the feature in Settings.
 */
const timers = new Set();

export async function scheduleTodayReminders() {
  try {
    timers.forEach((t) => clearTimeout(t));
    timers.clear();

    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if (!(await metaRepo.getRemindersEnabled())) return;

    const today = getTodayDateString();
    const tasks = (await tasksRepo.getActiveTasks()).filter((task) => appliesOnWeekday(task, today));
    const now = new Date();

    for (const task of tasks) {
      const time = task.reminderTime || task.startTime;
      if (!time) continue;
      const [h, m] = time.split(":").map(Number);
      if (h === undefined || m === undefined) continue;

      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
      const delay = at - now;
      if (delay <= 0) continue; // already passed today

      const name = task.name;
      timers.add(
        setTimeout(() => {
          try {
            new Notification(t("push.title"), {
              body: name,
              icon: "icons/icon-192.png",
            });
          } catch (err) {
            console.warn("Notification failed:", err);
          }
        }, delay)
      );
    }

    // Three generic daily nudges (morning / afternoon / evening) on the same
    // deterministic random minutes as the push plan. At fire time we re-check
    // the day's tasks so a nudge is skipped once everything is done.
    for (const time of nudgeTimesForDate(today)) {
      const [h, m] = time.split(":").map(Number);
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
      const delay = at - now;
      if (delay <= 0) continue; // already passed today

      timers.add(
        setTimeout(async () => {
          try {
            const fresh = (await tasksRepo.getActiveTasks()).filter((task) => appliesOnWeekday(task, today));
            const completed = await completionsRepo.getCompletionsForDate(today);
            const done = new Set(completed.map((c) => c.taskId));
            if (!fresh.some((task) => !done.has(task.id))) return;
            new Notification(t("nudge.title"), {
              body: t("nudge.body"),
              icon: "icons/icon-192.png",
            });
          } catch (err) {
            console.warn("Nudge notification failed:", err);
          }
        }, delay)
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