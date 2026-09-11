import { generateReport } from "../core/monthlyReport.js";
import * as completionsRepo from "../db/completionsRepo.js";
import * as metaRepo from "../db/metaRepo.js";
import { monthName } from "../utils.js";
import { exportMonthCSV, exportAllCSV } from "../backup/csvExport.js";
import { getWeeklySummary } from "../core/weeklySummary.js";
import { playSave, playError, playOpen } from "../core/sounds.js";
import { el, statCard, gradeClass, buildEmptyState } from "./components.js";
import { showToast } from "./toast.js";
import { t, monthShortName, dayFullName } from "../core/i18n.js";

export async function renderReport(container) {
  container.innerHTML = "";
  const now = new Date();
  const currentValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const resultArea = el("div", { class: "report-result", id: "report-print-area" });
  const monthInput = el("input", {
    type: "month",
    class: "input",
    value: currentValue,
    max: currentValue,
  });
  const generateBtn = el("button", {
    class: "btn btn--primary",
    type: "button",
    text: t("report.generate"),
    onclick: async () => {
      playOpen();
      try {
        await loadReport(monthInput.value, resultArea);
      } catch (e) {
        playError();
        showToast(t("report.loadFailed") + ": " + e.message, "error");
      }
    },
  });
  const csvBtn = el("button", {
    class: "btn",
    type: "button",
    text: t("report.exportCsv"),
    onclick: async () => {
      try {
        await exportMonthCSV(monthInput.value);
        playSave();
        showToast(t("report.csvDownloaded"), "success");
      } catch (e) {
        playError();
        showToast(t("report.csvFailed") + ": " + e.message, "error");
      }
    },
  });
  const allCsvBtn = el("button", {
    class: "btn",
    type: "button",
    text: t("report.exportAllCsv"),
    onclick: async () => {
      try {
        await exportAllCSV();
        playSave();
        showToast(t("report.csvAllDownloaded"), "success");
      } catch (e) {
        playError();
        showToast(t("report.csvFailed") + ": " + e.message, "error");
      }
    },
  });

  container.append(
    el("h2", { class: "section-title", text: t("report.title") }),
    el("h3", { class: "profile-subheading", text: t("report.monthlyReport") }),
    el("div", { class: "report-controls" }, [monthInput, generateBtn, csvBtn, allCsvBtn]),
    resultArea,
    await buildYearGrid(now.getFullYear())
  );

  await loadReport(currentValue, resultArea);
}

/** 12-month completion grid for the current year (display-only — the
 *  month input above is the way to load a report). Computed in parallel. */
async function buildYearGrid(year) {
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const reports = await Promise.all(months.map((m) => generateReport(year, m)));

  const tiles = months.map((m, idx) => {
    const ym = `${year}-${String(m).padStart(2, "0")}`;
    const report = reports[idx];
    const now = new Date();
    const isCurrent = ym === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const classes = ["year-tile"];
    if (report.totalExpEarned === 0) classes.push("year-tile--empty");
    if (isCurrent) classes.push("year-tile--current");

    return el(
      "div",
      {
        class: classes.join(" "),
        title: report.totalExpEarned === 0 ? t("report.noActivity") : t("report.completionPct", { pct: report.completionPercent }),
      },
      [
        el("span", { class: "year-tile__month", text: monthShortName(m) }),
        report.totalExpEarned === 0
          ? el("span", { class: "year-tile__pct", text: "\u2013" })
          : el("span", { class: `year-tile__pct ${gradeClass(report.grade)}`, text: `${report.completionPercent}%` }),
      ]
    );
  });

  return el("div", { class: "year-section" }, [
    el("h3", { class: "profile-subheading", text: t("report.yearAtGlance", { year }) }),
    el("div", { class: "year-grid" }, tiles),
  ]);
}

