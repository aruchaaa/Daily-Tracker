/** PWA install helper. The browser fires `beforeinstallprompt` when the app
 *  is installable (served over HTTPS with a valid manifest); we stash that
 *  event so the Settings screen can offer an "Install App" button. No
 *  storage — the event object is only valid transiently, so we keep it in
 *  memory for the lifetime of the page. */
let deferredPrompt = null;
let vestedInstalled = false;
/** Does the *browser* believe this origin's PWA is already installed?
 *  Filled by `refreshRelatedInstalled()`. null = not queried yet.
 *  Chromium suppresses `beforeinstallprompt` (and its install dialog can
 *  silently answer "dismissed") for origins it thinks are already
 *  installed — e.g. after an earlier install attempt that left state
 *  behind. */
let relatedInstalled = null;
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
  void refreshRelatedInstalled();
}

/** Best-effort query of the browser's installed-app record
 *  (`navigator.getInstalledRelatedApps`): does it list a web app for this
 *  origin? Falls back to false (unknown) in any odd environment. */
export async function refreshRelatedInstalled() {
  try {
    const apps = await navigator.getInstalledRelatedApps();
    const origin = new URL(location.href).origin;
    relatedInstalled = (apps || []).some(
      (a) => a && a.platform === "webapp" && a.url && new URL(a.url, origin).origin === origin
    );
  } catch (err) {
    relatedInstalled = false;
  }
  notifyReady();
  return relatedInstalled;
}

/** True when the browser itself reports this origin's PWA as installed
 *  (via `getInstalledRelatedApps`), even if this session never saw
 *  `appinstalled` — a stale install can block future installs by making
 *  Chromium silently decline the prompt. */
export function isRelatedInstalled() {
  return relatedInstalled === true;
}

export function canInstall() {
  return Boolean(deferredPrompt) && !isInstalled();
}

/** True when the browser supports the native `<install>` element (the
 *  declarative, trusted PWA install button — Chrome/Edge 148+, no
 *  `beforeinstallprompt` ceremony required). Rendered in place of our own
 *  button when available. */
export function supportsInstallElement() {
  try {
    return typeof window !== "undefined" && "HTMLInstallElement" in window;
  } catch (err) {
    return false;
  }
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

export function isAndroid() {
  try {
    return /Android/i.test(navigator.userAgent || "");
  } catch (err) {
    return false;
  }
}

// How long to wait for the browser to answer `prompt()`. Some forks of
// Chromium (notably Brave) can swallow `prompt()` completely: no dialog,
// and `userChoice` never settles. But Windows installs can also be SLOW
// (a few seconds under antivirus), so a too-short window would report
// failure while the shortcut is actually still being created. 10s covers
// the slow-but-real case; anything beyond that is treated as "still
// installing — check your desktop", never as a failure.
const INSTALL_PROMPT_TIMEOUT = 10000;

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("install prompt timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/** Result: `true` accepted, `false` user dismissed, `"pending"` the dialog
 *  is still working (Windows can install slowly — do NOT call this a
 *  failure; `appinstalled` will flip the UI once it finishes), `"none"`
 *  the browser held no install event at all (the honestly-common case on
 *  Brave), `"unsupported"` `prompt()` itself threw. Never hangs. */
export async function installApp() {
  if (!deferredPrompt) return "none";
  const evt = deferredPrompt;
  try {
    evt.prompt();
  } catch (err) {
    deferredPrompt = null;
    notifyReady();
    return "unsupported";
  }
  let choice = null;
  let timedOut = false;
  try {
    choice = await withTimeout(evt.userChoice, INSTALL_PROMPT_TIMEOUT);
  } catch (err) {
    timedOut = true;
  }
  // If the feedback window lapsed, keep listening — a late resolution still
  // marks the app installed so the UI corrects itself afterwards.
  // (Only bound on the timed-out path: for a prompt that already answered,
  // the `appinstalled` event covers the installed state.)
  if (timedOut) {
    evt.userChoice
      .then((res) => {
        if (res && res.outcome === "accepted") {
          vestedInstalled = true;
          notifyReady();
        }
      })
      .catch(() => {});
  }
  deferredPrompt = null;
  notifyReady();
  if (timedOut) return "pending";
  if (choice && choice.outcome === "accepted") return true;
  return false;
}