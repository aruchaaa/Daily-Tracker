import { indexedDB, IDBKeyRange } from "fake-indexeddb";
globalThis.indexedDB = indexedDB;
globalThis.IDBKeyRange = IDBKeyRange;

class FakeNode {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attrs = {};
    this._text = "";
    this._cls = "";
    this._html = "";
    this.classList = { add() {}, remove() {}, toggle() {} };
    this.firstChild = null;
    this.onclick = null;
    this._value = "";
    this.style = {};
  }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(type, fn) { this["on" + type] = fn; }
  appendChild(n) { this.children.push(n); if (!this.firstChild) this.firstChild = n; return n; }
  append(...nodes) { nodes.forEach((n) => { if (n) this.appendChild(n); }); return this; }
  remove() {}
  focus() {}
  set innerHTML(v) { this._html = v; this.children = []; this.firstChild = null; }
  get innerHTML() { return this._html; }
  set textContent(v) { this._text = v; }
  get textContent() { return this._text; }
  set className(v) { this._cls = v; }
  get className() { return this._cls; }
  set checked(v) {}
  set value(v) { this._value = v; }
  get value() { return this._value; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}
const body = new FakeNode("body");
globalThis.document = {
  createElement: (tag) => new FakeNode(tag),
  createElementNS: (ns, tag) => new FakeNode(tag),
  createTextNode: (text) => { const n = new FakeNode("#text"); n._text = text; return n; },
  body,
  documentElement: new FakeNode("html"),
  addEventListener() {},
  removeEventListener() {},
  querySelector: () => null,
};
globalThis.window = { print() {} };
Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
globalThis.getComputedStyle = () => ({ getPropertyValue: () => "" });
globalThis.requestAnimationFrame = (fn) => fn();
globalThis.Notification = class {};

// Repo root, derived from this file's own location (test/../). Relative on
// purpose: the suite follows the repo, so it can never silently point at a
// stale copy elsewhere on disk the way the old hardcoded base did.
const base = new URL("../", import.meta.url).href;
const tasksRepo = await import(base + "js/db/tasksRepo.js");
const completionsRepo = await import(base + "js/db/completionsRepo.js");
const metaRepo = await import(base + "js/db/metaRepo.js");
const notesRepo = await import(base + "js/db/notesRepo.js");
const achievements = await import(base + "js/core/achievements.js");
const csvExport = await import(base + "js/backup/csvExport.js");
const screenHome = await import(base + "js/ui/screenHome.js");
const screenTasks = await import(base + "js/ui/screenTasks.js");
const screenReport = await import(base + "js/ui/screenReport.js");
const screenProfile = await import(base + "js/ui/screenProfile.js");
const screenSettings = await import(base + "js/ui/screenSettings.js");
const installPrompt = await import(base + "js/ui/installPrompt.js");
const toast = await import(base + "js/ui/toast.js");

let fail = 0;
const assert = (cond, msg) => { console.log((cond ? "PASS" : "FAIL") + ": " + msg); if (!cond) fail++; };

const hasClass = (node, name) => Boolean(node && node.className && String(node.className).trim().split(/\s+/).includes(name));
const findNode = (node, className) => {
  if (hasClass(node, className)) return node;
  for (const c of node.children || []) { if (c) { const hit = findNode(c, className); if (hit) return hit; } }
  return null;
};
const findByText = (node, text) => {
  if (node && node._text && node._text.includes(text)) return node;
  for (const c of node.children || []) { if (c) { const hit = findByText(c, text); if (hit) return hit; } }
  return null;
};
const collect = (node, className, out = []) => {
  if (hasClass(node, className)) out.push(node);
  for (const c of node.children || []) { if (c) collect(c, className, out); }
  return out;
};

