import { openDB, promisifyRequest } from "./db.js";

function makeId(date, taskId) {
  return `${date}_${taskId}`;
}

export async function getCompletion(date, taskId) {
  const db = await openDB();
  const tx = db.transaction("completions", "readonly");
  return promisifyRequest(tx.objectStore("completions").get(makeId(date, taskId)));
}

export async function getCompletionsForDate(date) {
  const db = await openDB();
  const tx = db.transaction("completions", "readonly");
  const index = tx.objectStore("completions").index("date");
  return promisifyRequest(index.getAll(date));
}

export async function getCompletionsInRange(startDate, endDate) {
  const db = await openDB();
  const tx = db.transaction("completions", "readonly");
  const index = tx.objectStore("completions").index("date");
  const range = IDBKeyRange.bound(startDate, endDate);
  return promisifyRequest(index.getAll(range));
}

export async function getCompletionsForMonth(year, month) {
  const mm = String(month).padStart(2, "0");
  const daysInMonth = new Date(year, month, 0).getDate();
  const start = `${year}-${mm}-01`;
  const end = `${year}-${mm}-${String(daysInMonth).padStart(2, "0")}`;
  return getCompletionsInRange(start, end);
}

export async function getAllCompletions() {
  const db = await openDB();
  const tx = db.transaction("completions", "readonly");
  return promisifyRequest(tx.objectStore("completions").getAll());
}

export async function getCompletionsForTask(taskId) {
  const db = await openDB();
  const tx = db.transaction("completions", "readonly");
  const index = tx.objectStore("completions").index("taskId");
  return promisifyRequest(index.getAll(taskId));
}

/**
 * Check or uncheck a task for a given date. This is the one place EXP
 * changes hands, and it runs as a single IndexedDB transaction spanning
 * tasks + completions + meta so a completion record and the lifetime EXP
 * total can never drift apart (e.g. from a tab closing mid-write).
 *
 * - Checking: snapshots the task's current name/EXP value onto the
 *   completion record, then adds that EXP to the lifetime total.
 * - Unchecking: removes the record and subtracts its *snapshotted* EXP —
 *   never the task's current EXP value, so editing a task later can't
 *   corrupt EXP that was already earned under the old value.
 *
 * Toggles for the same (date, task) are serialized: two rapid clicks would
 * otherwise open two transactions that both read "not completed" and both
 * award EXP, inflating the lifetime total. Chaining makes the second click
 * run after the first commits, so check-then-uncheck behaves exactly like
 * the checkbox the user actually sees.
 */
const inflightToggles = new Map();

export function toggleCompletion(date, taskId) {
  const compId = makeId(date, taskId);
  const previous = inflightToggles.get(compId) || Promise.resolve();
  const current = previous
    .catch(() => {})
    .then(() => runToggle(date, taskId, compId));

  inflightToggles.set(compId, current);
  current.finally(() => {
    if (inflightToggles.get(compId) === current) inflightToggles.delete(compId);
  });
  return current;
}

async function runToggle(date, taskId, compId) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(["tasks", "completions", "meta"], "readwrite");
    const taskStore = tx.objectStore("tasks");
    const compStore = tx.objectStore("completions");
    const metaStore = tx.objectStore("meta");
    let result = null;

    const getCompReq = compStore.get(compId);
    getCompReq.onsuccess = () => {
      const existing = getCompReq.result;

      if (existing) {
        // Uncheck.
        compStore.delete(compId);
        const getMetaReq = metaStore.get("lifetimeExp");
        getMetaReq.onsuccess = () => {
          const current = getMetaReq.result ? getMetaReq.result.value : 0;
          const updated = Math.max(0, current - existing.expAwarded);
          metaStore.put({ key: "lifetimeExp", value: updated });
          result = { action: "removed", expDelta: -existing.expAwarded, lifetimeExp: updated };
        };
      } else {
        // Check — needs the task's current EXP value to snapshot.
        const getTaskReq = taskStore.get(taskId);
        getTaskReq.onsuccess = () => {
          const task = getTaskReq.result;
          if (!task) {
            // Task was deleted between render and click; nothing to award.
            result = { action: "skipped", expDelta: 0, lifetimeExp: null };
            return;
          }
          const record = {
            id: compId,
            date,
            taskId,
            taskName: task.name,
            expAwarded: task.expValue,
            completedAt: new Date().toISOString(),
          };
          compStore.put(record);
          const getMetaReq = metaStore.get("lifetimeExp");
          getMetaReq.onsuccess = () => {
            const current = getMetaReq.result ? getMetaReq.result.value : 0;
            const updated = current + task.expValue;
            metaStore.put({ key: "lifetimeExp", value: updated });
            result = { action: "added", expDelta: task.expValue, lifetimeExp: updated };
          };
        };
      }
    };

    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Re-add a completion record exactly as it was (Undo for unchecking):
 * re-puts the original record and credits its snapshotted expAwarded back
 * to the lifetime total — never the task's *current* EXP value, so a task
 * edited between uncheck and undo can't change what gets restored.
 */
export async function restoreCompletion(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["completions", "meta"], "readwrite");
    const compStore = tx.objectStore("completions");
    const metaStore = tx.objectStore("meta");
    let lifetimeExp = null;

    compStore.put(record);
    const getMetaReq = metaStore.get("lifetimeExp");
    getMetaReq.onsuccess = () => {
      const current = getMetaReq.result ? getMetaReq.result.value : 0;
      lifetimeExp = current + record.expAwarded;
      metaStore.put({ key: "lifetimeExp", value: lifetimeExp });
    };

    tx.oncomplete = () => resolve({ action: "restored", expDelta: record.expAwarded, lifetimeExp });
    tx.onerror = () => reject(tx.error);
  });
}
