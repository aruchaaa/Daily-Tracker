import * as completionsRepo from "../db/completionsRepo.js";

/**
 * Historical records are read-only by design: there is no edit/delete path
 * wired to past dates anywhere in the UI. Completion records are
 * self-contained snapshots (taskName/expAwarded captured at completion
 * time), so this never needs to join back to the live tasks store —
 * a task being renamed, re-valued, or deleted later cannot change what
 * history shows for a past day.
 */
export async function getDayRecord(date) {
  const completions = await completionsRepo.getCompletionsForDate(date);
  const totalExp = completions.reduce((sum, c) => sum + c.expAwarded, 0);
  // Records imported from very old backups can lack completedAt — sort them
  // as oldest instead of crashing on undefined.localeCompare.
  const sorted = [...completions].sort((a, b) =>
    (a.completedAt || "").localeCompare(b.completedAt || "")
  );
  return { date, completions: sorted, totalExp };
}