// ---- Achievements -----------------------------------------------------------
const t1 = await tasksRepo.createTask({ name: "Gym", expValue: 10, isActive: true });
await completionsRepo.toggleCompletion("2026-08-20", t1.id);
let fresh = await achievements.evaluateAchievements();
assert(fresh.some((a) => a.id === "first-blood"), "first completion unlocks first-blood badge");
fresh = await achievements.evaluateAchievements();
assert(fresh.length === 0, "no duplicate unlock on re-evaluate");
const record = await completionsRepo.getCompletion("2026-08-20", t1.id);
assert(record && record.expAwarded === 10, "completion snapshot holds expAwarded");
await completionsRepo.toggleCompletion("2026-08-20", t1.id); // uncheck
const before = await metaRepo.getLifetimeExp(); // back at base
await completionsRepo.restoreCompletion(record); // check again, crediting snapshot EXP
const after = await metaRepo.getLifetimeExp();
assert(after === before + 10, "restoreCompletion puts record back and re-credits EXP");

// ---- Task CRUD + manual ordering --------------------------------------------
const t2 = await tasksRepo.createTask({ name: "Read", expValue: 5, isActive: true });
const t3 = await tasksRepo.createTask({ name: "Write", expValue: 8, isActive: true });
await tasksRepo.setTaskOrder([t3.id, t1.id, t2.id]);
const order = (await tasksRepo.getAllTasks()).map((x) => x.id);
assert(JSON.stringify(order) === JSON.stringify([t3.id, t1.id, t2.id]), "setTaskOrder renumbers sortOrder correctly");
const t2fresh = (await tasksRepo.getAllTasks()).find((t) => t.id === t2.id);
assert(t2fresh.sortOrder === 2, "t2 renumbered to index 2 in manual order");
const delName = t2.name;
await tasksRepo.deleteTask(t2.id);
const all = await tasksRepo.getAllTasks();
assert(!all.some((t) => t.id === t2.id), "task deleted");
const restoredT2 = await tasksRepo.restoreTask(t2fresh);
assert(restoredT2 && restoredT2.name === delName && restoredT2.sortOrder === 2, "restoreTask restores exact task with id and order");

// ---- CSV ---------------------------------------------------------------------
const csv = csvExport.buildMonthCSV(await completionsRepo.getCompletionsForMonth(2026, 8));
assert(csv.includes("Date,Task Name,EXP Earned,Time"), "CSV header is Date,Task Name,EXP Earned,Time");
assert(csv.includes("2026-08-20") && csv.includes("10"), "CSV contains completion rows");
const timeRow = csv.split("\r\n").find((r) => r.startsWith("2026-08-20"));
const timeCell = timeRow ? timeRow.split(",")[3] : "";
assert(/^\d{2}:\d{2}$/.test(timeCell), `Time column is local HH:MM (got "${timeCell}")`);
const legacyCsv = csvExport.buildMonthCSV([
  { id: "2026-08-20_leg", date: "2026-08-20", taskId: "leg", taskName: "Legacy", expAwarded: 5, completedAt: null },
]);
const legacyLine = legacyCsv.split("\r\n")[1] || "";
assert(legacyLine.endsWith(",") && !legacyLine.includes("null"), "record without completedAt exports an empty Time cell");

// ---- Screen renders ----------------------------------------------------------
let c = new FakeNode("div");
await screenHome.renderHome(c);
assert(!findNode(c, "quick-add-toggle") && !findNode(c, "quick-add"), "quick-add removed from Home");
assert(Boolean(findNode(c, "task-row")), "Home lists today's tasks");

c = new FakeNode("div");
await screenTasks.renderTasks(c);
const rows = collect(c, "task-manage-row");
assert(rows.length === 3, `Tasks screen renders ${rows.length} rows`);
const handles = collect(c, "drag-handle");
assert(handles.length === 3, `drag handles present on unscheduled tasks (${handles.length})`);
assert(rows.every((r) => r.attrs["data-task-id"]), "rows carry data-task-id");

