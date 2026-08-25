import { openDB, promisifyRequest, txDone } from "./db.js";
import { generateId } from "../utils.js";

/** Convert "HH:MM" to minutes since midnight for time-based sorting. */
function timeToSortOrder(startTime) {
  if (!startTime) return undefined;
  const [h, m] = startTime.split(":").map(Number);
  return h * 60 + m;
}

export async function createTask({ name, expValue, startTime, endTime }) {
  const db = await openDB();
  const now = new Date().toISOString();
  const task = {
    id: generateId(),
    name: name.trim(),
    expValue: Number(expValue),
    isActive: true,
    startTime: startTime || "",
    endTime: endTime || "",
    // Scheduled tasks sort by time (minutes since midnight); unscheduled
    // ones get a large timestamp so they appear at the end until dragged.
    sortOrder: startTime ? timeToSortOrder(startTime) : Date.now(),
    createdAt: now,
    updatedAt: now,
  };
  const tx = db.transaction("tasks", "readwrite");
  tx.objectStore("tasks").put(task);
  await txDone(tx);
  return task;
}

export async function updateTask(id, changes) {
  const db = await openDB();
  const tx = db.transaction("tasks", "readwrite");
  const store = tx.objectStore("tasks");
  const existing = await promisifyRequest(store.get(id));
  if (!existing) throw new Error("Task not found");
  const updated = { ...existing, ...changes, updatedAt: new Date().toISOString() };
  // Re-derive sortOrder when startTime changes so scheduled tasks
  // stay in time order even after editing.
  if ("startTime" in changes) {
    updated.sortOrder = changes.startTime
      ? timeToSortOrder(changes.startTime)
      : existing.sortOrder;
  }
  store.put(updated);
  await txDone(tx);
  return updated;
}

export async function deleteTask(id) {
  const db = await openDB();
  const tx = db.transaction("tasks", "readwrite");
  tx.objectStore("tasks").delete(id);
  await txDone(tx);
}

export async function getAllTasks() {
  const db = await openDB();
  const tx = db.transaction("tasks", "readwrite");
  const store = tx.objectStore("tasks");
  const tasks = await promisifyRequest(store.getAll());

  // Re-derive sortOrder for scheduled tasks so tasks created before the
  // sortOrder system (or edited without triggering the updateTask path)
  // still sort by time.  Persists the fix so subsequent reads are fast.
  let changed = false;
  for (const task of tasks) {
    if (task.startTime) {
      const correct = timeToSortOrder(task.startTime);
      if (task.sortOrder !== correct) {
        task.sortOrder = correct;
        store.put(task);
        changed = true;
      }
    }
  }
  if (changed) await txDone(tx);

  return tasks.sort(compareTasks);
}

/** Manual order when the user reorders unscheduled tasks (sortOrder),
 *  with createdAt as the stable fallback for tasks that predate reordering. */
function compareTasks(a, b) {
  const ka = a.sortOrder !== undefined ? a.sortOrder : Date.parse(a.createdAt) || 0;
  const kb = b.sortOrder !== undefined ? b.sortOrder : Date.parse(b.createdAt) || 0;
  return ka - kb;
}

export async function getActiveTasks() {
  // Deliberately NOT using the isActive index: boolean is not a valid
  // IndexedDB key type (Chrome coerces true/false to 1/0 for the stored
  // key), so an index query for only(true) is unreliable across browsers.
  // getAll + filter is small-data, unambiguous, and correct everywhere.
  const tasks = await getAllTasks();
  return tasks.filter((t) => t.isActive);
}

export async function getTaskById(id) {
  const db = await openDB();
  const tx = db.transaction("tasks", "readonly");
  return promisifyRequest(tx.objectStore("tasks").get(id));
}

/** Recreate a deleted task with its original id and every field (Undo).
 *  Deletions keep history records, so restoring the snapshot reconnects
 *  the task to its past completions exactly as it was. */
export async function restoreTask(task) {
  const db = await openDB();
  const tx = db.transaction("tasks", "readwrite");
  tx.objectStore("tasks").put(task);
  await txDone(tx);
  return task;
}

/** Renumber manual order so `ids` become the list order (drag-and-drop).
 *  Assigns small integers rather than timestamps: this normalizes any
 *  legacy task that previously fell back to its createdAt, so the whole
 *  list sorts exactly as the user arranged it. */
export async function setTaskOrder(ids) {
  for (let i = 0; i < ids.length; i++) {
    await updateTask(ids[i], { sortOrder: i });
  }
}
