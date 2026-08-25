import * as dailyTracker from "../core/dailyTracker.js";
import * as metaRepo from "../db/metaRepo.js";
import * as tasksRepo from "../db/tasksRepo.js";
import * as sleepRepo from "../db/sleepRepo.js";
import { getLevelProgress, getLevel } from "../core/expEngine.js";
import { evaluateAchievements } from "../core/achievements.js";
import { playTick, playUncheck, playSave, playError, playLevelUp } from "../core/sounds.js";
import { getTodayDateString } from "../utils.js";
import { el, buildLevelPanel, buildEmptyState, buildProgressRing, formatTimeRange } from "./components.js";
import { showToast } from "./toast.js";
import { t } from "../core/i18n.js";

const BACKUP_REMINDER_DAYS = 7;
let bannerDismissedThisSession = false;

export async function renderHome(container, { justLeveledUp = false, justCheckedId = null } = {}) {
  container.innerHTML = "";

  const today = getTodayDateString();
  const [allTasks, lifetimeExp, lastBackupAt, sleepHours, dailyTarget, charName] = await Promise.all([
    tasksRepo.getAllTasks(),
    metaRepo.getLifetimeExp(),
    metaRepo.getLastBackupAt(),
    sleepRepo.getSleepHours(today),
    metaRepo.getDailyTargetExp(),
    metaRepo.getCharacterName(),
  ]);
  const state = await dailyTracker.getTodayState(allTasks);
  const progress = getLevelProgress(lifetimeExp);
  const banner = buildBackupBanner(lastBackupAt, lifetimeExp, allTasks.length, container);

  container.append(
    ...(banner ? [banner] : []),
    buildGreeting(charName),
    buildLevelPanel(progress, { clickable: true, levelUp: justLeveledUp }),
    buildTargetCard(state.totalExpToday, dailyTarget, container),
    el("h2", { class: "section-title", text: t("home.todayTasks") }),
    buildTaskList(state, progress, container, justCheckedId),
    buildTodaySummary(state),
    buildSleepCard(today, sleepHours, container)
  );

  if (!(await metaRepo.getOnboardingDone())) {
    container.appendChild(buildOnboardingOverlay(container));
  }
}

function buildTargetCard(totalExpToday, dailyTarget, container) {
  const ring = buildProgressRing(dailyTarget > 0 ? (totalExpToday / dailyTarget) * 100 : 0, {
    size: 76,
    stroke: 6,
    className: "percent-ring",
  });
  const ringValue = el("span", { class: "target-card__ring-value" });

  const input = el("input", {
    type: "number",
    class: "input input--small",
    min: "0",
    max: "100000",
    placeholder: t("home.expLabel"),
  });
  input.value = dailyTarget > 0 ? String(dailyTarget) : "";

  const saveBtn = el("button", {
    class: "btn btn--primary",
    type: "button",
    text: t("home.targetSet"),
    onclick: async () => {
      const val = Math.floor(parseFloat(input.value));
      if (isNaN(val) || val < 0 || val > 100000) {
        playError();
        showToast(t("home.targetInvalid"), "error");
        return;
      }
      try {
        await metaRepo.setDailyTargetExp(val);
        playSave();
        showToast(val > 0 ? t("home.targetSetTo", { val }) : t("home.targetCleared"));
        renderHome(container);
      } catch (e) {
        playError();
        showToast(t("home.targetFailed") + ": " + e.message, "error");
      }
    },
  });

  const updateValue = () => {
    ringValue.textContent =
      dailyTarget > 0
        ? `${Math.min(100, Math.round((totalExpToday / dailyTarget) * 100))}%`
        : "\u2013";
  };
  updateValue();

  return el("div", { class: "target-card" }, [
    el("div", { class: "target-card__ring" }, [ring, ringValue]),
    el("div", { class: "target-card__body" }, [
      el("div", { class: "target-card__label", text: t("home.targetLabel") }),
      el("div", { class: "target-card__value", text: `${totalExpToday} ${t("home.targetExp")}` }),
      el("div", { class: "target-card__row" }, [input, saveBtn]),
    ]),
  ]);
}

