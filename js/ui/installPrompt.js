/** PWA install helper — mirrors the proven missmybae pattern exactly: the
 *  browser fires `beforeinstallprompt` when the app is installable, we
 *  stash that event (state held in memory only), and the Settings screen
 *  shows an "Install App" button ONLY while an event is held. `appinstalled`
 *  clears it. No toasts, no guides, no timeouts — if the browser never
 *  offers the event, there is simply no install UI, and the browser's own
 *  menu/address-bar affordances are the path. */
let deferredPrompt = null;
const readyListeners = new Set();

/** Register a callback fired whenever the install prompt becomes (or stops
 *  being) available — the Settings screen re-renders its button from this,
 *  because `beforeinstallprompt` usually arrives *after* the first render. */
export function onInstallPromptReady(cb) {
  readyListeners.add(cb);
  return () => readyListeners.delete(cb);
}

function notifyReady() {
  readyListeners.forEach((cb) => {
    try {
      cb();
    } catch (err) {
      console.warn("Install prompt listener failed:", err);
    }
  });
}

export function captureInstallPrompt() {
  if (!("beforeinstallprompt" in window)) return;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    notifyReady();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notifyReady();
  });
}

/** True while the browser is offering an install event (the button's only
 *  reason to exist). */
export function hasInstallPrompt() {
  return Boolean(deferredPrompt);
}

/** Exactly missmybae's `installApp()`: prompt, wait for the answer, forget
 *  the event. `prompt()`/`userChoice` failures are swallowed — cancelling
 *  the dialog is a normal outcome, not an error. */
export async function installApp() {
  if (!deferredPrompt) return;
  const evt = deferredPrompt;
  try {
    evt.prompt();
    await evt.userChoice;
  } catch (err) {
    /* pengguna batal */
  }
  deferredPrompt = null;
  notifyReady();
}