import { openDB, promisifyRequest, txDone } from "./db.js";

export async function getLifetimeExp() {
  const db = await openDB();
  const tx = db.transaction("meta", "readonly");
  const record = await promisifyRequest(tx.objectStore("meta").get("lifetimeExp"));
  return record ? record.value : 0;
}

export async function setLifetimeExp(value) {
  const db = await openDB();
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put({ key: "lifetimeExp", value });
  await txDone(tx);
}

export async function getCharacterName() {
  const db = await openDB();
  const tx = db.transaction("meta", "readonly");
  const record = await promisifyRequest(tx.objectStore("meta").get("characterName"));
  return record ? record.value : "";
}

export async function setCharacterName(name) {
  const db = await openDB();
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put({ key: "characterName", value: name });
  await txDone(tx);
}

export async function getTheme() {
  const db = await openDB();
  const tx = db.transaction("meta", "readonly");
  const record = await promisifyRequest(tx.objectStore("meta").get("theme"));
  return record ? record.value : "";
}

export async function setTheme(themeId) {
  const db = await openDB();
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put({ key: "theme", value: themeId });
  await txDone(tx);
}

export async function getLastBackupAt() {
  const db = await openDB();
  const tx = db.transaction("meta", "readonly");
  const record = await promisifyRequest(tx.objectStore("meta").get("lastBackupAt"));
  return record ? record.value : "";
}

export async function setLastBackupAt(isoString) {
  const db = await openDB();
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put({ key: "lastBackupAt", value: isoString });
  await txDone(tx);
}

/** yearMonth is "YYYY-MM". One freeform note per month, stored as its own
 *  meta row (meta is a flat key-value store, so a namespaced key is enough
 *  — no new object store needed for this). */
export async function getMemorableMoment(yearMonth) {
  const db = await openDB();
  const tx = db.transaction("meta", "readonly");
  const record = await promisifyRequest(tx.objectStore("meta").get(`momentNote:${yearMonth}`));
  return record ? record.value : "";
}

export async function setMemorableMoment(yearMonth, text) {
  const db = await openDB();
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put({ key: `momentNote:${yearMonth}`, value: text });
  await txDone(tx);
}

export async function getCustomAccent() {
  const db = await openDB();
  const tx = db.transaction("meta", "readonly");
  const record = await promisifyRequest(tx.objectStore("meta").get("customAccent"));
  return record ? record.value : "";
}

export async function setCustomAccent(hexColor) {
  const db = await openDB();
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put({ key: "customAccent", value: hexColor });
  await txDone(tx);
}

/** Every meta row (key/value pairs) — used by the backup exporter so a
 *  restore brings back theme, accent, name, moments, etc., not just EXP. */
export async function getAllMeta() {
  const db = await openDB();
  const tx = db.transaction("meta", "readonly");
  return promisifyRequest(tx.objectStore("meta").getAll());
}

export async function getDailyTargetExp() {
  const db = await openDB();
  const tx = db.transaction("meta", "readonly");
  const record = await promisifyRequest(tx.objectStore("meta").get("dailyTargetExp"));
  return record ? Number(record.value) || 0 : 0;
}

export async function setDailyTargetExp(value) {
  const db = await openDB();
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put({ key: "dailyTargetExp", value: Number(value) || 0 });
  await txDone(tx);
}

export async function getRemindersEnabled() {
  const db = await openDB();
  const tx = db.transaction("meta", "readonly");
  const record = await promisifyRequest(tx.objectStore("meta").get("remindersEnabled"));
  return record ? Boolean(record.value) : false;
}

export async function setRemindersEnabled(value) {
  const db = await openDB();
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put({ key: "remindersEnabled", value: Boolean(value) });
  await txDone(tx);
}

export async function getSoundEnabled() {
  const db = await openDB();
  const tx = db.transaction("meta", "readonly");
  const record = await promisifyRequest(tx.objectStore("meta").get("soundEnabled"));
  return record ? Boolean(record.value) : false;
}

export async function setSoundEnabled(value) {
  const db = await openDB();
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put({ key: "soundEnabled", value: Boolean(value) });
  await txDone(tx);
}

export async function getOnboardingDone() {
  const db = await openDB();
  const tx = db.transaction("meta", "readonly");
  const record = await promisifyRequest(tx.objectStore("meta").get("onboardingDone"));
  return record ? Boolean(record.value) : false;
}

export async function setOnboardingDone(value) {
  const db = await openDB();
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put({ key: "onboardingDone", value: Boolean(value) });
  await txDone(tx);
}

export async function getLang() {
  const db = await openDB();
  const tx = db.transaction("meta", "readonly");
  const record = await promisifyRequest(tx.objectStore("meta").get("lang"));
  return record ? record.value : "en";
}

export async function setLang(value) {
  const db = await openDB();
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put({ key: "lang", value });
  await txDone(tx);
}

/** Unlocked achievements are stored as `[{ id, at }]` (at = ISO timestamp of
 *  unlock). Accepts legacy values that were plain id strings. */
export async function getUnlockedAchievements() {
  const db = await openDB();
  const tx = db.transaction("meta", "readonly");
  const record = await promisifyRequest(tx.objectStore("meta").get("achievements"));
  const value = Array.isArray(record && record.value) ? record.value : [];
  return value.map((entry) =>
    typeof entry === "string" ? { id: entry, at: null } : { id: entry.id, at: entry.at || null }
  );
}

export async function setUnlockedAchievements(entries) {
  const db = await openDB();
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put({ key: "achievements", value: entries });
  await txDone(tx);
}

/** Read-modify-write helper used by the achievement evaluator: appends the
 *  new ids with their unlock timestamp. */
export async function addUnlockedAchievements(newIds) {
  const current = await getUnlockedAchievements();
  const existing = new Set(current.map((e) => e.id));
  const now = new Date().toISOString();
  const merged = [
    ...current,
    ...newIds.filter((id) => !existing.has(id)).map((id) => ({ id, at: now })),
  ];
  await setUnlockedAchievements(merged);
  return merged;
}
