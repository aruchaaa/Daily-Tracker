import { exportBackup, importBackup, importBackupMerge, clearAllData, copyBackupToClipboard } from "../backup/backupManager.js";
import { THEMES, setTheme, setCustomAccent } from "../core/theme.js";
import { enableReminders, disableReminders } from "../core/notifications.js";
import * as metaRepo from "../db/metaRepo.js";
import { playClick, playSave, playError, playToggle, playDelete, playUndo } from "../core/sounds.js";
import { el } from "./components.js";
import { showConfirmDialog, showToast } from "./toast.js";
import { installApp, hasInstallPrompt, hasInstalled } from "./installPrompt.js";
import { t, setLang as setI18nLang, getLang } from "../core/i18n.js";

export async function renderSettings(container) {
  container.innerHTML = "";

  const [currentTheme, currentAccent, remindersEnabled, soundEnabled] = await Promise.all([
    metaRepo.getTheme(),
    metaRepo.getCustomAccent(),
    metaRepo.getRemindersEnabled(),
    metaRepo.getSoundEnabled(),
  ]);
  const statusMsg = el("p", { class: "settings-status" });

  const exportBtn = el("button", {
    class: "btn btn--primary",
    type: "button",
    text: t("settings.exportBtn"),
    onclick: async () => {
      try {
        await exportBackup();
        playSave();
        showToast(t("settings.backupDownloaded"), "success");
      } catch (e) {
        playError();
        showToast(t("settings.exportFailed") + ": " + e.message, "error");
      }
    },
  });

  const fileInput = el("input", { type: "file", accept: "application/json", class: "input" });
  const importBtn = el("button", {
    class: "btn btn--danger",
    type: "button",
    text: t("settings.importReplace"),
    onclick: async () => {
      const file = fileInput.files[0];
      if (!file) {
        playError();
        showToast(t("settings.chooseFile"), "error");
        return;
      }
      const confirmed = await showConfirmDialog({
        title: t("settings.replaceTitle"),
        message: t("settings.replaceMsg"),
        confirmText: t("settings.replaceType"),
        danger: true,
        typeText: "REPLACE",
      });
      if (!confirmed) return;
      try {
        const { skipped } = await importBackup(file);
        playDelete();
        const plural = skipped === 1 ? "" : "s";
        showToast(
          skipped > 0
            ? t("settings.backupImportedSkip", { n: skipped, plural })
            : t("settings.backupImported"),
          "success"
        );
        setTimeout(() => {
          window.location.hash = "#/home";
          window.location.reload();
        }, 700);
      } catch (e) {
        playError();
        showToast(t("settings.importFailed") + ": " + e.message, "error");
      }
    },
  });

  const mergeBtn = el("button", {
    class: "btn",
    type: "button",
    text: t("settings.importMerge"),
    onclick: async () => {
      const file = fileInput.files[0];
      if (!file) {
        playError();
        showToast(t("settings.chooseFile"), "error");
        return;
      }
      const confirmed = await showConfirmDialog({
        title: t("settings.mergeTitle"),
        message: t("settings.mergeMsg"),
        confirmText: t("settings.mergeType"),
      });
      if (!confirmed) return;
      try {
        const { skipped } = await importBackupMerge(file);
        playSave();
        const plural = skipped === 1 ? "" : "s";
        showToast(
          skipped > 0
            ? t("settings.backupMergedSkip", { n: skipped, plural })
            : t("settings.backupMerged"),
          "success"
        );
        setTimeout(() => {
          window.location.hash = "#/home";
          window.location.reload();
        }, 700);
      } catch (e) {
        playError();
        showToast(t("settings.mergeFailed") + ": " + e.message, "error");
      }
    },
  });

  const resetBtn = el("button", {
    class: "btn btn--danger",
    type: "button",
    text: t("settings.deleteAll"),
    onclick: async () => {
      const confirmed = await showConfirmDialog({
        title: t("settings.deleteTitle"),
        message: t("settings.deleteMsg"),
        confirmText: t("settings.deleteAll"),
        danger: true,
        typeText: "DELETE",
      });
      if (!confirmed) return;
      try {
        await clearAllData();
        playDelete();
        showToast(t("settings.allDeleted"), "success");
        setTimeout(() => {
          window.location.hash = "#/home";
          window.location.reload();
        }, 700);
      } catch (e) {
        playError();
        showToast(t("settings.deleteFailed") + ": " + e.message, "error");
      }
    },
  });

  container.append(
    el("h2", { class: "section-title", text: t("settings.title") }),
    buildLanguageSection(container),
    buildInstallSection(),
    buildThemeSection(currentTheme, container),
    buildAccentSection(currentAccent, container),
    buildRemindersSection(remindersEnabled, container),
    buildSoundsSection(soundEnabled, container),
    el("div", { class: "settings-section" }, [
      el("h3", { text: t("settings.export") }),
      el("p", {
        class: "settings-desc",
        text: t("settings.exportDesc"),
      }),
      el("div", { class: "accent-picker-row" }, [
        exportBtn,
        el("button", {
          class: "btn",
          type: "button",
          text: t("settings.copyBtn"),
          onclick: async () => {
            try {
              await copyBackupToClipboard();
              playSave();
              showToast(t("settings.backupCopied"), "success");
            } catch (e) {
              playError();
              showToast(t("settings.copyFailed") + ": " + e.message, "error");
            }
          },
        }),
      ]),
    ]),
    el("div", { class: "settings-section" }, [
      el("h3", { text: t("settings.import") }),
      el("p", {
        class: "settings-desc",
        text: t("settings.importDesc"),
      }),
      fileInput,
      el("div", { class: "accent-picker-row" }, [importBtn, mergeBtn]),
    ]),
    el("div", { class: "settings-section" }, [
      el("h3", { text: t("settings.dangerZone") }),
      el("p", {
        class: "settings-desc",
        text: t("settings.dangerDesc"),
      }),
      resetBtn,
    ]),
    buildAboutSection(),
    statusMsg
  );
}