// ---- Schedule conflicts ------------------------------------------------------
const schedule = await import(base + "js/core/schedule.js");
const seededTasks = [
  { id: "a", startTime: "09:00", endTime: "10:00", isActive: true },
  { id: "b", startTime: "11:00", endTime: "", isActive: true },
];
assert(Boolean(schedule.findTimeConflict("09:30", "10:30", seededTasks, null)), "range inside an existing range conflicts");
assert(Boolean(schedule.findTimeConflict("09:00", "", seededTasks, null)), "point at an existing range's start conflicts");
assert(Boolean(schedule.findTimeConflict("11:00", "", seededTasks, null)), "two points at the same start conflict");
assert(Boolean(schedule.findTimeConflict("09:30", "11:00", seededTasks, null)), "range straddling an existing range's end conflicts");
assert(!schedule.findTimeConflict("10:00", "", seededTasks, null), "back-to-back point at range end is allowed");
assert(!schedule.findTimeConflict("10:00", "11:00", [{ id: "a", startTime: "09:00", endTime: "10:00" }], null), "back-to-back ranges are allowed");

// ---- Per-day notes -----------------------------------------------------------
await notesRepo.setNote("2026-08-20", t1.id, "Focus today");
const n1 = await notesRepo.getNote("2026-08-20", t1.id);
assert(n1 === "Focus today", "note written for 08-20 is read back");
await notesRepo.setNote("2026-08-21", t1.id, "Different day note");
const n2 = await notesRepo.getNote("2026-08-21", t1.id);
assert(n2 === "Different day note", "note on another day is independent");
await notesRepo.setNote("2026-08-20", t1.id, "Edited 08-20 only");
const n3 = await notesRepo.getNote("2026-08-20", t1.id);
assert(n3 === "Edited 08-20 only", "editing one day's note leaves other days intact");
const dayNotes = await notesRepo.getNotesForDate("2026-08-20");
assert(dayNotes.length === 1 && dayNotes[0].note === "Edited 08-20 only", "getNotesForDate returns only that day's records");
await notesRepo.setNote("2026-08-20", t1.id, "");
const n5 = await notesRepo.getNote("2026-08-20", t1.id);
assert(n5 === "", "clearing a note deletes that day's record only");
const n6 = await notesRepo.getNote("2026-08-21", t1.id);
assert(n6 === "Different day note", "clearing 08-20 leaves 08-21 untouched");

// ---- Report renders ----------------------------------------------------------
c = new FakeNode("div");
await screenReport.renderReport(c);
assert(Boolean(findByText(c, "Monthly Report")), "Report shows Monthly Report heading");
assert(!findNode(c, "weekly-panel"), "weekly panel removed");
assert(Boolean(findNode(c, "year-grid")), "Report has year grid");
const yearTiles = collect(c, "year-tile");
assert(yearTiles.length === 12, "year grid has 12 month tiles");
assert(Boolean(findByText(c, "Export CSV")), "CSV export button present");
const printArea = collect(c, "report-result")[0];
assert(Boolean(printArea) && printArea.attrs.id === "report-print-area", "print area id present");

// ---- Profile renders ---------------------------------------------------------
c = new FakeNode("div");
await screenProfile.renderProfile(c);
assert(Boolean(findNode(c, "ach-grid")), "Profile shows achievements grid");
assert(Boolean(findByText(c, "achievements unlocked")), "achievement counter shown");
assert(Boolean(findByText(c, "Download Character Card")), "share card button present");

// ---- Toast -------------------------------------------------------------------
toast.showToast("test toast", "info", 50, { text: "Undo", onAction: () => {} });
const host = findNode(body, "toast-host");
assert(Boolean(host), "toast host created");
const actionBtn = findNode(host, "toast__action");
assert(Boolean(actionBtn), "toast action button rendered");

