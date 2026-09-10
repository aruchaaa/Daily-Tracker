/** PWA install helper. The browser fires `beforeinstallprompt` when the app
 *  is installable (served over HTTPS with a valid manifest); we stash that
 *  event so the Settings screen can offer an "Install App" button. No
 *  storage — the event object is only valid transiently, so we keep it in
 *  memory for the lifetime of the page. */
let deferredPrompt = null;
let vestedInstalled = false;
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
    vestedInstalled = true;
    deferredPrompt = null;
    notifyReady();
  });
}

export function canInstall() {
  return Boolean(deferredPrompt) && !isInstalled();
}

/** True when the app is already installed: either this session saw
 *  `appinstalled`, or it's currently running in installed mode (standalone
 *  window / iOS home-screen). Guards UI that shouldn't offer an install
 *  button to someone who already has the app. */
export function isInstalled() {
  if (vestedInstalled) return true;
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    if (navigator.standalone === true) return true;
  } catch (err) {
    // matchMedia/navigator.standalone can throw in odd embedded browsers;
    // failing that check should just mean "not installed".
  }
  return false;
}

/** True when the app is running on iOS Safari (iPadOS reports "Macintosh",
 *  so match the iPad token too, either as the OS or via the touch+touch
 *  signal Mobile Safari uses). iOS has no `beforeinstallprompt`, so the
 *  in-app Install button can only hand the user the Share → Add to Home
 *  Screen path. */
export function isIOS() {
  try {
    const ua = navigator.userAgent || "";
    const hasMac = /Macintosh|Mac OS X/.test(ua);
    const isTouch = /iPhone|iPad|iPod/.test(ua);
    const mobileSafari = (hasMac && navigator.maxTouchPoints > 1) || isTouch;
    return mobileSafari;
  } catch (err) {
    return false;
  }
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