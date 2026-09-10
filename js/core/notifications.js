import * as tasksRepo from "../db/tasksRepo.js";
import * as metaRepo from "../db/metaRepo.js";

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

    const tasks = await tasksRepo.getActiveTasks();
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
            new Notification("Daily Tracker", {
              body: `Time for: ${name}`,
              icon: "icons/icon-192.png",
            });
          } catch (err) {
            console.warn("Notification failed:", err);
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