// ---- Achievement state persistence -------------------------------------------
await metaRepo.setUnlockedAchievements(["centurion"]);
let entries = await metaRepo.getUnlockedAchievements();
assert(entries.length === 1 && entries[0].id === "centurion" && entries[0].at === null, "legacy string achievements normalize to entries");
await metaRepo.addUnlockedAchievements(["exp-1000"]);
entries = await metaRepo.getUnlockedAchievements();
assert(entries.length === 2 && entries.some((e) => e.id === "exp-1000" && typeof e.at === "string"), "new unlocks carry a timestamp");
await metaRepo.addUnlockedAchievements(["exp-1000"]);
entries = await metaRepo.getUnlockedAchievements();
assert(entries.length === 2, "no duplicate entries on re-unlock");
const exp1000 = (await achievements.getAchievementState()).find((a) => a.id === "exp-1000");
assert(exp1000 && exp1000.unlocked && typeof exp1000.at === "string", "getAchievementState exposes unlock date");
const hardState = await achievements.getAchievementState();
assert(hardState.length === 20, "badge gallery has 20 achievements");

// ---- Hard-tier badges ----------------------------------------------------------
await metaRepo.setDailyTargetExp(10);
const pad2 = (n) => String(n).padStart(2, "0");
const localDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const start = new Date(2026, 6, 1); // local July 1, 2026
for (let i = 0; i < 503; i++) {
  const d = new Date(start);
  d.setDate(d.getDate() + i);
  await completionsRepo.toggleCompletion(localDate(d), t1.id);
}
// The loop's date range overlaps the seeded 08-20/08-21 records (removing
// them), and "today" drifts with the wall clock, so re-populate the tail of
// the streak (today back 40 days) to keep the daily-target streak alive
// regardless of when this test runs.
const backfill = new Date();
for (let i = 0; i < 40; i++) {
  const d = new Date(backfill);
  d.setDate(d.getDate() - i);
  const ds = localDate(d);
  if (!(await completionsRepo.getCompletion(ds, t1.id))) {
    await completionsRepo.toggleCompletion(ds, t1.id);
  }
}
fresh = await achievements.evaluateAchievements();
const freshIds = fresh.map((a) => a.id);
assert(freshIds.includes("veteran"), "veteran unlocks at 500 total tasks");
assert(freshIds.includes("exp-5000"), "exp-5000 unlocks at 5,000 total EXP");
assert(freshIds.includes("level-15"), "level-15 unlocks at level 15");
assert(freshIds.includes("streak-100"), "streak-100 unlocks at a 100-day streak");
assert(freshIds.includes("streak-365"), "streak-365 unlocks at a 365-day streak");
assert(freshIds.includes("target-streak-7") && freshIds.includes("target-streak-30"), "target-streak badges unlock on consecutive target days");
const stillLocked = fresh.every((a) => a.id !== "exp-10000" && a.id !== "level-20");
assert(stillLocked, "10K EXP / level 20 stay locked at ~5K EXP");

// ---- Install prompt ---------------------------------------------------------
assert(typeof installPrompt.canInstall === "function" && typeof installPrompt.installApp === "function", "installPrompt module exports");
c = new FakeNode("div");
await screenSettings.renderSettings(c);
assert(Boolean(findByText(c, "Install App")), "Settings shows Install App button");
const installBtn = findByText(c, "Install App");
assert(installBtn && installBtn.disabled !== true, "Install button is never disabled (always responds)");
assert(Boolean(findNode(c, "settings-section")), "Settings sections render");