async function loadReport(yearMonth, resultArea) {
  resultArea.innerHTML = "";
  const [year, month] = yearMonth.split("-").map(Number);
  const [report, characterName, momentText, monthCompletions] = await Promise.all([
    generateReport(year, month),
    metaRepo.getCharacterName(),
    metaRepo.getMemorableMoment(yearMonth),
    completionsRepo.getCompletionsForMonth(year, month),
  ]);
  const weekSummary = getWeeklySummary(monthCompletions, year, month);

  const subtitle = characterName
    ? `${characterName} \u2014 ${t("report.level", { n: report.currentLevel })}`
    : t("report.level", { n: report.currentLevel });

  const header = el("div", { class: "report-header" }, [
    el("div", { class: "report-header__eyebrow", text: t("report.characterReport") }),
    el("div", { class: "report-header__title", text: `${monthName(month)} ${year}` }),
    el("div", { class: "report-header__subtitle", text: subtitle }),
  ]);

  const grid = el("div", { class: "report-grid" }, [
    statCard(t("report.completion"), `${report.completionPercent}%`),
    statCard(t("report.grade"), report.grade, gradeClass(report.grade)),
    statCard(t("report.expEarned"), report.totalExpEarned),
    statCard(t("report.currentLevel"), report.currentLevel),
    statCard(t("report.longestStreak"), `${report.longestStreak} ${report.longestStreak === 1 ? t("detail.day") : t("detail.days")}`),
    statCard(t("report.tasksDone"), `${report.completedOccurrences} / ${report.totalActiveOccurrences}`),
  ]);

  const meterFill = el("div", { class: "completion-meter__fill" });
  meterFill.style.width = `${Math.min(100, report.completionPercent)}%`;
  const completionMeter = el("div", { class: "completion-meter" }, [
    el("div", { class: "completion-meter__label", text: t("report.completionPercent", { pct: report.completionPercent }) }),
    el("div", { class: "completion-meter__track" }, [meterFill]),
  ]);

  const printBtn = el("button", {
    class: "btn",
    type: "button",
    text: t("report.exportPdf"),
    onclick: () => {
      playSave();
      window.print();
    },
  });

  const footer = el("div", {
    class: "report-footer",
    text: t("report.generated", { date: new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) }),
  });

  resultArea.append(header, completionMeter, grid, el("div", { class: "report-actions" }, [printBtn]), buildWeeklySection(weekSummary), buildTaskTallySection(report.taskTally), buildMomentSection(yearMonth, momentText), footer);
}

/** Per-week EXP/done bars (Monday-start, clipped to the month) plus the
 *  month's best completion-rate day. Reuses the tally-bar styles. */
function buildWeeklySection(summary) {
  const maxExp = Math.max(1, ...summary.weeks.map((w) => w.exp));
  const rows = summary.weeks.map((w) => {
    const fill = el("div", { class: "tally-bar__fill" });
    fill.style.width = `${(w.exp / maxExp) * 100}%`;
    return el("div", { class: "tally-row" }, [
      el("div", { class: "tally-row__label" }, [
        el("span", { class: "tally-row__name", text: `${shortLabel(w.start)}\u2013${shortLabel(w.end)}` }),
        el("span", { class: "tally-row__count", text: `${w.done}\u00d7 \u00b7 ${w.exp} EXP` }),
      ]),
      el("div", { class: "tally-bar" }, [fill]),
    ]);
  });
  const best =
    summary.bestDay
      ? el("div", {
          class: "week-summary__best",
          text: t("report.bestDay", { day: dayFullName(summary.bestDay.day), pct: Math.round(summary.bestDay.rate * 100) }),
        })
      : null;
  return el("div", { class: "week-summary" }, [
    el("div", { class: "profile-name-card__label", text: t("report.weeklyBreakdown") }),
    el("div", { class: "tally-list" }, rows),
    best,
  ]);
}

function shortLabel(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${monthShortName(m)} ${d}`;
}

function buildTaskTallySection(taskTally) {
  const body =
    taskTally.length === 0
      ? buildEmptyState("chart", t("report.noTasksThisMonth"), t("report.checkHome"))
      : el(
          "div",
          { class: "tally-list" },
          taskTally.map((task) => buildTallyRow(task, taskTally[0].count))
        );

  return el("div", { class: "moment-card" }, [
    el("div", { class: "profile-name-card__label", text: t("report.taskBreakdown") }),
    body,
  ]);
}

function buildTallyRow(task, maxCount) {
  const fill = el("div", { class: "tally-bar__fill" });
  fill.style.width = `${(task.count / maxCount) * 100}%`;
  return el("div", { class: "tally-row" }, [
    el("div", { class: "tally-row__label" }, [
      el("span", { class: "tally-row__name", text: task.name }),
      el("span", { class: "tally-row__count", text: `${task.count}\u00d7` }),
    ]),
    el("div", { class: "tally-bar" }, [fill]),
  ]);
}

function buildMomentSection(yearMonth, currentText) {
  const textarea = el("textarea", {
    class: "input moment-textarea",
    placeholder: t("report.momentPlaceholder"),
    maxlength: "500",
  });
  textarea.value = currentText || "";

  const saveBtn = el("button", {
    class: "btn btn--primary",
    type: "button",
    text: t("report.saveMoment"),
    onclick: async () => {
      try {
        await metaRepo.setMemorableMoment(yearMonth, textarea.value.trim());
        playSave();
        showToast(t("report.momentSaved"), "success");
      } catch (err) {
        playError();
        showToast(t("report.saveMomentFailed") + ": " + err.message, "error");
      }
    },
  });

  return el("div", { class: "moment-card" }, [
    el("div", { class: "profile-name-card__label", text: t("report.memorableMoment") }),
    textarea,
    saveBtn,
  ]);
}
