import * as tasksRepo from "../db/tasksRepo.js";
import * as completionsRepo from "../db/completionsRepo.js";
import * as metaRepo from "../db/metaRepo.js";
import { getTodayDateString } from "../utils.js";
import { appliesOnWeekday } from "./repeatDays.js";
import { t } from "./i18n.js";

/** VAPID public key (Web Push). Safe to expose — it only names the app to the
 *  push service. The private half lives in the Vercel env (VAPID_PRIVATE_KEY)
 *  and is used by `api/due.js` when it actually sends the pushes.
 *  Regenerate with `npx web-push generate-vapid-keys` (keep both in sync). */
export const VAPID_PUBLIC_KEY =
  "BCNccQo3riOkoWOXTI-sPIf0Q9mOc0DXTXSgauaSjWm8crmKjfJ_XSraME7qZ1aaRF874GxJoC5MscjdrxSMJns";

/** How many days ahead the browser uploads as a push plan. Refreshed on every
 *  app open / task change / midnight rollover, so a daily user is covered. */
const PLAN_HORIZON_DAYS = 14;

/**
 * Three generic "nudge" windows a day — morning / afternoon / evening —
 * expressed as [start, end) minutes since midnight. The exact minute is
 * randomized (deterministically per date, see `nudgeTimesForDate`) so the
 * reminder doesn't always land on the same clock time. Nudges are not
 * user-editable: only individually scheduled tasks carry a settable time.
 */
export const NUDGE_WINDOWS = [
  { start: 7 * 60, end: 9 * 60 },
  { start: 12 * 60, end: 15 * 60 },
  { start: 19 * 60, end: 21 * 60 },
];

function toLocalDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Tiny seeded RNG: the same date always yields the same nudge times, so the
// in-app timers and the uploaded push plan agree, and re-uploading the plan
// doesn't shuffle the day's nudges.
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic "HH:MM" nudge times for a local date string (one per
 *  NUDGE_WINDOWS entry, minutes randomized within the window). */
export function nudgeTimesForDate(dateStr) {
  const rng = mulberry32(hashString("nudge:" + dateStr));
  return NUDGE_WINDOWS.map(({ start, end }) => {
    const minute = start + Math.floor(rng() * (end - start));
    return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  });
}

/**
 * Pure planner (no DOM — unit-testable in Node): for each day in the horizon
 * and each task that applies that weekday and carries a reminder/start time,
 * compute its fire timestamp. `doneByDate` maps "YYYY-MM-DD" -> Set of taskId
 * already completed that day (a done task shouldn't still ring). With
 * `nudges: true` it also adds the day's three generic nudges (skipped for
 * today when nothing is pending, and for any day with no applicable tasks).
 * Returns entries sorted by fire time: `{ id, at, title, body }` where `at`
 * is epoch-ms (server compares with its own clock; no timezone state on the
 * server). Body is localized here, so the server stays language-agnostic.
 */
export function buildReminderPlan(tasks, doneByDate = {}, { from = new Date(), days = PLAN_HORIZON_DAYS, nudges = false } = {}) {
  const out = [];
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 0, 0, 0, 0);
  const fromDateStr = toLocalDateStr(from);

  for (let d = 0; d < days; d++) {
    const day = new Date(start);
    day.setDate(start.getDate() + d);
    const dateStr = toLocalDateStr(day);
    const doneToday = doneByDate[dateStr];
    const applicable = tasks.filter((task) => appliesOnWeekday(task, dateStr));

    for (const task of applicable) {
      if (doneToday && doneToday.has(task.id)) continue;
      const time = task.reminderTime || task.startTime;
      if (!time) continue;
      const [h, m] = time.split(":").map(Number);
      if (!Number.isInteger(h) || !Number.isInteger(m)) continue;

      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0).getTime();
      if (at <= from.getTime()) continue;

      out.push({ id: `${dateStr}_${task.id}`, at, title: t("push.title"), body: t("push.body", { name: task.name }) });
    }

    if (nudges) {
      // Today: only if something is still pending (re-checked at fire time
      // in-app). Future days: whenever any task applies that day.
      const hasWork =
        dateStr === fromDateStr
          ? applicable.some((task) => !(doneToday && doneToday.has(task.id)))
          : applicable.length > 0;

      if (hasWork) {
        nudgeTimesForDate(dateStr).forEach((time, i) => {
          const [h, m] = time.split(":").map(Number);
          const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0).getTime();
          if (at <= from.getTime()) return;
          out.push({ id: `${dateStr}_nudge_${i}`, at, title: t("nudge.title"), body: t("nudge.body") });
        });
      }
    }
  }

  out.sort((a, b) => a.at - b.at);
  return out;
}

