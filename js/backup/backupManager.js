import * as tasksRepo from "../db/tasksRepo.js";
import * as completionsRepo from "../db/completionsRepo.js";
import * as sleepRepo from "../db/sleepRepo.js";
import * as metaRepo from "../db/metaRepo.js";
import { openDB, promisifyRequest } from "../db/db.js";

// v1 exported only tasks + completions + lifetimeExp. v2 also exports all
// sleep logs and every meta row (name, theme, accent, moments, backup time).
// Import still accepts v1 files — they just restore with those extras empty.
const BACKUP_VERSION = 2;

export async function exportBackup() {
  const [tasks, completions, sleepLogs, meta] = await Promise.all([
    tasksRepo.getAllTasks(),
    completionsRepo.getAllCompletions(),
    sleepRepo.getAllSleepLogs(),
    metaRepo.getAllMeta(),
  ]);

  const backup = {
    backupVersion: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: { tasks, completions, sleepLogs, meta },
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const dateStr = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `daily-tracker-backup-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  await metaRepo.setLastBackupAt(new Date().toISOString());
}

/** Wipes all four stores and replaces them with the backup's contents,
 *  in one transaction — either the whole restore lands, or none of it does. */
export async function importBackup(file) {
  const backup = await parseBackupFile(file);
  const { tasks, completions, metaRows, sleepRows, skipped } = normalizeBackup(backup);

  const db = await openDB();
  const tx = db.transaction(["tasks", "completions", "meta", "sleepLogs"], "readwrite");
  const taskStore = tx.objectStore("tasks");
  const compStore = tx.objectStore("completions");
  const metaStore = tx.objectStore("meta");
  const sleepStore = tx.objectStore("sleepLogs");

  taskStore.clear();
  compStore.clear();
  metaStore.clear();
  sleepStore.clear();

  tasks.forEach((t) => taskStore.put(t));
  completions.forEach((c) => compStore.put(c));
  metaRows.forEach((row) => metaStore.put({ key: row.key, value: row.value }));
  sleepRows.forEach((s) =>
    sleepStore.put({
      date: s.date,
      hours: Number(s.hours) || 0,
      loggedAt: typeof s.loggedAt === "string" ? s.loggedAt : new Date().toISOString(),
    })
  );

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve({ skipped });
    tx.onerror = () => reject(tx.error);
  });
}

/** Merge restore: keeps everything already on this device and adds only
 *  what's missing from the backup (tasks/completions/sleep by key, meta
 *  rows by key). lifetimeExp is recomputed as the sum of all completion
 *  snapshots afterward, so the total can't drift from its records. */
export async function importBackupMerge(file) {
  const backup = await parseBackupFile(file);
  const { tasks, completions, metaRows, sleepRows, skipped } = normalizeBackup(backup);

  const db = await openDB();

  // Read existing keys and the completion total before the write transaction.
  const readTx = db.transaction(["tasks", "completions", "sleepLogs"], "readonly");
  const existingTaskIds = new Set(await promisifyRequest(readTx.objectStore("tasks").getAllKeys()));
  const existingCompIds = new Set(await promisifyRequest(readTx.objectStore("completions").getAllKeys()));
  const existingSleepDates = new Set(await promisifyRequest(readTx.objectStore("sleepLogs").getAllKeys()));
  const allCompletions = await promisifyRequest(readTx.objectStore("completions").getAll());
  let lifetimeExp = allCompletions.reduce((sum, c) => sum + (Number(c.expAwarded) || 0), 0);

  const writeTx = db.transaction(["tasks", "completions", "meta", "sleepLogs"], "readwrite");
  const taskStore = writeTx.objectStore("tasks");
  const compStore = writeTx.objectStore("completions");
  const metaStore = writeTx.objectStore("meta");
  const sleepStore = writeTx.objectStore("sleepLogs");

  for (const t of tasks) {
    if (!existingTaskIds.has(t.id)) taskStore.put(t);
  }
  for (const c of completions) {
    if (!existingCompIds.has(c.id)) {
      compStore.put(c);
      lifetimeExp += Number(c.expAwarded) || 0;
    }
  }
  for (const s of sleepRows) {
    if (!existingSleepDates.has(s.date)) {
      sleepStore.put({
        date: s.date,
        hours: Number(s.hours) || 0,
        loggedAt: typeof s.loggedAt === "string" ? s.loggedAt : new Date().toISOString(),
      });
    }
  }
  const existingMeta = new Set((await promisifyRequest(metaStore.getAllKeys())).filter((k) => k !== "lifetimeExp"));
  for (const row of metaRows) {
    if (row.key === "lifetimeExp") continue;
    if (!existingMeta.has(row.key)) metaStore.put({ key: row.key, value: row.value });
  }
  metaStore.put({ key: "lifetimeExp", value: lifetimeExp });

  return new Promise((resolve, reject) => {
    writeTx.oncomplete = () => resolve({ skipped });
    writeTx.onerror = () => reject(writeTx.error);
  });
}

/** Deletes every row in all four stores (Settings → Delete all data). */
export async function clearAllData() {
  const db = await openDB();
  const tx = db.transaction(["tasks", "completions", "meta", "sleepLogs"], "readwrite");
  tx.objectStore("tasks").clear();
  tx.objectStore("completions").clear();
  tx.objectStore("meta").clear();
  tx.objectStore("sleepLogs").clear();
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function parseBackupFile(file) {
  const text = await file.text();
  let backup;
  try {
    backup = JSON.parse(text);
  } catch (e) {
    throw new Error("File is not valid JSON.");
  }
  if (!backup || typeof backup !== "object" || !backup.data) {
    throw new Error("File does not look like a Daily Tracker backup.");
  }
  return backup;
}

/** Shape a backup's data section into a common form (handles both v1's
 *  { lifetimeExp } object and v2's full meta row array). Each task/completion
 *  record is individually sanitized — one malformed row must never poison
 *  the DB (a completion without date/taskId breaks the one-per-day key, a
 *  non-numeric expAwarded corrupts EXP sums). Malformed rows are dropped
 *  and counted; the caller surfaces the count to the user. */
function normalizeBackup(backup) {
  const { tasks, completions, sleepLogs, meta } = backup.data;
  if (!Array.isArray(tasks) || !Array.isArray(completions)) {
    throw new Error("Backup file is missing tasks or completions data.");
  }

  let skipped = 0;

  const cleanTasks = [];
  for (const t of tasks) {
    const valid =
      t && typeof t === "object" &&
      typeof t.id === "string" && t.id &&
      typeof t.name === "string" && t.name.trim();
    if (!valid) {
      skipped += 1;
      continue;
    }
    cleanTasks.push({ ...t, expValue: Number(t.expValue) || 0 });
  }

  const cleanCompletions = [];
  for (const c of completions) {
    const valid =
      c && typeof c === "object" &&
      typeof c.id === "string" && c.id &&
      typeof c.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.date) &&
      typeof c.taskId === "string" && c.taskId;
    if (!valid) {
      skipped += 1;
      continue;
    }
    // Rebuild explicitly so junk fields can't ride along. completedAt stays
    // optional (v1-era records legitimately lack it).
    cleanCompletions.push({
      id: c.id,
      date: c.date,
      taskId: c.taskId,
      taskName: typeof c.taskName === "string" ? c.taskName : "",
      expAwarded: Number(c.expAwarded) || 0,
      ...(typeof c.completedAt === "string" && c.completedAt ? { completedAt: c.completedAt } : {}),
    });
  }

  let metaRows;
  if (Array.isArray(meta)) {
    metaRows = meta.filter((row) => row && row.key);
  } else if (meta && typeof meta === "object" && typeof meta.lifetimeExp === "number") {
    metaRows = [{ key: "lifetimeExp", value: meta.lifetimeExp }];
  } else {
    metaRows = [];
  }
  if (!metaRows.some((row) => row.key === "lifetimeExp")) {
    metaRows.push({ key: "lifetimeExp", value: 0 });
  }

  const sleepRows = Array.isArray(sleepLogs)
    ? sleepLogs.filter((s) => s && typeof s.date === "string" && s.date)
    : [];

  return { tasks: cleanTasks, completions: cleanCompletions, metaRows, sleepRows, skipped };
}