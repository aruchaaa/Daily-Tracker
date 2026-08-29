import * as tasksRepo from "../db/tasksRepo.js";
import * as notesRepo from "../db/notesRepo.js";
import { getTaskStats } from "../core/taskStats.js";
import { scheduleTodayReminders } from "../core/notifications.js";
import { getTodayDateString } from "../utils.js";
import { playSave, playError } from "../core/sounds.js";
import { t } from "../core/i18n.js";
import { el, buildHeatmap, buildEmptyState, statCard, formatTimeRange } from "./components.js";
import { showToast } from "./toast.js";

export async function renderTaskDetail(container, taskId) {
  container.innerHTML = "";
  const task = await tasksRepo.getTaskById(taskId);

  const backLink = el("a", { href: "#/tasks", class: "back-link", text: t("detail.back") });

  if (!task) {
    container.append(
      backLink,
      buildEmptyState("check", t("detail.notExist"), t("detail.notExistDesc"))
    );
    return;
  }

  const [stats, todayNote] = await Promise.all([
    getTaskStats(task.id),
    notesRepo.getNote(getTodayDateString(), task.id),
  ]);
  const timeRange = formatTimeRange(task);

  const grid = el("div", { class: "report-grid" }, [
    statCard(t("detail.currentStreak"), `${stats.currentStreak} ${stats.currentStreak === 1 ? t("detail.day") : t("detail.days")}`),
    statCard(t("detail.longestStreak"), `${stats.longestStreak} ${stats.longestStreak === 1 ? t("detail.day") : t("detail.days")}`),
    statCard(t("detail.totalCleared"), stats.totalCompletions),
    statCard(t("detail.expValue"), task.expValue),
  ]);

  container.append(
    backLink,
    el("h2", { class: "section-title", text: task.name }),
    // .append() is the native DOM method here, not the el() helper — it
    // does NOT filter null/undefined (it stringifies them to "null"), so
    // an optional element needs the spread-empty-array guard instead of a
    // bare ternary.
    ...(timeRange ? [el("p", { class: "task-detail-time", text: timeRange })] : []),
    buildNotesCard(task, todayNote),
    buildReminderCard(task, container),
    grid,
    el("h3", { class: "profile-subheading", text: t("detail.lastWeeks", { n: stats.heatmapWeeks }) }),
    buildHeatmap(stats.cells, stats.heatmapWeeks, {
      startDate: stats.heatmapStart,
      endDate: stats.heatmapEnd,
    })
  );
}

function buildNotesCard(task, todayNote) {
  const textarea = el("textarea", {
    class: "input notes-textarea",
    placeholder: t("detail.notesPlaceholder"),
    maxlength: "1000",
  });
  textarea.value = todayNote || "";

  const saveBtn = el("button", {
    class: "btn btn--primary",
    type: "button",
    text: t("detail.saveNotes"),
    onclick: async () => {
      const notes = textarea.value.trim();
      try {
        await notesRepo.setNote(getTodayDateString(), task.id, notes);
        playSave();
        showToast(notes ? t("detail.notesSaved") : t("detail.notesCleared"), "success");
      } catch (e) {
        playError();
        showToast(t("detail.notesFailed") + ": " + e.message, "error");
      }
    },
  });

  return el("div", { class: "moment-card" }, [
    el("div", { class: "profile-name-card__label", text: t("detail.notes") }),
    el("p", { class: "settings-desc", text: t("detail.notesToday") }),
    textarea,
    saveBtn,
  ]);
}

/** Per-task reminder time, independent of the task's scheduled window.
 *  Falls back to startTime in the scheduler when unset. */
function buildReminderCard(task, container) {
  const input = el("input", { type: "time", class: "input input--time", title: t("detail.reminderTime") });
  input.value = task.reminderTime || "";

  const saveBtn = el("button", {
    class: "btn",
    type: "button",
    text: t("detail.saveReminder"),
    onclick: async () => {
      try {
        await tasksRepo.updateTask(task.id, { reminderTime: input.value });
        playSave();
        showToast(input.value ? t("detail.reminderSet", { time: input.value }) : t("detail.reminderCleared"));
        scheduleTodayReminders(); // re-arm today's timers with the new time
      } catch (e) {
        playError();
        showToast(t("detail.reminderFailed") + ": " + e.message, "error");
      }
    },
  });

  return el("div", { class: "moment-card" }, [
    el("div", { class: "profile-name-card__label", text: t("detail.dailyReminder") }),
    el("div", { class: "accent-picker-row" }, [input, saveBtn]),
    el("p", { class: "settings-desc", text: t("detail.reminderDesc") }),
  ]);
}
