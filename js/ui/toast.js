import { el } from "./components.js";
import { playUndo, playToggle } from "../core/sounds.js";
import { t } from "../core/i18n.js";

/* ------------------------------- Toasts -------------------------------- */

const MAX_VISIBLE_TOASTS = 4;

/** Small themed status message, bottom-anchored above the nav bar.
 *  Replaces the ad-hoc inline "Saved." spans for one-shot feedback.
 *  Each toast owns its own dismissal timer, so spamming notifications
 *  can never orphan an earlier toast; the host is capped so the stack
 *  can never grow without bound.
 *  Optional `action = { text, onAction }` renders an Undo-style button;
 *  toasts with an action stay longer so there's time to react. */
export function showToast(message, type = "info", duration = 2200, action = null) {
  let host = document.querySelector(".toast-host");
  if (!host) {
    host = el("div", { class: "toast-host", "aria-live": "polite" });
    document.body.appendChild(host);
  }

  const dismiss = () => {
    toast.classList.remove("toast--show");
    setTimeout(() => toast.remove(), 250);
  };

  const toast = el("div", { class: `toast toast--${type}`, text: message });
  if (action && action.text) {
    toast.appendChild(
      el("button", {
        class: "toast__action",
        type: "button",
        text: action.text,
        onclick: () => {
          action.onAction();
          dismiss();
        },
      })
    );
  }
  host.appendChild(toast);
  while (host.children.length > MAX_VISIBLE_TOASTS) {
    host.firstChild.remove();
  }

  requestAnimationFrame(() => toast.classList.add("toast--show"));

  setTimeout(dismiss, action && action.text ? Math.max(duration, 5000) : duration);
}

/* --------------------------- Confirm dialog ---------------------------- */

/**
 * Themed replacement for window.confirm(). Resolves true/false.
 * Pass `typeText: "DELETE"` to require typing the word before the confirm
 * button enables — used for irreversible destructive actions.
 */
export function showConfirmDialog({ title, message, confirmText = "Confirm", cancelText = "Cancel", danger = false, typeText = null }) {
  return new Promise((resolve) => {
    let confirmBtn;

    const close = (value) => {
      if (value) playToggle();
      else playUndo();
      overlay.remove();
      document.removeEventListener("keydown", onKey);
      resolve(value);
    };

    const onKey = (e) => {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter" && confirmBtn && !confirmBtn.disabled) close(true);
    };

    const overlay = el(
      "div",
      {
        class: "dialog-overlay",
        onclick: (e) => {
          if (e.target === overlay) close(false);
        },
      },
      [
        el("div", { class: "dialog", role: "dialog", "aria-modal": "true" }, [
          title ? el("div", { class: "dialog__title", text: title }) : null,
          message ? el("div", { class: "dialog__message", text: message }) : null,
          typeText
            ? el("input", {
                type: "text",
                class: "input dialog__input",
                placeholder: t("confirm.typePlaceholder", { text: typeText }),
                autocomplete: "off",
                oninput: (e) => {
                  confirmBtn.disabled = e.target.value !== typeText;
                },
              })
            : null,
          el("div", { class: "dialog__actions" }, [
            el("button", { class: "btn", type: "button", text: cancelText, onclick: () => close(false) }),
            (confirmBtn = el("button", {
              class: `btn ${danger ? "btn--danger" : "btn--primary"}`,
              type: "button",
              text: confirmText,
              disabled: Boolean(typeText),
              onclick: () => close(true),
            })),
          ]),
        ]),
      ]
    );

    document.addEventListener("keydown", onKey);
    document.body.appendChild(overlay);

    const input = overlay.querySelector(".dialog__input");
    if (input) {
      input.focus();
    } else if (confirmBtn) {
      confirmBtn.focus();
    }
  });
}