/** Today's plan from the DB: active tasks, repeat-day-filtered, minus the
 *  ones already completed today, plus the day's generic nudges. */
export async function buildTodayPlan() {
  const tasks = await tasksRepo.getActiveTasks();
  const today = getTodayDateString();
  const completed = await completionsRepo.getCompletionsForDate(today);
  const done = new Set(completed.map((c) => c.taskId));
  return buildReminderPlan(tasks, { [today]: done }, { nudges: true });
}

function urlB64ToUint8Array(base64url) {
  const b64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob(b64 + padding);
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
}

/** Subscribe (or reuse) the current PushSubscription and stash its plain
 *  `{ endpoint, keys }` shape in meta so the upload endpoint can read it. */
async function ensureSubscription() {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  const plain = sub.toJSON();
  await metaRepo.setPushSubscription(plain);
  return plain;
}

/** Feature detection for the Settings UI (Node/harness has none of these). */
export function supportsPush() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function getCurrentPushSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? sub.toJSON() : null;
}

/** Upload this device's subscription + reminder plan to the Vercel function
 *  that holds them for the cron job. Best-effort: callers treat a failure as
 *  non-fatal (local dev servers have no /api). */
export async function uploadPlan() {
  if (!(await metaRepo.getPushEnabled())) return;
  const subscription = await metaRepo.getPushSubscription();
  if (!subscription || !subscription.endpoint) return;
  const plan = await buildTodayPlan();
  const deviceId = await metaRepo.getDeviceId();
  const res = await fetch("/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, subscription, plan }),
  });
  if (!res.ok) throw new Error(`plan upload failed: ${res.status}`);
}

/** Boot-time best-effort: re-arm the subscription + plan for an enabled
 *  install without any user interaction (covers midnight rollover and the
 *  daily re-open). Never throws. */
export async function initPush() {
  try {
    if (!(await metaRepo.getPushEnabled())) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    await ensureSubscription();
    await uploadPlan();
  } catch (err) {
    console.warn("push init failed:", err);
  }
}

export async function enablePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return false;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;
  await ensureSubscription();
  await metaRepo.setPushEnabled(true);
  try {
    await uploadPlan();
  } catch (err) {
    console.warn("push plan upload failed (will retry on next render):", err);
  }
  return true;
}

export async function disablePush() {
  await metaRepo.setPushEnabled(false);
  try {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
    }
  } catch (err) {
    console.warn("push unsubscribe failed:", err);
  }
  await metaRepo.setPushSubscription(null);
  // Tell the server to drop this device's plan + subscription.
  try {
    const deviceId = await metaRepo.getDeviceId();
    await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, subscription: null, plan: [] }),
    });
  } catch (err) {
    console.warn("push plan clear failed:", err);
  }
}

/** Ask the cron endpoint to send an immediate test notification to this
 *  device (used by the Settings "Test" button). */
export async function sendTestPush() {
  const deviceId = await metaRepo.getDeviceId();
  const res = await fetch(`/api/due?test=${encodeURIComponent(deviceId)}`);
  if (!res.ok) throw new Error(`test push failed: ${res.status}`);
}