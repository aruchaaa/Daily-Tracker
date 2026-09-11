// Module-import check: every app module must at least load in Node with no
// unhandled top-level DOM usage. app.js genuinely needs a DOM, so its failure
// is expected; everything else must import cleanly.
//
// The base is derived from this file's own location (test/../) on purpose:
// the suite follows the repo, so it can never silently point at a stale copy
// elsewhere on disk the way the old hardcoded base did.
const base = new URL("../", import.meta.url).href;
const modules = [
  "js/app.js",
  "js/utils.js",
  "js/db/db.js",
  "js/db/tasksRepo.js",
  "js/db/completionsRepo.js",
  "js/db/metaRepo.js",
  "js/db/sleepRepo.js",
  "js/db/notesRepo.js",
  "js/core/expEngine.js",
  "js/core/dailyTracker.js",
  "js/core/history.js",
  "js/core/streak.js",
  "js/core/monthlyReport.js",
  "js/core/profileStats.js",
  "js/core/expTrend.js",
  "js/core/sleepTrend.js",
  "js/core/theme.js",
  "js/core/taskStats.js",
  "js/core/schedule.js",
  "js/core/repeatDays.js",
  "js/core/weeklySummary.js",
  "js/core/notifications.js",
  "js/core/achievements.js",
  "js/core/sounds.js",
  "js/core/i18n.js",
  "js/ui/components.js",
  "js/ui/toast.js",
  "js/ui/installPrompt.js",
  "js/ui/confetti.js",
  "js/ui/screenHome.js",
  "js/ui/screenTasks.js",
  "js/ui/screenTaskDetail.js",
  "js/ui/screenProfile.js",
  "js/ui/screenHistory.js",
  "js/ui/screenReport.js",
  "js/ui/screenSettings.js",
  "js/backup/backupManager.js",
  "js/backup/csvExport.js",
];
let ok = 0;
let fail = 0;
for (const m of modules) {
  try {
    await import(base + m);
    ok++;
  } catch (e) {
    console.log("LINK FAIL: " + m + " - " + e.message);
    fail++;
  }
}
console.log(`linked: ${ok} ok, ${fail} fail`);
if (fail === 0 || fail === 1) process.exit(0);
process.exit(1);