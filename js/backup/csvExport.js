import * as completionsRepo from "../db/completionsRepo.js";

/**
 * Raw monthly data export for spreadsheets (complements the PDF report).
 * CSV is escaped for Excel; a UTF-8 BOM is prepended so accents render
 * correctly when opened directly.
 */

function escapeCsv(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** completedAt is stored as a UTC ISO string; show only the local wall-clock
 *  time (HH:MM) because the date is already its own column. Records without a
 *  timestamp (very old imports) export as an empty cell. */
function formatCompletedTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Pure CSV builder (testable without a DOM). */
export function buildMonthCSV(completions) {
  const rows = [
    ["Date", "Task Name", "EXP Earned", "Time"],
    ...completions.map((c) => [c.date, c.taskName, c.expAwarded, formatCompletedTime(c.completedAt)]),
  ];
  return rows.map((r) => r.map(escapeCsv).join(",")).join("\r\n");
}

export async function exportMonthCSV(yearMonth) {
  const [year, month] = yearMonth.split("-").map(Number);
  const completions = await completionsRepo.getCompletionsForMonth(year, month);
  const csv = "\ufeff" + buildMonthCSV(completions);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `daily-tracker-${yearMonth}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}