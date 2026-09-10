import { openDB, promisifyRequest, txDone } from "./db.js";

/** Returns hours slept for a date, or null if nothing logged yet. */
export async function getSleepHours(date) {
  const db = await openDB();
  const tx = db.transaction("sleepLogs", "readonly");
  const record = await promisifyRequest(tx.objectStore("sleepLogs").get(date));
  return record ? record.hours : null;
}

/** Upsert — logging again for the same date just overwrites the value,
 *  since this is a simple daily fact, not something with "once per day"
 *  scarcity like task EXP. */
export async function setSleepHours(date, hours) {
  const db = await openDB();
  const tx = db.transaction("sleepLogs", "readwrite");
  tx.objectStore("sleepLogs").put({ date, hours, loggedAt: new Date().toISOString() });
  await txDone(tx);
}

export async function getSleepInRange(startDate, endDate) {
  const db = await openDB();
  const tx = db.transaction("sleepLogs", "readonly");
  // date IS the keyPath here (no separate index needed for a range query).
  const range = IDBKeyRange.bound(startDate, endDate);
  return promisifyRequest(tx.objectStore("sleepLogs").getAll(range));
}

/** Every sleep log — used by the backup exporter. */
export async function getAllSleepLogs() {
  const db = await openDB();
  const tx = db.transaction("sleepLogs", "readonly");
  return promisifyRequest(tx.objectStore("sleepLogs").getAll());
}
