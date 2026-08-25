import { renderHome } from "./ui/screenHome.js";
import { renderTasks } from "./ui/screenTasks.js";
import { renderProfile } from "./ui/screenProfile.js";
import { renderHistory } from "./ui/screenHistory.js";
import { renderReport } from "./ui/screenReport.js";
import { renderSettings } from "./ui/screenSettings.js";
import { renderTaskDetail } from "./ui/screenTaskDetail.js";
import { loadAndApplyTheme } from "./core/theme.js";
import { playNav } from "./core/sounds.js";
import { scheduleTodayReminders } from "./core/notifications.js";
import { getTodayDateString } from "./utils.js";
import { captureInstallPrompt, onInstallPromptReady } from "./ui/installPrompt.js";
import { setLang as setI18nLang, t } from "./core/i18n.js";
import * as metaRepo from "./db/metaRepo.js";

const routes = {
  "#/home": renderHome,
  "#/tasks": renderTasks,
  "#/profile": renderProfile,
  "#/history": renderHistory,
  "#/report": renderReport,
  "#/settings": renderSettings,
};

const container = document.getElementById("app");
const navButtons = document.querySelectorAll(".nav-btn");

function setActiveNav(hash) {
  navButtons.forEach((btn) => {
    btn.classList.toggle("nav-btn--active", btn.getAttribute("href") === hash);
  });
}

export function updateNavLabels() {
  const labels = { "#/home": "nav.home", "#/tasks": "nav.tasks", "#/profile": "nav.profile", "#/history": "nav.history", "#/report": "nav.report", "#/settings": "nav.settings" };
  navButtons.forEach((btn) => {
    const key = labels[btn.getAttribute("href")];
    if (key) {
      const textNode = btn.childNodes[btn.childNodes.length - 1];
      if (textNode && textNode.nodeType === Node.TEXT_NODE) textNode.textContent = t(key);
    }
  });
}

async function router() {
  const hash = window.location.hash || "#/home";

  try {
    // Task detail is a sub-page of Tasks (#/task/<id>), not a top-level tab,
    // so it's handled separately from the flat routes map above.
    const taskDetailMatch = hash.match(/^#\/task\/(.+)$/);
    if (taskDetailMatch) {
      setActiveNav("#/tasks");
      await renderTaskDetail(container, decodeURIComponent(taskDetailMatch[1]));
      window.scrollTo(0, 0);
      return;
    }

    const matchedHash = routes[hash] ? hash : "#/home";
    setActiveNav(matchedHash);
    await routes[matchedHash](container);
    window.scrollTo(0, 0);
  } catch (err) {
    // Error boundary: a failed render (e.g. a DB error) shouldn't leave a
    // blank screen with no explanation.
    console.error("Screen render failed:", err);
    container.innerHTML = "";
    const msg = document.createElement("p");
    msg.className = "empty-state";
    msg.textContent = t("error.screenFailed");
    container.appendChild(msg);
  }
}

window.addEventListener("hashchange", () => {
  playNav();
  router();
});
window.addEventListener("languagechanged", () => updateNavLabels());
window.addEventListener("DOMContentLoaded", async () => {
  await loadAndApplyTheme(); // applied before first render, to avoid a theme flash
  const lang = await metaRepo.getLang();
  setI18nLang(lang);
  updateNavLabels();
  captureInstallPrompt();
  router();
  registerServiceWorker();
  scheduleTodayReminders(); // fires only if enabled + permission granted
  // Re-arm reminders when the calendar date rolls past midnight while
  // the app tab stays open (browser setTimeout drifts, so we poll).
  let trackedDate = getTodayDateString();
  setInterval(() => {
    const today = getTodayDateString();
    if (today !== trackedDate) {
      trackedDate = today;
      scheduleTodayReminders();
    }
  }, 60_000);
});

// `beforeinstallprompt` usually fires after the first render, so when it
// arrives while Settings is open, re-render so the Install button reflects
// its new availability immediately instead of staying stale until the
// screen is revisited.
onInstallPromptReady(() => {
  if (window.location.hash === "#/settings") router();
});

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch((err) => {
      console.warn("Service worker registration failed:", err);
    });

    // When a new service worker takes control (after an update), the page
    // that's already open is still running old code until it reloads.
    // Reload once automatically so updates apply without the user having
    // to know to close every tab manually.
    let hasReloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hasReloaded) return;
      hasReloaded = true;
      window.location.reload();
    });
  }
}