function buildAboutSection() {
  const features = [t("about.f1"), t("about.f2"), t("about.f3"), t("about.f4"), t("about.f5"), t("about.f6")];

  return el("div", { class: "settings-section" }, [
    el("h3", { text: t("about.title") }),
    el("p", { class: "settings-desc", text: t("about.intro") }),
    el("div", { class: "about-list" }, features.map((text) => el("div", { class: "about-list__item", text }))),
    el("div", { class: "about-list about-list--block" }, [
      el("div", { class: "about-list__block" }, [
        el("span", { class: "about-list__label", text: t("about.dataTitle") }),
        el("span", { class: "about-list__text", text: t("about.dataDesc") }),
      ]),
      el("div", { class: "about-list__block" }, [
        el("span", { class: "about-list__label", text: t("about.tech") }),
      ]),
    ]),
  ]);
}

function buildLanguageSection(container) {
  const current = getLang();
  const options = [
    { value: "en", label: t("settings.english") },
    { value: "id", label: t("settings.indonesian") },
  ];

  const list = el("div", { class: "theme-option-list" });
  options.forEach((opt) => {
    const isActive = opt.value === current;
    const btn = el(
      "button",
      {
        class: `theme-option ${isActive ? "theme-option--active" : ""}`.trim(),
        type: "button",
        onclick: async () => {
          if (opt.value === current) return;
          try {
            setI18nLang(opt.value);
            await metaRepo.setLang(opt.value);
            window.dispatchEvent(new CustomEvent("languagechanged"));
            playToggle();
            renderSettings(container);
          } catch (err) {
            playError();
            showToast(t("settings.languageFailed") + ": " + err.message, "error");
          }
        },
      },
      [
        el("div", { class: "theme-option__text" }, [
          el("div", { class: "theme-option__name", text: opt.label }),
        ]),
        isActive ? el("span", { class: "theme-option__check", text: "\u2713" }) : null,
      ]
    );
    list.appendChild(btn);
  });

  return el("div", { class: "settings-section" }, [
    el("h3", { text: t("settings.language") }),
    el("p", { class: "settings-desc", text: t("settings.languageDesc") }),
    list,
  ]);
}

function buildRemindersSection(enabled, container) {
  const btn = el("button", {
    class: `btn ${enabled ? "" : "btn--primary"}`,
    type: "button",
    text: enabled ? t("settings.remindersOn") : t("settings.remindersOff"),
    onclick: async () => {
      try {
        if (enabled) {
          await disableReminders();
          playToggle();
          showToast(t("settings.remindersOffMsg"));
          renderSettings(container);
          return;
        }
        const ok = await enableReminders();
        if (ok) {
          playToggle();
          showToast(t("settings.remindersEnabled"), "success");
        } else {
          playError();
          showToast(t("settings.permissionDenied"), "error");
        }
        renderSettings(container);
      } catch (err) {
        playError();
        showToast(t("settings.remindersFailed") + ": " + err.message, "error");
      }
    },
  });

  return el("div", { class: "settings-section" }, [
    el("h3", { text: t("settings.reminders") }),
    el("p", {
      class: "settings-desc",
      text: t("settings.remindersDesc"),
    }),
    btn,
  ]);
}

function buildSoundsSection(enabled, container) {
  const btn = el("button", {
    class: `btn ${enabled ? "" : "btn--primary"}`,
    type: "button",
    text: enabled ? t("settings.soundOn") : t("settings.soundOff"),
    onclick: async () => {
      try {
        await metaRepo.setSoundEnabled(!enabled);
        playToggle();
        showToast(!enabled ? t("settings.soundEnabled") : t("settings.soundDisabled"));
        renderSettings(container);
      } catch (err) {
        playError();
        showToast(t("settings.soundFailed") + ": " + err.message, "error");
      }
    },
  });

  return el("div", { class: "settings-section" }, [
    el("h3", { text: t("settings.soundEffects") }),
    el("p", {
      class: "settings-desc",
      text: t("settings.soundDesc"),
    }),
    btn,
  ]);
}

