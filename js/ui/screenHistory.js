import { getDayRecord } from "../core/history.js";
import * as completionsRepo from "../db/completionsRepo.js";
import * as notesRepo from "../db/notesRepo.js";
import { getTodayDateString, formatDateDisplay } from "../utils.js";
import { playOpen, playSave, playError } from "../core/sounds.js";
import { t } from "../core/i18n.js";
import { el, buildEmptyState } from "./components.js";
import { showToast } from "./toast.js";

const WEEKDAY_HEADERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export async function renderHistory(container) {
  container.innerHTML = "";

  const now = new Date();
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const calendarHost = el("div", { class: "history-calendar" });
  const resultArea = el("div", { class: "history-result", id: "history-print-area" });
  const monthInput = el("input", {
    type: "month",
    class: "input",
    value: currentYM,
    max: currentYM,
    onchange: async () => {
      try {
        await loadMonth(monthInput.value, calendarHost, resultArea);
      } catch (err) {
        playError();
        showToast(t("history.loadFailed") + ": " + err.message, "error");
      }
    },
  });

  container.append(
    el("h2", { class: "section-title", text: t("history.title") }),
    el("div", { class: "history-picker" }, [monthInput]),
    calendarHost,
    resultArea
  );

  await loadMonth(currentYM, calendarHost, resultArea);
}

/** Renders the month calendar grid and the detail for the selected day.
 *  History is read-only: completion toggles only happen on Home. */
async function loadMonth(yearMonth, calendarHost, resultArea) {
  const [year, month] = yearMonth.split("-").map(Number);
  const today = getTodayDateString();

  const monthCompletions = await completionsRepo.getCompletionsForMonth(year, month);
  const countsByDate = new Map();
  monthCompletions.forEach((c) => {
    countsByDate.set(c.date, (countsByDate.get(c.date) || 0) + 1);
  });

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstWeekday = new Date(year, month - 1, 1).getDay();

  const grid = el("div", { class: "cal-grid" });
  WEEKDAY_HEADERS.forEach((w) => grid.appendChild(el("div", { class: "cal-head", text: w })));

  let selectedDate = today;
  if (!today.startsWith(yearMonth)) selectedDate = `${yearMonth}-01`;

  for (let i = 0; i < firstWeekday; i++) {
    grid.appendChild(el("div", { class: "cal-cell cal-cell--blank" }));
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${yearMonth}-${String(d).padStart(2, "0")}`;
    const count = countsByDate.get(dateStr) || 0;
    const classes = ["cal-cell"];
    if (count > 0) classes.push(`cal-cell--done-${Math.min(4, count)}`);
    if (dateStr === today) classes.push("cal-cell--today");
    if (dateStr === selectedDate) classes.push("cal-cell--selected");

    const cell = el("button", {
      type: "button",
      class: classes.join(" "),
      text: String(d),
      onclick: async () => {
        playOpen();
        selectedDate = dateStr;
        grid.querySelectorAll(".cal-cell--selected").forEach((c) => c.classList.remove("cal-cell--selected"));
        cell.classList.add("cal-cell--selected");
        try {
          await loadDay(dateStr, resultArea);
        } catch (err) {
          playError();
          showToast(t("history.loadFailed") + ": " + err.message, "error");
        }
      },
    });
    grid.appendChild(cell);
  }

  calendarHost.innerHTML = "";
  calendarHost.appendChild(grid);
  await loadDay(selectedDate, resultArea);
}

async function loadDay(date, resultArea) {
  resultArea.innerHTML = "";
  const record = await getDayRecord(date);

  resultArea.append(
    el("div", { class: "history-date-title", text: formatDateDisplay(date) }),
    el("div", { class: "history-total", text: t("history.total", { exp: record.totalExp }) })
  );

  if (record.completions.length === 0) {
    resultArea.appendChild(
      buildEmptyState("clock", t("history.noTasks"), t("history.noTasksDesc"))
    );
    return;
  }

  // Notes are stored per day (taskNotes, keyed <date>_<taskId>), so each
  // past day shows exactly the note written on that day — a task renamed
  // or deleted later can't change what history shows, and today's note
  // edits never leak backwards.
  const noteByTaskId = new Map(
    (await notesRepo.getNotesForDate(date)).map((n) => [n.taskId, n.note])
  );

  const list = el("div", { class: "history-list" });
  record.completions.forEach((c) => {
    const note = noteByTaskId.get(c.taskId) || "";
    list.appendChild(
      el("div", { class: "history-item" }, [
        el("div", { class: "history-item__main" }, [
          el("span", { text: c.taskName }),
          note
            ? el("span", {
                class: "history-item__notes",
                text: t("history.note", { text: note.length > 80 ? `${note.slice(0, 77)}\u2026` : note }),
              })
            : null,
        ]),
        el("span", { class: "history-item__exp", text: `+${c.expAwarded} EXP` }),
      ])
    );
  });
  resultArea.append(
    list,
    el("button", {
      class: "btn",
      type: "button",
      text: t("history.exportPdf"),
      onclick: () => {
        playSave();
        window.print();
      },
    })
  );
}