function buildBackupBanner(lastBackupAt, lifetimeExp, taskCount, container) {
  if (bannerDismissedThisSession) return null;
  if (lifetimeExp === 0 && taskCount === 0) return null;

  const daysSince = lastBackupAt ? (Date.now() - new Date(lastBackupAt).getTime()) / 86400000 : Infinity;
  if (daysSince < BACKUP_REMINDER_DAYS) return null;

  const message = lastBackupAt
    ? t("home.noBackupDays", { days: Math.floor(daysSince) })
    : t("home.noBackup");

  return el("div", { class: "backup-banner" }, [
    el("span", { class: "backup-banner__text", text: message }, [
      el("a", { href: "#/settings", class: "backup-banner__link", text: t("home.exportNow") }),
    ]),
    el("button", {
      class: "backup-banner__dismiss",
      type: "button",
      text: "\u00d7",
      onclick: () => {
        bannerDismissedThisSession = true;
        renderHome(container);
      },
    }),
  ]);
}

function buildGreeting(name) {
  const h = new Date().getHours();
  const key = h < 12
    ? (name ? "home.greetingMorning" : "home.greetingMorningNoName")
    : h < 18
      ? (name ? "home.greetingAfternoon" : "home.greetingAfternoonNoName")
      : (name ? "home.greetingEvening" : "home.greetingEveningNoName");
  const text = name ? t(key, { name }) : t(key);
  const icon = h < 12 ? "\u2600\uFE0F" : h < 18 ? "\u2600\uFE0F" : "\uD83C\uDF19";
  return el("div", { class: "home-greeting" }, [
    el("span", { class: "home-greeting__icon", text: icon }),
    el("span", { class: "home-greeting__text", text }),
  ]);
}

function buildTaskList(state, progress, container, justCheckedId) {
  if (state.items.length === 0) {
    return buildEmptyState("plus", t("home.noActiveTasks"), t("home.addSome"));
  }

  const list = el("div", { class: "task-list" });
  state.items.forEach(({ task, isCompleted }) => {
    list.appendChild(buildCheckboxRow(task, isCompleted, progress, container, justCheckedId));
  });
  return list;
}

function buildCheckboxRow(task, isCompleted, progress, container, justCheckedId) {
  const timeRange = formatTimeRange(task);
  const classes = ["task-row"];
  if (isCompleted) classes.push("task-row--done");
  if (isCompleted && task.id === justCheckedId) classes.push("task-row--pop");
  return el("label", { class: classes.join(" ") }, [
    el("input", {
      type: "checkbox",
      checked: isCompleted,
      onchange: async () => {
        try {
          const levelBefore = progress.level;
          const result = await dailyTracker.toggleTask(task.id);
          // Task deleted from another tab mid-click: nothing was awarded.
          // Re-render so the stale row disappears instead of wedging.
          if (!result || result.action === "skipped") {
            renderHome(container);
            return;
          }
          const levelAfter = getLevel(result.lifetimeExp);
          const justLeveledUp = result.action === "added" && levelAfter > levelBefore;

          if (result.action === "added") {
            // Short haptic tick on completion (mobile only; no-op on desktop).
            if (navigator.vibrate) navigator.vibrate(15);
            playTick();
            showToast(`+${result.expDelta} ${t("home.expLabel")}`, "success");
            if (justLeveledUp) {
              playLevelUp();
              showToast(t("home.levelUp", { n: levelAfter }), "info");
            }
            const fresh = await evaluateAchievements();
            fresh.forEach((a) => {
              playLevelUp();
              showToast(t("home.achievementUnlocked", { title: a.title }), "success");
            });
          } else if (result.action === "removed") {
            playUncheck();
            showToast(`\u2212${-result.expDelta} ${t("home.expLabel")}`, "info");
          }

          renderHome(container, {
            justLeveledUp,
            justCheckedId: result.action === "added" ? task.id : null,
          });
        } catch (e) {
          playError();
          showToast(t("home.togglingFailed") + ": " + e.message, "error");
          renderHome(container);
        }
      },
    }),
    el("span", { class: "task-row__name" }, [
      task.name,
      timeRange ? el("span", { class: "task-row__time", text: timeRange }) : null,
    ]),
    el("span", { class: "task-row__exp", text: `+${task.expValue} ${t("home.expLabel")}` }),
  ]);
}

