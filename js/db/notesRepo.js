import { openDB, promisifyRequest, txDone } from "./db.js";

function makeId(date, taskId) {
  return `${date}_${taskId}`;
}

/** The note written for a task on a specific day; "" when none exists. */
export async function getNote(date, taskId) {
  const db = await openDB();
  const tx = db.transaction("taskNotes", "readonly");
  const record = await promisifyRequest(tx.objectStore("taskNotes").get(makeId(date, taskId)));
  return record ? record.note : "";
}

/** Every note on a date — History joins these by taskId. */
export async function getNotesForDate(date) {
  const db = await openDB();
  const tx = db.transaction("taskNotes", "readonly");
  const index = tx.objectStore("taskNotes").index("date");
  return promisifyRequest(index.getAll(date));
}

/** Upsert a note for (date, task). Blank text deletes that day's record, so
 *  clearing today's note can't touch any earlier day's note. */
export async function setNote(date, taskId, note) {
  const db = await openDB();
  const tx = db.transaction("taskNotes", "readwrite");
  const store = tx.objectStore("taskNotes");
  const id = makeId(date, taskId);
  const text = (note || "").trim();
  if (!text) {
    store.delete(id);
  } else {
    store.put({ id, date, taskId, note: text, updatedAt: new Date().toISOString() });
  }
  await txDone(tx);
}

/** Every note record — used by the backup exporter. */
export async function getAllNotes() {
  const db = await openDB();
  const tx = db.transaction("taskNotes", "readonly");
  return promisifyRequest(tx.objectStore("taskNotes").getAll());
}