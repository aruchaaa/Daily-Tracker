// Single IndexedDB connection, opened once and reused. All data lives here —
// there is no server, so this is the entire persistence layer.

const DB_NAME = "DailyTrackerDB";
const DB_VERSION = 3;

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const oldVersion = event.oldVersion;

      if (!db.objectStoreNames.contains("tasks")) {
        const taskStore = db.createObjectStore("tasks", { keyPath: "id" });
        taskStore.createIndex("isActive", "isActive", { unique: false });
      }

      if (!db.objectStoreNames.contains("completions")) {
        // id is "<date>_<taskId>" — a natural composite key that makes
        // "one completion per task per day" structurally impossible to violate.
        const compStore = db.createObjectStore("completions", { keyPath: "id" });
        compStore.createIndex("date", "date", { unique: false });
        compStore.createIndex("taskId", "taskId", { unique: false });
      }

      if (!db.objectStoreNames.contains("meta")) {
        // Single row of interest: { key: "lifetimeExp", value: <number> }
        db.createObjectStore("meta", { keyPath: "key" });
      }

      if (!db.objectStoreNames.contains("sleepLogs")) {
        // One record per date: { date: "YYYY-MM-DD", hours, loggedAt }
        db.createObjectStore("sleepLogs", { keyPath: "date" });
      }

      if (!db.objectStoreNames.contains("taskNotes")) {
        // One note per task per day, keyed "<date>_<taskId>" like
        // completions. Notes are day-scoped so a note written today never
        // mutates what History shows for a past day.
        const noteStore = db.createObjectStore("taskNotes", { keyPath: "id" });
        noteStore.createIndex("date", "date", { unique: false });
        noteStore.createIndex("taskId", "taskId", { unique: false });

        // v2 → v3 migration: legacy per-task notes become "today's note".
        // Runs inside the versionchange transaction, which covers every
        // store, so the old field is read, copied, and emptied atomically.
        if (oldVersion > 0 && oldVersion < 3) {
          const today = formatLocalDate(new Date());
          const taskStore = txStore(event, "tasks");
          const newNoteStore = txStore(event, "taskNotes");
          const cursorReq = taskStore.openCursor();
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (!cursor) return;
            const task = cursor.value;
            if (task && typeof task.notes === "string" && task.notes.trim()) {
              newNoteStore.put({
                id: `${today}_${task.id}`,
                date: today,
                taskId: task.id,
                note: task.notes.trim(),
                updatedAt: new Date().toISOString(),
              });
              delete task.notes;
              cursor.update(task);
            }
            cursor.continue();
          };
        }
      }
    };

    request.onsuccess = (event) => {
      const db = event.target.result;
      // If another tab opens a newer version, close this connection so its
      // upgrade isn't blocked forever; the next openDB() call reopens at
      // the new version.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = (event) => reject(event.target.error);
    // request.onblocked is intentionally unhandled: the upgrade waits for
    // other tabs to close, which the versionchange handler above triggers.
  }).catch((err) => {
    // Never cache a permanently-rejected promise — a transient failure
    // (quota, private mode, blocked upgrade) can be retried on next call.
    dbPromise = null;
    throw err;
  });

  return dbPromise;
}

/** Wrap a single IDBRequest as a Promise. */
export function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Wrap a whole IDBTransaction as a Promise (resolves on commit). */
export function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
  });
}

/** Local calendar date as YYYY-MM-DD for the versionchange migration. */
function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The versionchange transaction's object store for `name`. */
function txStore(event, name) {
  return event.target.transaction.objectStore(name);
}