function buildTodaySummary(state) {
  const maxToday = state.items.reduce((sum, i) => sum + i.task.expValue, 0);
  return el("div", { class: "today-summary" }, [
    el("span", { text: t("home.today") }),
    el("span", {
      class: "today-summary__value",
      text: `${state.totalExpToday} / ${maxToday} ${t("home.expLabel")}`,
    }),
  ]);
}

function buildSleepCard(today, currentHours, container) {
  const input = el("input", {
    type: "number",
    class: "input input--small",
    step: "0.5",
    min: "0",
    max: "24",
    placeholder: t("home.hours"),
  });
  input.value = currentHours !== null ? String(currentHours) : "";

  const saveBtn = el("button", {
    class: "btn btn--primary",
    type: "button",
    text: t("home.save"),
    onclick: async () => {
      const val = parseFloat(input.value);
      if (isNaN(val) || val < 0 || val > 24) {
        playError();
        showToast(t("home.enterHours"), "error");
        return;
      }
      try {
        await sleepRepo.setSleepHours(today, val);
        playSave();
        showToast(t("home.sleepSaved"), "success");
      } catch (e) {
        playError();
        showToast(t("home.sleepFailed") + ": " + e.message, "error");
      }
    },
  });

  return el("div", { class: "sleep-card" }, [
    el("div", { class: "sleep-card__label", text: t("home.sleep") }),
    el("div", { class: "sleep-card__row" }, [input, el("span", { text: t("home.hours") }), saveBtn]),
  ]);
}

function buildOnboardingOverlay(container) {
  const dismiss = async () => {
    await metaRepo.setOnboardingDone(true);
    overlay.classList.add("onboarding-overlay--fade");
    setTimeout(() => overlay.remove(), 400);
  };

  const overlay = el("div", { class: "onboarding-overlay" }, [
    el("div", { class: "onboarding-card" }, [
      el("div", { class: "onboarding-icon", text: "\u2728" }),
      el("h2", { class: "onboarding-title", text: t("onboarding.title") }),
      el("p", { class: "onboarding-desc", text: t("onboarding.desc") }),
      el("div", { class: "onboarding-steps" }, [
        el("div", { class: "onboarding-step" }, [
          el("span", { class: "onboarding-step__icon", text: "\u2795" }),
          el("div", {}, [
            el("div", { class: "onboarding-step__title", text: t("onboarding.step1Title") }),
            el("div", { class: "onboarding-step__desc", text: t("onboarding.step1Desc") }),
          ]),
        ]),
        el("div", { class: "onboarding-step" }, [
          el("span", { class: "onboarding-step__icon", text: "\u2705" }),
          el("div", {}, [
            el("div", { class: "onboarding-step__title", text: t("onboarding.step2Title") }),
            el("div", { class: "onboarding-step__desc", text: t("onboarding.step2Desc") }),
          ]),
        ]),
        el("div", { class: "onboarding-step" }, [
          el("span", { class: "onboarding-step__icon", text: "\u2B50" }),
          el("div", {}, [
            el("div", { class: "onboarding-step__title", text: t("onboarding.step3Title") }),
            el("div", { class: "onboarding-step__desc", text: t("onboarding.step3Desc") }),
          ]),
        ]),
      ]),
      el("button", { class: "btn btn--primary onboarding-btn", type: "button", text: t("onboarding.getStarted"), onclick: dismiss }),
    ]),
  ]);

  return overlay;
}
