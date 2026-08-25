/** PWA install helper. The browser fires `beforeinstallprompt` when the app
 *  is installable (served over HTTPS with a valid manifest); we stash that
 *  event so the Settings screen can offer an "Install App" button. No
 *  storage — the event object is only valid transiently, so we keep it in
 *  memory for the lifetime of the page. */
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

export function canInstall() {
  return Boolean(deferredPrompt);
}

export async function installApp() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  const accepted = choice && choice.outcome === "accepted";
  deferredPrompt = null;
  notifyReady();
  return accepted;
}