function buildAccentSection(currentAccent, container) {
  const computedGold = getComputedStyle(document.documentElement).getPropertyValue("--gold").trim();

  const colorInput = el("input", { type: "color", class: "input color-picker-input" });
  colorInput.value = currentAccent || rgbToHex(computedGold) || "#e8b355";

  const applyBtn = el("button", {
    class: "btn btn--primary",
    type: "button",
    text: t("settings.apply"),
    onclick: async () => {
      try {
        await setCustomAccent(colorInput.value);
        playSave();
        showToast(t("settings.accentApplied"), "success");
      } catch (err) {
        playError();
        showToast(t("settings.accentFailed") + ": " + err.message, "error");
      }
    },
  });

  const resetBtn = el("button", {
    class: "btn",
    type: "button",
    text: t("settings.resetThemeDefault"),
    onclick: async () => {
      try {
        await setCustomAccent("");
        playUndo();
        renderSettings(container);
      } catch (err) {
        playError();
        showToast(t("settings.accentFailed") + ": " + err.message, "error");
      }
    },
  });

  return el("div", { class: "settings-section" }, [
    el("h3", { text: t("settings.customAccent") }),
    el("p", {
      class: "settings-desc",
      text: t("settings.accentDesc"),
    }),
    el("div", { class: "accent-picker-row" }, [colorInput, applyBtn]),
    resetBtn,
  ]);
}

/** getComputedStyle returns colors as "rgb(r, g, b)" — <input type="color">
 *  needs "#rrggbb". Converts, or returns null if the string can't be parsed. */
function rgbToHex(rgbStr) {
  const match = rgbStr.match(/(\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return null;
  const toHex = (n) => Number(n).toString(16).padStart(2, "0");
  return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
}

// Install section: an always-visible Install button. When the browser is
// offering a `beforeinstallprompt` event the button opens the native dialog
// (missmybae's exact pattern). When no event is held — Chrome/Brave hide it
// on origins that were previously installed, or it never fires — the click
// reveals a short, browser-agnostic manual-install guide below the button.
// Already-installed users (standalone / appinstalled) get a status line.
function buildInstallSection() {
  if (hasInstalled()) {
    return el("div", { class: "settings-section" }, [
      el("h3", { text: t("settings.install") }),
      el("p", { class: "settings-status", text: t("settings.installed") }),
    ]);
  }

  const guide = el("div", { class: "install-guide", hidden: true, role: "note" }, [
    el("p", { class: "install-guide__intro", text: t("settings.installGuideHint") }),
    el("p", { class: "install-guide__step", text: t("settings.installManualDesktop") }),
    el("p", { class: "install-guide__step", text: t("settings.installManualAndroid") }),
    el("p", { class: "install-guide__step", text: t("settings.installManualIOS") }),
    el("p", { class: "install-guide__step", text: t("settings.installResetHint") }),
  ]);

  return el("div", { class: "settings-section" }, [
    el("h3", { text: t("settings.install") }),
    el("button", {
      class: "btn btn--primary",
      type: "button",
      text: t("settings.installBtn"),
      onclick: () => {
        playClick();
        if (!hasInstallPrompt()) {
          guide.hidden = false;
          return;
        }
        void installApp();
      },
    }),
    guide,
  ]);
}

function buildThemeSection(currentTheme, container) {
  const optionList = el("div", { class: "theme-option-list" });

  THEMES.forEach((theme) => {
    const isActive = theme.id === currentTheme;
    const swatch = el("div", { class: "theme-option__swatch", "data-theme": theme.id });

    const btn = el(
      "button",
      {
        class: `theme-option ${isActive ? "theme-option--active" : ""}`.trim(),
        type: "button",
        onclick: async () => {
          try {
            await setTheme(theme.id);
            playToggle();
            renderSettings(container);
          } catch (err) {
            playError();
            showToast(t("settings.themeFailed") + ": " + err.message, "error");
          }
        },
      },
      [
        swatch,
        el("div", { class: "theme-option__text" }, [
          el("div", { class: "theme-option__name", text: theme.name }),
          el("div", { class: "theme-option__blurb", text: theme.blurb }),
        ]),
        isActive ? el("span", { class: "theme-option__check", text: "\u2713" }) : null,
      ]
    );
    optionList.appendChild(btn);
  });

  return el("div", { class: "settings-section" }, [
    el("h3", { text: t("settings.appearance") }),
    el("p", { class: "settings-desc", text: t("settings.appearanceDesc") }),
    optionList,
  ]);
}
