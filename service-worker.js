// Everything this app needs is local (no backend, no API calls). Strategy:
// network-first, falling back to cache only when offline. This keeps the
// app fully usable with no connection (the actual PWA requirement) while
// making sure an open tab always picks up the latest deployed files instead
// of getting stuck on a stale cached copy — a smoother update path than a
// pure cache-first strategy, at the cost of a network round-trip on every
// online load (irrelevant here since there's no real data to wait on).

const CACHE_NAME = "daily-tracker-v35";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/main.css",
  "./css/components.css",
  "./js/app.js",
  "./js/utils.js",
  "./js/db/db.js",
  "./js/db/tasksRepo.js",
  "./js/db/completionsRepo.js",
  "./js/db/metaRepo.js",
  "./js/db/sleepRepo.js",
  "./js/db/notesRepo.js",
  "./js/core/expEngine.js",
  "./js/core/dailyTracker.js",
  "./js/core/history.js",
  "./js/core/streak.js",
  "./js/core/monthlyReport.js",
  "./js/core/profileStats.js",
  "./js/core/expTrend.js",
  "./js/core/sleepTrend.js",
  "./js/core/theme.js",
  "./js/core/taskStats.js",
  "./js/core/schedule.js",
  "./js/core/notifications.js",
  "./js/core/achievements.js",
  "./js/core/sounds.js",
  "./js/core/i18n.js",
  "./js/ui/components.js",
  "./js/ui/toast.js",
  "./js/ui/installPrompt.js",
  "./js/ui/screenHome.js",
  "./js/ui/screenTasks.js",
  "./js/ui/screenTaskDetail.js",
  "./js/ui/screenProfile.js",
  "./js/ui/screenHistory.js",
  "./js/ui/screenReport.js",
  "./js/ui/screenSettings.js",
  "./js/backup/backupManager.js",
  "./js/backup/csvExport.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // Only handle plain http(s) requests — browser extensions (ad blockers,
  // password managers, etc.) can trigger fetch events with schemes like
  // chrome-extension:// on this page, and the Cache API throws if asked to
  // store those.
  if (!event.request.url.startsWith("http")) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        // Offline: serve the cached copy, and for any navigation request
        // (e.g. a deep link to a path never fetched before) fall back to the
        // cached shell so the app still boots.
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === "navigate") return caches.match("./index.html");
          return undefined;
        })
      )
  );
});
