/** PWA install helper — the core matches the proven missmybae pattern: we
 *  stash the `beforeinstallprompt` event and the Settings screen prompts via
 *  it (the same dialog the address-bar icon opens). On top of that, Settings
 *  keeps an always-visible Install button so users on browsers that never
 *  offer the event still get guidance to the manual path. */
let deferredPrompt = null;
let installedFlag = false;
const readyListeners = new Set();

/** Register a callback fired whenever install availability or install state
 *  changes — the Settings screen re-renders its section from this, because
 *  `beforeinstallprompt` usually arrives *after* the first render. */
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
  if (typeof window === "undefined") return;
  if (!("beforeinstallprompt" in window)) return;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    notifyReady();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installedFlag = true;
    notifyReady();
  });
}

/** True while the browser is offering an install event (the button can
 *  actually open the native dialog). */
export function hasInstallPrompt() {
  return Boolean(deferredPrompt);
}

/** True when the app is already installed: either this session saw
 *  `appinstalled`, or the page runs standalone (the installed window).
 *  Users that are already installed get a status line, never an install
 *  button. Fails safe to false in odd embeds / the Node harness. */
export function hasInstalled() {
  if (installedFlag) return true;
  try {
    return (
      Boolean(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      Boolean(window.navigator && window.navigator.standalone)
    );
  } catch {
    return false;
  }
}

/** missmybae's `installApp()`: prompt, wait for the answer, forget the
 *  event. `prompt()`/`userChoice` failures are swallowed — cancelling the
 *  dialog is a normal outcome, not an error. */
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