// ---- History day record: every task of the day ------------------------------
// Witness day 2026-06-10: BEFORE the July 1 hard-tier loop began, so no
// earlier-suite task or completion can intersect this list, and tasks
// created "now" by the running suite (Aug 2026) are excluded by createdAt.
// All timestamps use 03:00Z so the local calendar date never shifts zones.
const histCore = await import(base + "js/core/history.js");
const screenHistory = await import(base + "js/ui/screenHistory.js");
const tEarly = await tasksRepo.createTask({ name: "Early Task", expValue: 7, isActive: true });
const tLate = await tasksRepo.createTask({ name: "Late Task", expValue: 3, isActive: true });
const tGone = await tasksRepo.createTask({ name: "Gone Task", expValue: 9, isActive: true });
const tGhost = await tasksRepo.createTask({ name: "Ghost Task", expValue: 5, isActive: true });
const tMid = await tasksRepo.createTask({ name: "Mid Task", expValue: 4, isActive: true });
const tNote = await tasksRepo.createTask({ name: "Note Task", expValue: 6, isActive: true });
await tasksRepo.updateTask(tEarly.id, { createdAt: "2026-05-20T03:00:00.000Z" });
await tasksRepo.updateTask(tLate.id, { createdAt: "2026-06-12T03:00:00.000Z" });
await tasksRepo.updateTask(tGone.id, { createdAt: "2026-05-20T03:10:00.000Z" });
await tasksRepo.updateTask(tGhost.id, { createdAt: "2026-05-20T03:20:00.000Z" });
await tasksRepo.updateTask(tMid.id, { createdAt: "2026-06-10T03:00:00.000Z" });
await tasksRepo.updateTask(tNote.id, { createdAt: "2026-05-20T03:30:00.000Z" });
await completionsRepo.toggleCompletion("2026-06-10", tEarly.id);
await completionsRepo.toggleCompletion("2026-06-10", tGone.id);
await notesRepo.setNote("2026-06-10", tNote.id, "Skipped - family day");
await notesRepo.setNote("2026-06-10", tGhost.id, "Skipped - travelling");
await tasksRepo.deleteTask(tGone.id);
await tasksRepo.deleteTask(tGhost.id);

const rec = await histCore.getDayRecord("2026-06-10");
assert(rec.totalExp === 16, "day EXP total sums only completed snapshots");
assert(rec.rows.length === 5, "day lists every task existing that day (done + pending)");
assert(!rec.rows.some((r) => r.taskId === tLate.id), "task created after the day is excluded");
const early = rec.rows.find((r) => r.taskId === tEarly.id);
assert(early && early.isCompleted && early.expValue === 7, "completed task row is flagged done");
const mid = rec.rows.find((r) => r.taskId === tMid.id);
assert(mid && !mid.isCompleted && !mid.deleted && mid.note === "", "existing pending (created exactly that day) shows a 0-EXP row");
const noteRow = rec.rows.find((r) => r.taskId === tNote.id);
assert(noteRow && !noteRow.isCompleted && noteRow.note === "Skipped - family day", "skip-reason note rides on the pending row");
const gone = rec.rows.find((r) => r.taskId === tGone.id);
assert(gone && gone.isCompleted && gone.taskName === "Gone Task" && gone.expValue === 9, "deleted completed task survives via its snapshot");
const ghost = rec.rows.find((r) => r.taskId === tGhost.id);
assert(ghost && ghost.isCompleted === false && ghost.deleted === true && ghost.note === "Skipped - travelling", "deleted never-completed task survives via its day note");
const firstThree = new Set(rec.rows.slice(0, 3).map((r) => r.taskId));
assert(firstThree.has(tEarly.id) && firstThree.has(tMid.id) && firstThree.has(tNote.id), "existing tasks list first in the day rows");
assert(rec.rows.slice(3).map((r) => r.taskId).join(",") === [tGone.id, tGhost.id].join(","), "deleted rows follow the existing ones");

c = new FakeNode("div");
await screenHistory.renderHistory(c);
assert(Boolean(findByText(c, "History")), "History screen renders with the all-tasks day view");
let pendingFound = null;
const walkPending = (n) => { if (hasClass(n, "history-item--pending")) pendingFound = n; for (const ch of n.children || []) { if (ch) walkPending(ch); } };
walkPending(c);
assert(Boolean(pendingFound), "day view renders a pending row with history-item--pending");

console.log(fail === 0 ? "ALL VERIFIED" : `${fail} FAILURES`);
process.exit(fail ? 1 : 0);