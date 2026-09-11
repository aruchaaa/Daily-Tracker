# AGENTS.md — Daily Tracker

Guidance for AI agents (and humans) working on this codebase. It covers how
to run/verify the project, how the code is organized, the conventions to
follow, and the full development history so changes stay consistent with
what came before.

## Project overview

A personal, offline-first **daily task tracker with an EXP/level system**.
Single user, no login, no backend, no cloud — all data lives in the
browser's IndexedDB on the device. Vanilla ES modules + native browser
APIs only: **zero dependencies, zero build step, zero external libraries**
(IndexedDB hand-rolled, Web Audio synthesis, `crypto.randomUUID`,
`color-mix()`, SVG charts drawn by hand).

Screens (6 tabs + 1 sub-page): Home (checklist + daily target + sleep),
Tasks (manage/add/edit/delete), Profile (character, trends,
achievements, share card), History (month calendar), Report (monthly
report + year grid + CSV), Settings, and `#/task/<id>` (per-task detail).

## Running & verifying

```powershell
# Serve over http(s) — required for ES modules + service worker.
cd daily-tracker
python3 -m http.server 8080   # or: npx serve daily-tracker
# open http://localhost:8080
```

The **regression harness lives in the repo** at `test/` (kept inside so OS
Temp cleanups can't wipe it and it follows the code). It runs the app's
modules against `fake-indexeddb` in Node — the only dependency, installed
from `test/package.json`:

```powershell
cd daily-tracker/test
npm install             # once, first time (creates test/node_modules)
node verify5.mjs        # full regression suite — expect "ALL VERIFIED"
node linkall.mjs        # module-import check — expect "37 ok" + app.js
                        # (app.js needs a DOM, so its failure is expected)
```

Both scripts derive the app root from their own location
(`new URL("../", import.meta.url)`), so there is no hardcoded path to go
stale if the project folder moves. Exclude `test/node_modules/` from any
repo upload/backup (see `.gitignore`); recreate it with `npm install`.

Ad-hoc checks used after edits:

- `node --check <file>.js` on every edited JS file.
- Brace balance on the CSS files (e.g. count `{` vs `}` in
  `css/main.css` and `css/components.css`).
- `Invoke-WebRequest http://localhost:8080/` → expect HTTP 200.
- After any change that touches the precache shell or JS/CSS, bump
  `CACHE_NAME` in `service-worker.js` **and** the matching `daily-tracker-vN`
  reference in `README.md` (currently `v59`). The manifest is
  `manifest.webmanifest` (served as `application/manifest+json`); `vercel.json`
  keeps the service worker and manifest free of CDN caching so updates and
  installability checks always see the newest files.

## Architecture

```
daily-tracker/
├── index.html            single-page shell + bottom nav (one module entry: js/app.js)
├── manifest.webmanifest PWA metadata (name, icons, #161227 colors, standalone)
├── service-worker.js     network-first, cache-fallback; precache list + self-update
├── vercel.json           PWA headers: SW + manifest never CDN-cached
├── css/
│   ├── main.css          tokens, themes, layout, print, skip-link, shadows
│   ├── components.css    UI parts (BEM-ish, all colors via CSS variables)
│   └── animations.css    micro-interactions: splash, page-in, stagger, hover, press
├── icons/                icon.svg (master stopwatch), icon-192/512/maskable PNG,
│                         generate-icons.ps1 + generate-png.html (icon regen tools)
└── js/
    ├── app.js            hash router, nav highlight, error boundary, theme boot,
    │                     SW registration + one-shot reload, install wiring
    ├── utils.js          local-date YYYY-MM-DD, display dates, generateId, month names
    ├── db/               THE ONLY place raw IndexedDB calls happen
    │   ├── db.js         lazy single connection (DailyTrackerDB v3), promisify wrappers,
    │   │                 onversionchange close + cache reset; v3 migration moves legacy
    │   │                 task.notes into today's taskNotes record
    │   ├── tasksRepo.js  task CRUD (repeatDays + deactivatedAt fields),
    │   │                 sortOrder, setTaskOrder, restoreTask (undo)
    │   │                 moveTask removed (dead code); setTaskOrder kept for harness
    │   ├── completionsRepo.js  records keyed "<date>_<taskId>"; toggleCompletion is the
    │   │                 single EXP chokepoint (multi-store tx, snapshot, serialized)
    │   ├── metaRepo.js   flat key-value store (EXP total, name, theme, toggles,
    │   │                 achievements, moments, lastBackupAt, dailyTargetExp,
    │   │                 onboardingDone)
    │   ├── sleepRepo.js  per-day sleep hours (upsert + range)
    │   └── notesRepo.js  per-day task notes keyed "<date>_<taskId>" (getNote,
    │                     getNotesForDate, setNote — blank deletes that day only)
    ├── core/             business logic, NO DOM (17 modules)
    │   ├── expEngine.js      progressive curve: level N→N+1 = 100 + (N-1)*20
    │   ├── dailyTracker.js   today's state (join tasks+completions, sort, totals;
    │   │                     active + repeat-day filter applied here)
    │   ├── history.js        day record = every task that existed that day
    │   │                     (done + skipped with 0-EXP rows + snapshot rows;
    │   │                     repeat-day filtered; deactivated tasks drop out the
    │   │                     day after their deactivatedAt)
    │   ├── streak.js         longest + current streak (UTC-midnight diffing)
    │   ├── monthlyReport.js  % (per-task existence-weighted), grade, tally;
    │   │                     daysTaskExistedInRange = weekday + deactivation aware
    │   ├── repeatDays.js     weekdayOf / appliesOnWeekday / hasRepeatDays /
    │   │                     normalizeRepeatDays (0=Sun..6=Sat, [] = every day)
    │   ├── weeklySummary.js  per-week (Mon-start) buckets + best day for Report
    │   ├── profileStats.js   profile aggregation (reuses generateReport)
    │   ├── expTrend.js       last-N-days EXP series (zero-filled)
    │   ├── sleepTrend.js     last-N-days sleep series
    │   ├── achievements.js   20 declarative badges, computeStats, evaluate, state
    │   ├── notifications.js  in-app reminder timers (reminderTime || startTime)
    │   ├── schedule.js       findTimeConflict (half-open [start,end) intervals)
    │   ├── sounds.js         11 synthesized effects (click/nav/tick/uncheck/save/
    │   │                     open/toggle/delete/undo/error/level-up), no audio
    │   │                     files; lastPlayedSeq marker for el()'s fallback
    │   ├── taskStats.js      per-task streaks + heatmap cells (Sun-first weeks)
    │   ├── theme.js          theme registry, applyTheme, custom-accent override
    │   └── i18n.js           translation dictionary (EN + ID), t() helper,
    │                         setLang/getLang; persisted in meta as "lang"
├── ui/             one file per screen + shared helpers
    │   ├── components.js el() builder (+generic click-sound fallback via
    │   │                 lastPlayedSeq), level panel (clickable/levelUp options),
    │   │                 progress ring, stat card, trend chart, heatmap,
    │   │                 formatTimeRange
    │   ├── confetti.js       lightweight confetti burst (CSS-var driven) for
    │   │                     level-up / achievement unlocks
    │   ├── screenHome.js       checklist, daily target, sleep, backup banner,
    │   │                       level-up flash on badge
    │   ├── screenTasks.js      add/edit/delete (Undo toast; delete confirms via dialog),
    │   │                       chips, drag-to-reorder unscheduled tasks
    │   │                       (flexible positioning between scheduled tasks)
    │   ├── screenTaskDetail.js #/task/<id>: streaks, heatmap, notes, reminder
    │   ├── screenProfile.js    rename, trends, stats, achievements, share card canvas
    │   ├── screenHistory.js    month calendar + day detail, PDF via print
    │   ├── screenReport.js     monthly report, year grid, CSV, PDF
    │   ├── screenSettings.js   install, theme/accent, toggles, backup, danger zone
    │   ├── installPrompt.js    beforeinstallprompt stash + installApp + isInstalled/
    │   │                       isIOS/isAndroid helpers + onInstallPromptReady listeners
    │   └── toast.js           showToast (stack ≤4, optional action) +
    │                          showConfirmDialog (optional type-to-confirm)
    └── backup/
        ├── backupManager.js  versioned JSON export/import (replace/merge)/clear
        └── csvExport.js      pure buildMonthCSV + exportMonthCSV (UTF-8 BOM)
└── test/                  Node regression harness (lives in repo so Temp
                          cleanups can't wipe it): verify5.mjs (112 asserts),
                          linkall.mjs (37 ok + app.js), package.json
                          installs fake-indexeddb
```

## Data model (IndexedDB `DailyTrackerDB`, v3)

- **tasks** — keyPath `id`; name, expValue, isActive, optional
  startTime/endTime, sortOrder, createdAt, optional repeatDays (array of
  ints 0=Sun..6=Sat; missing = every day) and deactivatedAt (ISO string,
  stamped when isActive flips false, cleared on reactivation).
- **completions** — keyPath `id` = `"<date>_<taskId>"` (enforces
  one-per-task-per-day); indexes on `date` and `taskId`; snapshots
  `taskName`/`expAwarded`/`completedAt` at completion time so history and
  EXP survive later task edits/deletes.
- **meta** — keyPath `key`; lifetimeExp, characterName, theme,
  customAccent, lastBackupAt, dailyTargetExp, remindersEnabled,
  soundEnabled, achievements (array of `{id, at}`, legacy string arrays
  normalized on read), `momentNote:YYYY-MM`.
- **sleepLogs** — keyPath `date`; hours.
- **taskNotes** — keyPath `id` = `"<date>_<taskId>"`; one note per task per
  day, so a note written today never mutates what History shows for a past
  day (the v2 "stuck note" problem). Records `{date, taskId, note,
  updatedAt}`; indexes on `date` and `taskId`. v3 migration moves a legacy
  `tasks.notes` string into today's note; blank `setNote` deletes that
  day's record only.

Level is always derived from lifetime EXP, never stored.

## Conventions

- **Modules:** native ESM with explicit `.js` extensions and relative
  paths; no bundler. `service-worker.js` is a classic worker script.
- **Dates:** always local `YYYY-MM-DD` strings — never UTC — because
  there is no server to arbitrate. **Gotcha:** `new Date("2026-07-01T00:00:00")`
  (T but no Z) is parsed as *local* time, so `toISOString().slice(0,10)`
  shifts a day in non-UTC zones. Generate local date strings with
  `getFullYear/getMonth/getDate` if you ever write date-iteration tests.
- **CSS:** kebab-case `--token` variables in `main.css` theme blocks;
  `components.css` never hardcodes colors. BEM-ish class names
  (`block__elem--modifier`); legacy flat names (`.btn`, `.input`, `.chip`)
  survive. Theme switching = variable redefinition under
  `[data-theme="..."]`; custom accent = inline `--gold` on `<html>`.
- **Errors:** router-level error boundary in `app.js`; async screen
  actions `try/catch` → `showToast("... failed: " + e.message, "error")`;
  best-effort features (SW, notifications, install) fail soft with
  `console.warn`.
- **Rendering:** every screen re-renders fully from fresh DB reads; no
  in-place DOM patching (fine at this data volume). `el()` null-filters
  children — never pass a `null` to native `.append()`.
- **EXP chokepoint:** all EXP changes go through
  `completionsRepo.toggleCompletion()` — one multi-store transaction,
  serialized against rapid double-clicks, snapshots EXP at check time so
  uncheck subtracts exactly what was awarded.
- **Task ordering:** all tasks share a single `sortOrder` field.
  Scheduled tasks get `sortOrder = startTime in minutes` (set on
  create/update); unscheduled tasks get drag-assigned midpoint values
  that can land between scheduled ones. Both Home and Tasks sort by
  `sortOrder`, so the order is always consistent. Drag handles only
  appear on unscheduled tasks.
- **Service worker:** cache name is the manual versioning mechanism; bump
  it whenever the precache shell or any cached JS/CSS changes. Precache
  list is **complete** — every module under `js/` is in `APP_SHELL`; when
  adding a new module, add it there too. `icons/icon-maskable-192.png` and
  `icons/icon-maskable-512.png` are deliberately manifest-only
  (fetched at install time, runtime-cached afterwards).
- **Achievements:** keep the declarative `ACHIEVEMENTS` array in
  `core/achievements.js`; a badge needs `id/title/icon/desc/check`. All
  checks read one shared `stats` object built by `computeStats()` — add
  new derived stats there rather than writing one-off logic per badge.
  Unlock state persists in a single meta row so backups carry it.

## Development history

Chronology of what was built, so future work stays consistent and nothing
is accidentally re-done or reverted.

### Original app (pre-harness)
Core app: tasks + completions + EXP/level system, Home checklist, optional
schedules with conflict detection, themes, notes, monthly report, JSON
backups, History calendar, Profile. Database v1 → v2 (added `sleepLogs`,
additive-only, tested against a real v1 DB).

### Fase B — feature push (SW bumps v18 → v19)
- **Achievements**: 10 badges (first-blood, centurion, streak-7/30,
  early-bird, night-owl, level-5/10, exp-1000, target-day) evaluated after
  every completion, persisted to meta, gallery on Profile.
- **Sound effects** (`core/sounds.js`): synthesized tick on completion +
  haptic, fanfare on level-up/achievement; Settings toggle.
- **Notifications**: per-task reminder time falling back to task startTime,
  in-app timers gated on permission + settings.
- **Quick-add on Home** with time-conflict check and validation.
- **Undo toast** on task delete (Manage Tasks).
- **Drag-to-reorder** for unscheduled tasks (`setTaskOrder`).
- **Weekly panel** on Report (removed later).
- **CSV export** (later redesigned).
- **Year at a Glance**: 12-tile month grid on Report.
- **Shareable character card**: canvas PNG download.
- **Install App** button wiring.
- First version of the `verify5.mjs` test harness (29 → 36 assertions).

### Round 2 — polish
- Quick-add validation + conflict + Undo toast.
- Year grid parallelized.
- Achievement unlock dates: meta entries become `{id, at}` with legacy
  string-array migration.
- Install App section added to Settings; SW v20; verify5 → 35 assertions.

### Bug fix — toast Undo unclickable
`.toast-host` has `pointer-events: none`; fixed by
`.toast__action { pointer-events: auto; }`.

### EXP tuning analysis (not implemented)
Analyzed the level curve and recommended a hard-mode default (5 EXP per
task, ~30 EXP/day target). Not applied — the user moved on; default task
EXP remains 10.

### Undo restricted + Install App made robust (SW v21)
- Undo removed from Home (quick-add + checkbox toggles) — it now exists
  only for task delete in Manage Tasks, the one place accidental clicks
  are costly.
- Install App button is never disabled; Settings subscribes to
  `onInstallPromptReady` and re-renders, showing a hint toast when the
  browser offers no install prompt. verify5 → 36 assertions.

### Weekly removed + CSV redesigned (SW v22)
- Weekly panel removed from Report (UI + CSS + `core/weeklyReport.js`
  deleted, server 404'd the module, linkall cleaned).
- CSV redesigned: header `Date, Task Name, EXP Earned, Time`; `Time` is
  local HH:MM; empty cell for legacy records without completedAt.

### 10 hard-tier badges (SW v23)
- Ten long-haul badges added (total 20): veteran (500 tasks),
  target-streak-7, full-circle (before 9 AM + after 10 PM same day),
  exp-5000, level-15, streak-100, target-streak-30, exp-10000, level-20,
  streak-365.
- `computeStats()` extended with a `byDate` map, `targetHitStreak`
  (walking back from today while day EXP ≥ daily target), and `bothEnds`.
- **Test-setup bug fixed**: the verify5 loop used `toISOString().slice()`
  (UTC) while the app stores local dates, so loop keys collided with the
  seeded 08-20/08-21 records and silently removed them (499 records /
  4990 EXP instead of 501 / 5010). Rewrote the loop with a local-date
  helper and re-completed "today" to keep the target-streak alive.
  verify5 → 44/44.

### Character card fixes (SW v24 → v25)
- **Name bug**: the card was drawn from stats captured at render time, so
  saving a name never showed on the PNG. Saving now re-renders the
  Profile screen.
- **Redesign**: larger canvas (560×760), gradient + glow behind the level
  ring, header eyebrow + name, stats rows, and the full 20-badge roster.
- **Badge cleanup** (user request): removed the glow circles (they hugged
  the card edges), inset the badge row from the edges, tightened row
  spacing, shrank icons; unlocked = solid gold, locked = dim gray.
- **Motif** (user request): faint diamond lattice across the background +
  thin gold dividers under the header and above the ACHIEVEMENTS section.

### Quick-add removed (SW v25)
- Quick-add form + "+" toggle removed from Home entirely — all task
  creation happens in the Tasks tab so it stays the single place for task
  management. Related CSS blocks and README bullets cleaned up.

### Level panel de-ringed + badge/card polish (SW v26)
- **Level ring removed**: the circular progress ring around the level badge
  was redundant with the segmented EXP bar right beside it, so
  `buildLevelPanel` now renders just the badge + bar. The shared component
  means Home and Profile both drop the ring together. CSS ring rules,
  ring burst keyframes, and the badge's ring-fitting size comment removed;
  `buildProgressRing` survives for the daily-target card.
- **Uniform badge icons**: a `fitBadgeIconFontSize()` helper measures each
  glyph's real bounding box (100px probe canvas) and returns a font-size so
  every badge renders at the same visual size — applied to both the Profile
  gallery tiles (inline `font-size`) and the share-card canvas (per-icon
  font + `textBaseline: middle`). Falls back to the default size in
  environments without canvas `measureText` (Node harness).
- **Share-card centering**: the "LVL" + level number is now drawn with
  `textBaseline: middle` so the pair reads balanced in the ring, and the
  "40/120 EXP to next level" line was removed from the export.

### Maskable install icon
- `icons/icon-512-maskable.png` added and registered in `manifest.json`
  (`purpose: "maskable"`) so Android's adaptive-icon masking can't crop
  the logo out of the launcher shape. Manifest-only — not in the SW
  precache list; the browser fetches it at install time and the runtime
  cache keeps it afterwards.

### Drag removed + schedule conflicts tightened (SW v27)
- **Drag-to-reorder removed** from Manage Tasks (user request): the grab
  handle, `initDrag` pointer logic, and the `setTaskOrder` call are gone;
  unscheduled tasks keep their creation order. CSS for `.drag-handle` /
  `.task-manage-row--dragging` deleted. `tasksRepo.setTaskOrder()` remains
  exported (still exercised by the harness) but no UI calls it.
- **Same-instant conflicts now caught**: `findTimeConflict` treated
  zero-width point tasks as half-open like ranges, so a point at exactly
  the same time as another task's range start (or another point) slipped
  through. The new `overlaps()` helper gives points closed semantics
  (a point at t conflicts with range [s, e) when s <= t < e; two points
   conflict when equal) while ranges stay half-open, so back-to-back tasks
   still don't conflict. Five new harness assertions cover the boundary
   cases, including the ones that used to pass wrongly.

### Sound overhaul + typed confirms + level-up flash (SW v28 → v29)
Two sessions landed across these bumps; intermediate details weren't
recorded separately, so this describes the combined, verifiable state.
- **Full sound pass** (`core/sounds.js`): grew from tick/fanfare into
  eleven distinct effects — click, nav, tick, uncheck, save, open,
  toggle, delete, undo, error buzz, level-up arpeggio — each gated on
  the Settings sound toggle and wired through every screen.
- **Generic-click fallback**: `el()` wraps every `onclick`; if a handler
  didn't play its own effect, a soft blip plays. Detection = monotonic
  `lastPlayedSeq()` in sounds.js compared before/after the handler,
  checked only after async handlers settle so awaited sounds aren't
  doubled.
- Nav pluck on every hashchange (`app.js`); confirm dialog plays its own
  confirm/cancel tones on close.
- **Type-to-confirm destructive dialogs**: `showConfirmDialog` gained a
  `typeText` option ("Type DELETE / REPLACE to confirm") that keeps the
  confirm button disabled until the word matches exactly; Escape cancels,
  Enter confirms when enabled. Used by backup import-replace and Settings
  clear-all-data. (Manage Tasks delete originally used it too, but the
  type-confirm was later dropped in favor of the Undo toast — its only
  in-panel destructive dialog now confirms via the plain dialog.)
- **Level-up flash**: `buildLevelPanel` gained `{ clickable }` (Home's
  badge becomes a link to #/profile) and `{ levelUp }` (one-shot flash
  class). Home compares `getLevel(lifetimeExp)` before/after the toggle
  and re-renders with the flash + "Level N!" toast alongside the fanfare;
  achievement unlocks get their own toast + fanfare per badge.
- **Precache list completed**: APP_SHELL now lists every module under
  `js/` (achievements, notifications, sounds, installPrompt, toast,
  csvExport included) — the stale-shell gap formerly noted under
  Conventions is closed. README updated in step; CACHE_NAME → v29.

### Robustness audit fixes (SW v30)
A full read-through audit of all modules; fixes applied:
- **History crash on legacy records** (`core/history.js`): the day-record
  sort called `completedAt.localeCompare` unguarded — records imported
  from very old backups can lack `completedAt` (csvExport already
  anticipated this), so opening that day killed the whole History screen.
  Sort now treats a missing timestamp as oldest.
- **Backup import sanitization** (`backup/backupManager.js`):
  `normalizeBackup()` previously trusted every record. Now each
  task/completion is individually validated (id/date/taskId/name types,
  date shape, numeric expAwarded) and rebuilt explicitly so junk fields
  can't ride along; malformed rows are dropped and counted. Both import
  functions resolve `{ skipped }` and Settings toasts report the count
  ("N invalid records skipped"). This also closes the path that used to
  feed completion records without `completedAt` into the DB.
- **Daily target validation leak** (Home): message said "0–100000" but
  only `val >= 0` was enforced — upper bound now checked in code.
- **Async handlers wrapped in try/catch** per the documented error
  convention: Home toggle/target/sleep, Tasks add/toggle/delete/edit
  (+ Undo restore), task detail notes/reminder. DB failures now show an
  error toast + error buzz instead of an unhandled rejection.
- **Silent form validation fixed** (Manage Tasks): empty name / bad EXP
  previously returned with no feedback; both add and edit forms now show
  inline messages ("Give the task a name first." / "EXP must be between
  1 and 1000.").

### Remaining polish (SW v31)
- **Reminder timers re-arm across midnight**: `app.js` now polls once per
  minute via `setInterval` and detects date changes, re-calling
  `scheduleTodayReminders()` when the calendar rolls over — so a PWA tab
  left open overnight still fires tomorrow's reminders.
- **Overnight range warning**: the Tasks add/edit forms now reject
  `endTime < startTime` with a clear inline message instead of silently
  saving a range that silently skips conflict checks.
- **Dead code removed**: `tasksRepo.moveTask()` deleted — no UI called
  it; `setTaskOrder` kept (still exercised by harness).
- **`mobile-web-app-capable`** meta tag added alongside the legacy
  `apple-mobile-web-app-capable` so the standalone PWA hint covers both
  Android Chrome and iOS Safari.

### Onboarding + drag-to-reorder (SW v32)
- **First-time onboarding overlay**: Home checks `meta.onboardingDone` on
  first render; if false, a themed modal overlay appears with a brief
  welcome message and three steps (add tasks → check them off → level up).
  Tapping "Get Started" saves the flag and fades the overlay out. Persisted
  in meta so backups carry the preference; `metaRepo.getOnboardingDone()`
  / `setOnboardingDone()` helpers added.
- **Drag-to-reorder unscheduled tasks**: Manage Tasks rows without a
  schedule get a `≡` drag handle; pointer-based drag works for mouse and
  touch. During drag the row follows the pointer with `translateY`; on
  release the new order is read from the DOM and persisted via
  `tasksRepo.setTaskOrder()`. Scheduled tasks keep time-based ordering.
  CSS: `.drag-handle`, `.task-manage-row--dragging` styles.

### Internationalization (SW v33)
- **i18n module** (`core/i18n.js`): translation dictionary for English and
  Bahasa Indonesia with a `t(key, vars)` helper that supports interpolation
  via `{placeholder}` syntax. Language preference persisted in meta
  (`metaRepo.getLang()` / `setLang()`); initialized on app boot.
- **All screen strings translated**: every user-facing string across Home,
  Tasks, TaskDetail, Profile, History, Report, and Settings uses `t()`.
  Canvas-drawn share card text stays English (not translatable).
- **Language selector** in Settings: radio-button list (English / Bahasa
  Indonesia) styled identically to the theme picker; switching updates
  i18n state, persists to meta, re-renders Settings, and refreshes nav
  bar labels via `updateNavLabels()` exported from `app.js`.
- **Nav bar labels** updated dynamically from i18n on boot and on language
  switch. The `<html lang>` attribute is also set.

### Flexible task ordering + i18n polish (SW v33 continued)
- **Single sortOrder system**: all tasks (scheduled and unscheduled) share
  one `sortOrder` field. Scheduled tasks get `sortOrder = startTime in
  minutes` (set on create/update via `timeToSortOrder()`); unscheduled
  tasks get drag-assigned midpoint values that can land between scheduled
  tasks. Both Home (`dailyTracker.js`) and Tasks (`screenTasks.js`) sort
  by `sortOrder`, so the order is always consistent.
- **Flexible drag positioning**: unscheduled tasks can now be placed before,
  after, or between scheduled tasks. On drop, `initDrag` calculates a
  midpoint `sortOrder` between the neighbouring rows' `sortOrder` values,
  then persists only unscheduled tasks (those with a drag handle).
- **Indonesian translations rewritten**: replaced stiff, word-for-word
  translations with casual, natural Bahasa Indonesia (e.g., "Bertabrakan
  dengan" → "Bentrok sama", "Gagal mengurungkan" → "Gagal batalin").
  Fixed typo "riwayas" → "riwayat".

### Home greeting + task form redesign + audit fixes
- **Home greeting**: time-of-day greeting card at the top of Home (morning/
  afternoon/evening) with icon (☀️/🌙), character name if set, gradient
  background, and gold glow accent. i18n keys `home.greetingMorning`,
  `home.greetingAfternoon`, `home.greetingEvening` (+ NoName variants).
- **Task form redesign**: add/edit forms now have visible labels ("Task
  Name", "EXP Reward", "Schedule") with clock icons (🕐) on time inputs.
  Layout restructured into `.task-form__group`, `.task-form__row`,
  `.task-form__time-wrap`. Removed Start/End sub-labels and
  `task-form__time-field` wrappers — time inputs sit directly in a row
  with a dash separator. Mobile: EXP and Schedule stack vertically;
  desktop: side-by-side. Time inputs use `flex: 1` + `min-width: 0` to
  prevent overflow on narrow screens. `@media (min-width: 520px)` for
  desktop layout (auto-width time inputs).
- **Year at a Glance display-only**: tiles changed from `<button>` to
  `<div>` — no longer clickable; the month input + Generate button remains
  the way to load reports.
- **Robustness audit fixes**:
  - `backupManager.js`: `skipped` was not destructured from
    `normalizeBackup()` in `importBackup` and `importBackupMerge`, causing
    a ReferenceError on every completed import. Fixed by adding `skipped`
    to the destructuring.
  - `components.css`: `.home-greeting__text` used undefined `var(--text)`;
    changed to `var(--ink)`.
  - `toast.js`: confirm dialog "type to confirm" placeholder was hardcoded
    English; now uses `t("confirm.typePlaceholder")`. Required adding
    `import { t }` to toast.js.
  - `screenProfile.js`: name save lacked try/catch — added error handling.
  - `screenReport.js`: moment save lacked try/catch — added error handling.
  - `screenSettings.js`: removed unused `scheduleTodayReminders` import.
  - `components.css`: removed dead `.reorder-btn` CSS, merged duplicate
    `.task-manage-row` rules.

### Per-day notes (SW v34, DB v3, backup v3)
- **Notes became day-scoped**: the old single `tasks.notes` string "stuck"
  permanently — History read it live off the task, so editing it rewrote
  every past day. A new `taskNotes` store keyed `"<date>_<taskId>"` (like
  completions) makes "one note per task per day" structural. Task Detail
  edits *today's* note only; History shows each day's own note (and keeps
  it even if the task is later deleted); Manage Tasks rows preview today's
  note. `notesRepo.js` (getNote / getNotesForDate / setNote / getAllNotes);
  blank setNote deletes that day only. i18n `detail.notesToday` caption.
- **DB v2 → v3 migration** (in `db.js` `onupgradeneeded`): any legacy
  `tasks.notes` is copied into today's taskNotes record inside the
  versionchange transaction, then emptied off the task.
- **Backup v3**: `taskNotes` exported/imported; import-sanitized like the
  other stores (`skipped` counting); v1/v2 backup files get their legacy
  `tasks.notes` reconstructed as today's note on import. Tasks are now
  rebuilt explicitly in `normalizeBackup` (known fields only).

### Robustness audit round 2 (SW v35)
A read-through audit of every module; fixes applied (no DB or schema change):
- **Error-handling gaps closed**: Report's Generate button, History's
  month-change and day-cell clicks, and every Settings action (language
  switch, reminders on/off, sound on/off, accent apply/reset, install)
  now try/catch their async work with a translated error toast + error
  buzz, matching the documented error convention. New i18n keys
  `report.loadFailed`/`saveMomentFailed`/`generated`, `history.loadFailed`,
  and the `settings.*Failed` set (EN + ID).
- **`scheduleTodayReminders()` is fully best-effort now**: the whole body
  is wrapped so a transient DB error at boot can't surface as an
  unhandled rejection — it logs `console.warn` and moves on.
- **Wrong error message fixed**: saving a memorable moment in Report
  previously toasted `report.csvFailed` ("CSV export failed"); now uses
  the dedicated `report.saveMomentFailed`. The Report PDF footer was
  hardcoded English "Generated …" — now `t("report.generated")`.
- **Uncheck EXP math hardened** (`completionsRepo.runToggle`): a legacy
  completion record lacking a usable numeric `expAwarded` is coerced to 0
  instead of making the lifetime total `NaN`.
- **Drag cleanup** (Manage Tasks): `pointercancel` /
  `lostpointercapture` tear down an interrupted drag (scroll gesture,
  notification) instead of leaving the row floating with its styles.
- **Dead i18n keys removed**: `profile.unnamed`, `settings.invalidRecords`,
  `level.max` (defined but never referenced by any screen).
- **Doc drift fixed**: AGENTS.md's architecture line and SW v29 entry
  still claimed Manage Tasks delete used the type-to-confirm dialog, but
  the code had dropped it for the Undo toast; both now match reality.

### History shows every task of the day (SW v36)
- **Day detail now lists ALL tasks that existed that day**, not just the
  completed ones (user request: so the day's notes explain why something
  wasn't checked off). `getDayRecord(date)` in `core/history.js` grew from a
  completions-only record to `{ date, rows, totalExp }` where each row =
  `{ taskId, taskName, expValue, isCompleted, completedAt, note, deleted? }`.
  Row sources, in order: currently-existing tasks with `createdAt` (local
  calendar date) <= the day, in Home's sortOrder → completion snapshots for
  tasks deleted after completing → note-only rows for deleted tasks that
  still carry a note that day (marked `deleted: true`, name rendered as
  `history.deletedTask`). The app intentionally does not track deactivation
  dates, so a deactivated task keeps appearing as pending (same known
  limitation as `monthlyReport`).
- **`screenHistory.loadDay` renders the new rows**: done rows keep the
  green `+N EXP` tag; pending rows get a dimmed name (`.history-item--pending`),
  a small "Not done" pill (`.history-item__state`), and the tag renders
  `0 EXP` in `--danger` (`.history-item__exp--zero`). A summary line
  `.history-summary` shows `X / Y tasks done` (`history.doneOf`). Notes
  join moves from screenHistory into `getDayRecord` (it already read
  `notesRepo` for the same date), so the per-day guarantee is unchanged.
- **i18n**: `history.noTasks`/`noTasksDesc` reworded (empty state now means
  "no task existed that day", not "nothing completed"); new keys
  `history.doneOf`, `history.notDone`, `history.deletedTask` (EN + ID).
- **CSS**: `.history-summary`, `.history-item--pending`,
  `.history-item__state`, `.history-item__exp--zero` added to
  `components.css`; colors all via existing variables (`--ink-dim`,
  `--ink-faint`, `--danger`, `--panel-border`).
- No DB/schema/backup change (DB still v3, backup v3). New harness
  assertions cover excluded-coverage: tasks created after the day are not
  listed, tasks created before are (done + pending), deleted-completed
  snapshot rows survive, and note-only deleted rows appear with their note.

### Toast on task edit (SW v37)
- **Save success toast**: the Manage Tasks edit form (row edit → Save) now
  shows a "Task updated." toast (`tasks.saved`, EN + ID) on success, so
  the row reflow into the list has explicit positive feedback. The Task
  Detail note save already toasts (`detail.notesSaved`/`notesCleared`);
  this closes the one silent save path left in Tasks.
- i18n-only changes otherwise (no DB/CSS/UI structure change).
- **Harness rebuilt after a Temp wipe and moved into the repo**: the OS
  previously could clear the whole temp harness
  (`C:\Users\Admin\AppData\Local\Temp\opencode\idbtest`, `verify5.mjs` +
  `linkall.mjs` + `node_modules\fake-indexeddb` — wiped mid-session at SW
  v37). Both scripts were reconstructed from the app source and the
  assertion texts elsewhere in this doc, then **relocated to `test/`** with
  their `base` derived from `import.meta.url` (relative — the suite follows
  the repo and can never point at a stale copy again). `linkall.mjs`
  covers **every** versioned JS module (35) → "34 ok" + app.js instead of
  the old curated 29-module list. The suite passes "ALL VERIFIED"
  (70 assertions) from `cd daily-tracker/test`.

### Testing notes
- `verify5.mjs` assertions are deliberately time-zone- and clock-aware:
  avoid asserting exact badge sets when early-bird/night-owl depend on the
  wall clock (assert membership, not exact lists). The suite runs against
  `fake-indexeddb` with an in-memory DB and stubbed `document`/`el`.
- Sound calls don't need stubbing: `sounds.js` `ctx()` returns null when
  there is no AudioContext (as in Node), so every effect no-ops safely.
- Current assertion count is **112** (hard-tier seeded 503-day range +
  backfilled 40-day tail, the 12-assertion day-record block added at SW
  v36, the 2-assertion badge-i18n regression block added at SW v44, the
  17-assertion install block added at SW v55: the Install App button
  always renders for non-installed users, the manual guide starts `hidden`
  and a no-event click reveals it, `installApp()` resolves quietly — never
  a failure/dead-end —, prompts that resolve or throw both clear the event
  safely (no hangs, no toasts), and `appinstalled` sets `hasInstalled()` so
  installed sessions render a status line instead of the button, and the
  29-assertion v56 block: repeatDays unit tests, tasksRepo
  repeatDays/deactivatedAt round-trips, the June-10 weekday + deactivation
  clamp on day records, the five August 2026 `daysTaskExistedInRange`
  denominators, the Monday-bucket weekly summary + best-day tests,
  all-history CSV, the Tasks repeat-picker, the Report all-history button +
  `week-summary` section, and the Home yesterday pill, and
  the 1-assertion EN 3-letter short-day-name regression block added at SW
  v57). Don't
  assert exact intra-group row order in the day-record tests: sortOrder
  uses `Date.now()` so rapid `createTask` calls can tie, and `getAllTasks`
  tie-breaks by uuid key order — assert membership/sets and rely on the
  deterministic groups (existing rows first, deleted snapshot/note rows
  appended after).
- Harness base is **relative** (`new URL("../", import.meta.url)` from
  `test/`), so the suite follows the repo wherever it lives. The scripts
  originally hardcoded absolute `file:///` bases and silently tested a
  stale copy under `Downloads\1\daily-tracker`; the relative base removes
  that failure mode entirely.
- The hard-tier test seeds a 503-day completion range and must survive the
  real date drifting: it now backfills the 40 days ending "today" (adding
  only missing dates) so the daily-target streak check holds on any day the
  suite runs — a seed range that collides with the loop's dates silently
  toggles them off, which is exactly what broke `target-streak` when the
  wall clock moved past 2026-08-20.

### Cleanup audit (SW v38)
Small read-through fixes before going live; no DB/schema change:
- **Report longest-streak was hardcoded English**: the stat card built
  `\`${n} day${n===1?"":"s"}\`` literally. Now uses `t("detail.day")` /
  `t("detail.days")` so Indonesian users see "hari" instead of "day".
- **Profile name-save error toast used the wrong key**: the catch
  showed `t("profile.cardFailed")` ("Card export failed") — copied from
  the share-card handler. New dedicated i18n key `profile.nameFailed`
  ("Saving name failed" / "Gagal simpan nama"); the share-card handler
  keeps `profile.cardFailed`.
- **Settings theme-picker had no try/catch**: switching theme called
  `setTheme` with no guard — a meta write failure was an unhandled
  rejection, unlike every other Settings action. Wrapped per the error
  convention; new i18n key `settings.themeFailed` ("Switching theme
  failed" / "Gagal ganti tema").
- **Dead argument removed**: `screenTasks.js` called `initDrag(list,
  container)` but the function only takes `listEl` — the second arg was
  never used. Dropped the stray argument.
- Harness still passes ALL VERIFIED (68) and linkall "34 ok + app.js";
  CACHE_NAME → v38.

### Design overhaul + Lighthouse polish (SW v39)
Full rework of the visual shell and polish pass; no DB/schema change.
- **Stopwatch logo**: new `icons/icon.svg` (stopwatch: gold ring, crown, side
  button, 12 ticks, hour/minute hands) matching the "Daily Tracker" name.
  Regenerated PNGs with `icons/generate-icons.ps1` (Windows PowerShell +
  System.Drawing, zero deps — draws the same stopwatch at 192/512 and a
  centered 62%-scale maskable). `icons/generate-png.html` is an alternative
  browser tool that renders the SVG → canvas → PNG download. `index.html`
  now links the SVG favicon (modern browsers) with PNG fallback; manifest
  unchanged (already pointed at the regenerated PNGs).
- **Splash screen**: full-screen themed overlay (`#splash`) with animated
  stopwatch logo (spring in), "Daily Tracker" wordmark + tagline fade-up,
  and an indeterminate gold progress bar. `app.js` `dismissSplash()` fades
  it out and removes it from the DOM *after* the first screen render (never
  before), so no flash of unstyled content. `role="status"` for A11y; the
  blanket `prefers-reduced-motion` rule also tames it.
- **Micro-interaction library** (`css/animations.css`): page-in, staggered
  card/list/tile entrance (row/item nth-child), button press scale +
  hover shadow, glassy toggle checkbox bounce, input focus glow
  (color-mix ring), chip toggle pop, nav tab press, toast spring,
  exp-bar/tally/completion fill sweep, achievement tile hover lift,
  dialog pop, backup-banner pulse. All keyed to existing CSS variables so
  every theme picks them up; `prefers-reduced-motion` in main.css kills all
  of it.
- **shadcn-inspired depth**: `--shadow-sm/md/lg` tokens in main.css (both
  `:root` and the self-contained `[data-theme="stat-sheet"]` block) applied
  as subtle card shadows on `.level-panel`, `.task-list`,
  `.profile-name-card`, `.settings-section`. Bottom nav upgraded to a
  frosted-glass bar (`backdrop-filter: blur(14px)`, translucent fill,
  upward soft shadow).
- **Lighthouse & A11y**: added `.skip-link` (offscreen → visible on focus
  targeting `#app`), `aria-label` on nav landmarks + decorative SVG
  `aria-hidden`, proper Open Graph tags (title/description/image/site_name),
  `rel="canonical"`-free single-URL PWA is fine as-is, `og:theme_color` and
  a global `color-scheme: dark` meta were removed (non-standard / wrong for
  the light parchment theme), `meta robots index,follow` + author added.
  All assets remain local/zero-dependency so perf is untouched.
- Splash lives in the precache shell (`css/animations.css`, `icons/icon.svg`
  added to APP_SHELL). CACHE_NAME → v39.

### Install button hides when installed (SW v40)
- **Install state detection** (`installPrompt.js`): new `isInstalled()` export
  returns true when this session saw `appinstalled` (`vestedInstalled` flag),
  when the app runs in `display-mode: standalone`, or on iOS
  `navigator.standalone` — wrapped so `matchMedia`/`navigator` absence in
  odd embeds fails safe to "not installed". `canInstall()` now also bails
  when `isInstalled()`, so a stale `beforeinstallprompt` event can't reoffer
  the button to an already-installed user.
- **Settings UI**: `buildInstallSection` renders the Install button only
  when `isInstalled()` is false; installed users get a
  `settings.installed` status line ("App installed — you're good to go." /
  "App udah keinstall — gas pol.") instead of the button. `appinstalled`
  already re-renders Settings via `onInstallPromptReady` in app.js, so the
  button disappears the moment installation completes.
- Harness still passes ALL VERIFIED (68) and linkall "34 ok + app.js" —
  the Node harness has no `window.matchMedia`, so `isInstalled()` returns
  false there and the button still renders for the existing assertions.
  CACHE_NAME → v40.

### Finalization session (SW v41)
A mixed audit-and-feature pass driven by a leftover session plan (A1–A3
fixes, B4–B6 i18n gaps, C7–C13 features, D14–D16 cleanup, E polish).
No DB/schema/backup change (still DB v3, backup v3). All work verified:
**verify5 → ALL VERIFIED (68), linkall → "35 ok, 1 fail"** (app.js-only
DOM failure, expected; `confetti.js` added to the module list).
- **A1 — legacy-completion guard** (`core/achievements.js`): `isUsableCompletedAt()`
  normalizes a completion's `completedAt` for hour-based badges
  (`early-bird`, `night-owl`, and both hour-push hard-tier badges): records
  imported from old backups with a null/missing `completedAt` were coerced
  to "epoch midnight", so every legacy completion looked like a 7 AM tick
  and could falsely satisfy hour badges. Unusable timestamps now count as
  "not completing at that hour" instead of "7 AM".
- **A2 — unstuck sort order** (`db/tasksRepo.js`): `updateTask` with a
  cleared `startTime` now sets `sortOrder = Date.now()`, so the task leaves
  its old time-based slot instead of sitting forever at an empty-schedule
  position.
- **A3+B4 — month/day names unified** (`core/i18n.js`, `utils.js`,
  `ui/components.js`, `ui/screenReport.js`, `ui/screenHistory.js`): the
  three homegrown month arrays (`utils`, `components`, `screenReport`) and
  `screenHistory`'s weekday header array are consolidated into i18n
  helpers (`monthShortName/monthFullName/dayFullName/dayShortName` with
  EN + ID lists). `monthName()` delegates to `monthFullName`; heatmap month
  labels and day headers now translate with the language instead of being
  hardcoded English.
- **B5 — 20 badges translated** (`core/i18n.js` + `ui/screenProfile.js` +
  `ui/screenHome.js`): the Profile gallery and Home unlock toast render
  `t(\`ach.${achKey(a)}\`)` / `ach.${achKey(a)}Desc` (camelCase suffix
  mapping, e.g. `first-blood` → `ach.firstBlood`). Badge `title`/`desc`
  in `getAchievementState` stay English (only the render layer
  localizes); the share-card canvas keeps English per the documented
  rule. All 20 EN + ID pairs hand-translated into natural Indonesian.
- **B6 — dumb literals localized** (`ui/components.js`): the level badge
  "LVL" text → `t("common.lvl")`; the badge's `aria-label`/tooltip →
  `t("common.viewProfile")`.
- **C7 — per-badge progress** (`core/achievements.js`, `ui/screenProfile.js`,
  `css/components.css`): `getAchievementState()` items gain
  `progress: {cur, goal}` via a new `progressOf(def, s)` over count-based
  badges (`totalCompletions`, `longestStreak`, `bestTargetHitStreak`,
  `lifetimeExp`); locked tiles with a progress object render a
  `.ach-tile__progress` bar (`.ach-tile__bar` + inline-width
  `.ach-tile__bar-fill`) + `cur / goal` counter. Unlocked tiles skip the
  progress row.
- **C8 — duplicate task** (`ui/screenTasks.js` + i18n
  `tasks.duplicate/duplicated/duplicateFailed`): each Manage Tasks row gets
  a duplicate icon-button that clones name (with " (copy)") plus EXP and
  schedule, then toasts `tasks.duplicated`.
- **C9 — copy backup to clipboard** (`backup/backupManager.js` +
  `ui/screenSettings.js` + i18n `settings.copyBtn/backupCopied/copyFailed`):
  `buildBackupData()/exportBackup()/writeTextToClipboard()` (hidden
  textarea + `execCommand` fallback) refactored out of the export path;
  the new `copyBackupToClipboard()` uses `navigator.clipboard.writeText`
  first. Settings shows a "Copy Backup (JSON)" button beside Export inside
  the same `.accent-picker-row` wrapper.
- **C10 — auto language detection** (`db/metaRepo.js` + `app.js`):
  `metaRepo.getLang()` now resolves to `null` when nothing is stored (the
  old hardcoded `"en"` default silently skipped the browser check) — only
  `app.js` consumes it. Boot: `navigator.language.startsWith("id")` → `"id"`
  else `"en"`, persisted via `setLang`.
- **C11 — native share card** (`ui/screenProfile.js` +
  i18n `profile.shareCard`): `buildShareCardButton` now returns a row of
  the Download button plus (only when `navigator.share` exists) a Share
  button that converts the already-composited canvas to a `File` and calls
  `share({files})` after `canShare` — `AbortError` (user dismissed)
  ignored, any other failure falls back to downloading the PNG.
- **C12 — confetti** (new `js/ui/confetti.js` + `css/animations.css` +
  `css/main.css` + `ui/screenHome.js`): `confettiBurst()` spawns 24
  `.confetti-piece` divs in a fixed `pointer-events: none` `.confetti-host`,
  each sized/drifted/rotated/colored via inline `--c-*` custom properties
  (gold-tinted palette + `hsl` hue inlays), auto-removing the host after
  2800ms. Fires on level-up and once per fresh badge unlock in Home. The
  blanket `prefers-reduced-motion` block in `main.css` hides the host
  outright. `js/ui/confetti.js` + `icons/icon-180.png` added to the SW
  APP_SHELL and `test/linkall.mjs` (hence "35 ok").
- **C13+E — install/social polish**: `manifest.json` gains `id`, `lang`,
  and two search-`shortcuts` (Tasks, Profile); the icon generator
  (`icons/generate-icons.ps1`) now also emits `icon-180.png`, and
  `index.html` points `apple-touch-icon` at it (sized 180×180);
  `twitter:card`/title/description/image metas added alongside the Open
  Graph block.
- **D14–D16 — dead code sweep**: removed the two stale "quick-add"
  comment stubs (`css/main.css`, `css/components.css`) that survived the
  original removal; a scan of every class token in the CSS against `js/`
  + `index.html` found no genuinely dead rules (its 56 flags were
  animation-duration tokens plus dynamically-templated classes such as
  `cal-cell--done-N`, `percent-ring__progress`, `.toast--success`); nine
  dead i18n keys (`tasks.expPlaceholder`/`startPlaceholder`/`endPlaceholder`/
  `labelStart`/`labelEnd`, `settings.deleteType`/`confirm`/`cancel`,
  `level.toNext`) were deleted.
- Harness/golden files: the suite's existing i18n-text assertions
  ("Download Character Card", "Monthly Report", "History") all key off
  preserved EN button texts; `node --check` passes on every edited module.
  CACHE_NAME → v41.

### Install that actually installs (SW v42)
User report: "why can't it auto-install — my other project installs on
first tap". Diagnosis: `beforeinstallprompt` is fully browser-owned and,
on the very first visit, the freshly-registered service worker doesn't
yet "control" the page that registered it, so browsers keep the install
prompt gated — the button fell back to the hint toast for at least one
visit. Fixes (no DB/CSS/schema change):
- **First-visit self-reload** (`js/app.js` `registerServiceWorker`): when
  registration resolves and `navigator.serviceWorker.controller === null`,
  the page reloads exactly once (guarded by `sessionStorage["dt-sw-reloaded"]`)
  so the worker takes control of the next load → installability gets
  evaluated → the Settings Install button can actually fire. Skipped when
  already installed / running standalone / iOS (where programmatic install
  doesn't exist). The pre-existing SW *update* controllerchange reload is
  untouched, so the two mechanisms can't double-reload.
- **Platform-aware fallback toast** (`js/ui/screenSettings.js` +
  `js/ui/installPrompt.js`): the Install click handler's `!canInstall()`
  branch now routes per platform via a new `isIOS()` export — iOS gets
  "use Share → Add to Home Screen" (`settings.installIOS`); anything else
  gets "preparing once, then tap Install again" (`settings.installRefresh`).
  The old generic `settings.installHint` key (now dead) was replaced by
  those two keys in EN + ID.
- **Live re-render already handled**: `onInstallPromptReady` in app.js
  re-renders Settings the moment `beforeinstallprompt` arrives, so the
  button becomes active without revisiting the tab.
- Harness unchanged (verify5 never simulates a real SW/install flow; its
  install assertions only check the button renders). Verified: verify5
  ALL VERIFIED (68), linkall "35 ok, 1 fail", `node --check` on edited
  modules. CACHE_NAME → v42.

### Install rebuilt as a guide (SW v43)
User report: the native dialog now appears when tapping the button, but
installing "does nothing" in Brave (Brave's `beforeinstallprompt` dialog
can silently no-op), and the v42 "wait for the reload" fallback never
fires for returning visitors. Lesson: an in-page install button can never
force the browser — `prompt()` only works if Chrome-family actually sends
`beforeinstallprompt`, and Brave frequently doesn't (or the dialog
completes nothing). Rather than chase the browser, the app now guides.
- **First-visit auto-reload removed** (`js/app.js`): the v42
  sessionStorage-guarded reload block is gone — it couldn't conjure a
  `beforeinstallprompt` and only produced a confusing flash/reload story.
  `registerServiceWorker` is back to a plain register+catch;
  `isInstalled`/`isIOS` imports removed from app.js.
- **Install panel rebuilt** (`js/ui/screenSettings.js`
  `buildInstallSection`): no longer a lone button. Non-installed, non-iOS
  users get the Install button PLUS an always-visible `.install-guide`
  note: "If the button doesn't finish the install, use your browser's own
  menu — that always works:" with a per-platform line (desktop: "⋮ → Save
  and Share → Install page as app…", Android: "⋮ → Install app"). iOS
  users get only the Share → Add to Home Screen instructions (no dead
  button). Click with no stashed event → short toast
  (`settings.installNotReady`) instead of the misleading reload message.
- **`isAndroid()`** added to `installPrompt.js` alongside `isIOS()`;
  detection is UA-based, try/catch-wrapped, fails safe to false (Node
  harness has neither hit).
- **i18n**: `settings.installRefresh` (v42, now dead) replaced by
  `settings.installNotReady` + `settings.installNote` +
  `settings.installGuideDesktop` + `settings.installGuideAndroid` (EN +
  ID). `settings.installIOS` kept.
- **CSS**: `.install-guide` / `.install-guide__intro` /
  `.install-guide__step` added in components.css (dashed panel, uses
  `--panel-border`/`--bg-raised`/`--radius-md` tokens; no motion).
- Harness assertions untouched and still green: "Settings shows Install
  App button" (EN `settings.installBtn` "Install App" still rendered for
  non-installed users) and "Install button is never disabled". Verified:
  verify5 ALL VERIFIED (68), linkall "35 ok, 1 fail", `node --check` on
  edited modules, CSS brace balance. CACHE_NAME → v43.

### Achievement name i18n fix (SW v44)
User report: "achievement names are scrambled — 'ach ach'". Root cause: the
per-screen `achKey()` helpers only stripped a hyphen before a **lowercase
letter** (`/-([a-z])/`), and id suffixes like "streak-7"/"exp-1000" use
numeric suffixes, so `t("ach.streak-7")` fell back to the literal key and
13 of the 20 badges rendered as "ach.streak-7" in the Profile gallery and
the Home unlock toast. Fix (JS + harness only, no DB/CSS/schema change):
- **Single source of truth** (`core/achievements.js`): new exported
  `achievementKey(id)` maps any badge id to its i18n suffix, including
  digit suffixes (`/-([a-z0-9])/gi`, so "streak-7" → "streak7"). The
  duplicated, broken `achKey()` helpers in `screenProfile.js` and
  `screenHome.js` were deleted; both call sites now use
  `achievementKey(a.id)`.
- **Regression harness** (`test/verify5.mjs`): two assertions added after
  the 20-badge block — `achievementKey` resolves all six shape variations
  (letter- and digit-suffix ids) to real translations plus "digit-suffix
  badges translate in EN". Verify5 count 68 → **70**; a similar helper
  regression now fails loudly instead of shipping.
- Verified: ach-resolution script shows 0 missing in EN **and** ID for all
  20 badges; `node --check` all JS; verify5 ALL VERIFIED (70); linkall
  "35 ok, 1 fail" (app.js DOM-only); CSS braces balanced. CACHE_NAME →
  v44.

### About this app section (SW v45)
User request: an "About this app" section in Settings explaining what the
app does. No DB/schema/backup change; JS + i18n + CSS only.
- **`buildAboutSection()`** (`ui/screenSettings.js`): a `.settings-section`
  appended last (under Danger Zone) with an intro, a bulleted feature list
  covering all six screens, a bordered data/privacy block ("everything
  stays in IndexedDB on this device — keep a backup"), the zero-dependency
  tech note, and a Version row driven by a new display-only `APP_VERSION`
  constant ("v45") that must be bumped in step with the SW cache name.
- **i18n** (`core/i18n.js`): twelve new `about.*` keys (title, intro,
  featuresTitle, f1–f6, dataTitle, dataDesc, tech, version) in EN + ID,
  written in the same casual Indonesian register as the rest of Settings.
- **CSS** (`css/components.css`): `.about-list`, `.about-list__item`
  (gold dot bullets), `.about-list--block`, `.about-list__block`,
  `.about-list__label`, `.about-list__text` — all via existing tokens
  (`--ink`, `--ink-dim`, `--gold`, `--panel-border`), no motion.
- Verified: `node --check` on edited JS; verify5 ALL VERIFIED (70);
  linkall "35 ok, 1 fail" (app.js DOM-only); CSS brace balance;
  i18n scan shows the new `about.*` keys all used. CACHE_NAME → v45.

### Install that actually installs (SW v46)
User report: still can't install; the reference project (`ai-companion`,
deployed at `missmybae.vercel.app`) installs "very well". Diagnosis: the
in-app Install button depended on `beforeinstallprompt`, which Chromium
(especially Brave) often withholds or silently no-ops, so the always-visible
button produced dead taps. The reference installs via the **browser's own
install affordance** — it only ever shows its button when the browser has
actually handed it a `beforeinstallprompt` event. Aligned Daily Tracker to
that proven pattern. No DB/schema/backup change.
- **Install UI reworked** (`ui/screenSettings.js` `buildInstallSection`):
  the Install button now renders *only* when `canInstall()` is true (a
  `beforeinstallprompt` event is actually held); the dead-button branch and
  its "not ready yet" toast are gone. The `.install-guide` panel remains
  always-visible for installed-eligible users and is now the primary path:
  desktop Chrome/Brave/Edge → browser menu (⋮) → Save and Share → "Install
  page as app…"; Android → ⋮ → Install app. iOS keeps its no-button
  Share → Add to Home Screen panel. `onInstallPromptReady` (app.js) still
  re-renders Settings live, so the button pops in the moment the browser
  offers the event.
- **Manifest renamed `manifest.json` → `manifest.webmanifest`**: Vercel
  serves `.webmanifest` with Content-Type `application/manifest+json`
  (verified live), matching the working reference and removing any MIME
  doubt from installability checks. References updated: `index.html` link
  href, SW `APP_SHELL`, README, AGENTS. Old file deleted.
- **`vercel.json` added** (new file): `Cache-Control: no-cache, no-store,
  must-revalidate` on `/service-worker.js` and `no-cache, must-revalidate`
  on `/manifest.webmanifest` — the CDN can no longer serve a stale SW or
  manifest, so update + installability checks always see the newest files.
- **About section tidied** (user request): the "Version" row (and its
  `about.version` i18n keys + the `APP_VERSION` display constant) removed
  so the Settings About panel stays clean; dead `settings.installNotReady`
  key deleted; `installDesc`/`installNote` reworded to match the
  button-gated UI.
- Verified: `node --check` all JS; verify5 ALL VERIFIED (72); linkall
  "35 ok, 1 fail" (app.js DOM-only); CSS untouched (brace balance
  unchanged); grep confirms the tokens `manifest.json`/`installNotReady`/
  `APP_VERSION`/`about.version` survive only in changelog/history prose,
  never in code.
  CACHE_NAME → v46.

### Install button anti-hang (SW v47)
User report: after v46, on Brave the Install button "can't be pressed" —
no dialog, no toast, the click just dead-ends. Root cause: Brave can
silently swallow `prompt()` on a held `beforeinstallprompt` event: no
dialog appears and the `userChoice` promise **never settles**, so
`installApp()`'s `await deferredPrompt.userChoice` hung forever and the
click handler never produced feedback. Fix (JS/CSS/i18n/harness only, no
DB/schema/backup change):
- **`js/ui/installPrompt.js`**: `installApp()` can no longer hang. The
  `userChoice` promise is raced against a 4-second timeout
  (`INSTALL_PROMPT_TIMEOUT` via a small `withTimeout` helper), and
  `prompt()` is wrapped in try/catch. Unless the user explicitly answered
  accepted (`true`) or dismissed (`false`), the held event is dropped,
  `notifyReady()` fires, and the call resolves to a distinct
  `"unsupported"` value — so a silently-swallowed prompt becomes a
  recoverable outcome instead of a frozen press. Chrome/Edge keep the
  one-tap happy path; the timeout only ever triggers when the browser
  never answers.
- **`js/ui/screenSettings.js`**: the Install button's click handler
  branches on the triple result. `"unsupported"` → error buzz + new
  translated toast + re-render (which removes the button now that the
  event is gone) + a `.install-guide--flash` one-shot highlight on the
  always-working browser-menu panel. Ordered re-render first, then flash
  the freshly built guide via `container.querySelector(".install-guide")`
  (class re-triggered with `void guide.offsetWidth`).
- **i18n**: new key `settings.installUnsupported` EN + ID
  ("The install prompt didn't respond — use your browser's menu below
  instead." / "Prompt install browsernya nggak ngerespons — pakai menu
  browser di bawah ini aja.").
- **CSS**: `.install-guide--flash` + `@keyframes install-guide-flash` in
  components.css — a 1.2s gold border/glow sweep ending back at
  `--panel-border`, killed by the blanket `prefers-reduced-motion` rule.
- **Harness** (`test/verify5.mjs`): +5 assertions, all timer-free and
  deterministic — `installApp` returns `true` for an accepted prompt and
  clears the event; a bare event whose `prompt()` throws resolves to
  `"unsupported"` without hanging; `canInstall()` is false afterwards; and
  the UI re-renders with no Install button. Verify5 count 72 → **77**.
- Verified: `node --check` all JS; verify5 ALL VERIFIED (77); linkall
  "35 ok, 1 fail" (app.js DOM-only); CSS braces balanced; actual deploy
  now flows through git (repo `aruchaaa/Daily-Tracker`, branch `main`)
  with the Vercel project `dailytrackerv1` git-connected, so a push
  auto-deploys to `https://levelupdailytracker.vercel.app`.
  CACHE_NAME → v47.

### Always-pressable Install button (SW v48)
User report: "the install button is just text, not a button that can be
pressed — MAKE THE BUTTON INSTALL THE PWA". Root cause: SW v47 only
rendered the Install button when a `beforeinstallprompt` event was held,
and the user's Brave never fires that event, so the section showed only
the plain browser-menu guide text — a UX dead end. Fix (JS/CSS/i18n/
harness only, no DB/schema/backup change):
- **`js/ui/installPrompt.js`**: new `supportsInstallElement()` —
  feature-detects the browser-native `<install>` element
  (`"HTMLInstallElement" in window`, try/catch → false). The declarative
  install button works without any `beforeinstallprompt` ceremony.
- **`js/ui/screenSettings.js`**: `buildInstallSection` now ALWAYS renders a
  pressable install control for non-installed, non-iOS users, in three
  tiers: (1) the native `<install>` element (class `install-pwa`, `<button>`
  look) when `supportsInstallElement()`; (2) otherwise our `<button>`,
  which prompts via `installApp()` when an event is held; (3) if neither a
  native element nor an event is usable (Brave), the click plays an error
  buzz, toasts `settings.installUnsupported`, and flashes the guide. The
  button can never hang (v47 race stays) and is never text-only. Unused
  `canInstall` import dropped.
- **i18n**: `settings.installUnsupported` reworded to cover "browser won't
  allow any prompt" (EN: "Your browser didn't allow an install prompt — use
  your browser's menu below instead." / ID "Browser kamu nggak ngizinin
  prompt install — pakai menu browser di bawah ini aja.").
- **CSS**: `.install-pwa` in components.css (inline-flex, centered,
  full-width host for the native element).
- **Harness** (`test/verify5.mjs`): install block reworked — the button
  must render as a pressable control at first render with no event at all,
  stay responsive with an event held, survive the accepted and swallowed
  paths, and STILL render pressable after a dropped prompt. Added
  `supportsInstallElement` regression (false in Node). Verify5 count 77 →
  **79**.
- Verified: `node --check` all JS; verify5 ALL VERIFIED (79); linkall
  "35 ok, 1 fail" (app.js DOM-only); CSS braces balanced. Due for auto-deploy:
  `git push` to `aruchaaa/Daily-Tracker` `main` → Vercel
  `dailytrackerv1` → https://levelupdailytracker.vercel.app.
  CACHE_NAME → v48.

### Manifest mirrored to the proven reference (SW v49)
User report: "the install button still fails to install — make it work like
the missmybae project". Diagnosis: a field-by-field audit of the live
daily-tracker vs the reference that installs reliably on the same browser.
Both sites already passed every documented Chrome/Brave installability
criterion (HTTPS, valid manifest served `application/manifest+json`,
192+512 PNG icons with correct real dimensions, `start_url` reachable,
SW with a fetch handler, every APP_SHELL URL HTTP 200) — so the audit
focused on what *differs* from the reference: (a) our manifest carried
`id`, `categories`, and two `shortcuts` whose `url` values are fragment
URLs — fragments are technically disallowed for shortcut URLs by the Web
App Manifest spec, and a browser that rejects any manifest member logs it
as a parse error, which can silently kill installability/beforeinstallprompt;
(b) the reference's icons are absolute `/icons/...` paths with BOTH a 192px
and 512px maskable; (c) the strongest hypothesis of all — the user's v43
"dialog appeared but did nothing" likely left Brave believing the app was
already installed, and per Chromium issue 40550435 **`beforeinstallprompt`
is never sent again if the app was previously installed**, exactly matching
the dead-button symptoms from v46 through v48. Fixes (icons + manifest +
i18n/ui only; no DB/schema/backup change):
- **`manifest.webmanifest` rebuilt to the reference's exact shape**: icons
  use absolute `/icons/...` src; two maskable entries (192 + 512) added;
  `id`, `categories`, and the fragment-URL `shortcuts` removed; `start_url`
  and `scope` set to `/`; display/orientation/colors/lang kept.
- **Icon rename + new size**: `icons/icon-512-maskable.png` renamed
  `icons/icon-maskable-512.png`, and a matching `icons/icon-maskable-192.png`
  added so both maskable sizes exist (like the reference). `generate-icons.ps1`
  and `generate-png.html` updated to emit/download the new names; all PNGs
  regenerated and verified 192/512 real pixels (System.Drawing). Maskable
  icons stay manifest-only (not in APP_SHELL) per the existing convention.
- **Previously-installed guidance** (`ui/screenSettings.js` +
  `core/i18n.js`): the desktop install guide gains a third step —
  `settings.installExisting` (EN + ID) — telling the user to delete a stale
  "Daily Tracker" entry in `brave://apps` / `chrome://apps` so Chromium
  re-offers install; the app itself can't detect or clear that browser-side
  state.
- **SW/docs**: CACHE_NAME → v49; README "What's new (cache v49)" section +
  version line; AGENTS history entry. Harness untouched (verify5 still **79**;
  install-prompt logic unchanged); the affirmation — v49 changes, `node --check`
  all JS, verify5 ALL VERIFIED (79) PASS, linkall 35 ok/1 fail, manifest parses
  as JSON, CSS braces balanced. Push to `main` auto-deploys.
  CACHE_NAME → v49.

### Stale-install detection + honest install toasts (SW v50)
User report: "the install button still shows 'Install was cancelled' — on
missmybae the button is always there and installs over and over to add the
desktop shortcut; why not here?" Read of the report: the "was cancelled"
toast only appears when `beforeinstallprompt` actually fires and
`prompt()` resolves **dismissed** — so v49's manifest mirror DID restore
installability, but on the user's Brave the install dialog then declines.
That pattern — silent decline / instant dismissed — is exactly what
Chromium does when it believes the origin's PWA is *already installed*
(seldom visible to the user after a broken earlier attempt). missmybae has
no such ghost install, which is why it re-installs happily every time.
Fix (JS/i18n/harness only; no DB/schema/CSS/backup change):
- **`js/ui/installPrompt.js`**: new `refreshRelatedInstalled()` — a
  best-effort `navigator.getInstalledRelatedApps()` query that asks the
  *browser itself* whether it lists a web app for this origin, stored in
  module state (`relatedInstalled`; try/catch → false). New
  `isRelatedInstalled()` export. `captureInstallPrompt()` kicks the query
  off once on boot.
- **`js/ui/screenSettings.js`**: `buildInstallSection` now short-circuits
  to a stale-install panel (no button) whenever `isRelatedInstalled()` is
  true: `settings.installAlreadyDetected` explains the browser believes
  it's installed + how to clear it (right-click Daily Tracker in
  brave://apps / chrome://apps → Remove) + the browser-menu guide. The
  button's click handler branches dismissed/unsupported by
  `isRelatedInstalled()`: if the browser has a record, the click shows the
  same detection guidance instead of the confusing "cancelled" text.
- **i18n**: `settings.installCancelled`/`settings.installing` deleted
  (dead); replaced by `settings.installNotCompleted` (dismissed, info) and
  `settings.installAlreadyDetected` (stale-install, error) + success now
  toasts `settings.installed`. EN + ID.
- **Harness** (`test/verify5.mjs`): +7 assertions (79 → **86**) — absence
  of `getInstalledRelatedApps` reports not-installed without throwing; a
  listed webapp for this origin (stubbed `navigator` + `location`) drops
  the Install button and shows the brave://apps panel; resetting the
  record restores the button. Harness navigator/location stubs restored in
  a `finally` so the later install asserts still see no record.
- Verified: `node --check` all JS; verify5 ALL VERIFIED (86) PASS; linkall
  35 ok/1 fail (app.js DOM-only); manifest parses as JSON; CSS untouched.
  CACHE_NAME → v50.
  - **Next step with the user**: re-test on Brave in a fresh tab. Expected
    outcomes: if Brave lists a ghost install, Settings now shows the
    "browser thinks it's installed" panel → user deletes the entry in
    brave://apps → reload → the button works and re-installs like
    missmybae. If Brave lists *no* record yet still declines, the fallback
    is the always-working browser menu (⋮ → Save and Share → Install page
    as app…), which creates the desktop shortcut regardless of the
    install prompt.

### No-event install de-conflation (SW v51)
User report (v50 live): after deleting the stale `brave://apps` entry the
install STILL fails, "Install wasn't completed". Diagnosis: that message
was shown for **two different realities** — "the browser dismissed the
dialog" (`userChoice` resolved dismissed) **and** "no `beforeinstallprompt`
event was ever held" — because `installApp()` returned `false` for both.
On Brave the no-event case is the common one (the event is often never
sent, especially after an install was recorded at some point), so the
"wasn't completed" wording wrongly implied a dialog had appeared and been
cancelled. Fix (JS + harness + docs only; no DB/schema/CSS/backup change):
- **`js/ui/installPrompt.js`**: `installApp()` now returns a distinct
  `"none"` when no event is held (instead of `false`), so the click
  handler's generic else-branch (menu-guidance toast + guide flash, plus
  the stale-install branch) replaces the misleading dismissed message.
  `false` is reserved for a genuinely-dismissed dialog.
- **Harness** (`test/verify5.mjs`): +1 assertion (86 → **87**) — calling
  `installApp()` with no event held resolves to `"none"`, never a
  misleading cancelled/dead-end path.
- Verified: `node --check` all JS; verify5 ALL VERIFIED (87) PASS; linkall
  35 ok/1 fail (app.js DOM-only); CSS untouched. CACHE_NAME → v51.
  - **Diagnostic next step with the user** (the real fix will come from
    their browser, our code can only report accurately): (1) does the
    native dialog actually appear when they click Install? (2) does the
    install icon show in the Brave address bar for daily-tracker vs
    missmybae? (3) does Brave's ⋮ → Save and Share → "Install … as app…"
    menu item create the shortcut? (4) does the install work in an
    Incognito window? The incognito test discriminates profile residue
    ("installed at some point" flags that survive brave://apps removal)
    from a site-level installability problem.

### Slow installs are never failures (SW v52)
User report (v51 live): while the browser-menu path always works, the
in-app Install button shows a failure toast even in a **fresh Incognito
window** — but the native dialog *does* appear. Diagnosis: the v47
anti-hang guard raced `prompt().userChoice` against a **4-second** timeout,
but Windows installs can legitimately take several seconds (antivirus/
disk); the race fired first and reported "Install wasn't completed" while
the shortcut was still being created. missmybae has no race at all (it
`await`s `userChoice` directly), which is why it always answers honestly.
Fix (JS/i18n/docs only; no DB/schema/CSS/backup change):
- **`js/ui/installPrompt.js`**: the feedback window is now 10s, and
  `installApp()` gains a **`"pending"`** outcome ("the dialog is still
  working") instead of claiming failure on a slow answer. A late
  acceptance still flips the UI to installed: a late-resolve listener
  (bound **only** on the timed-out path, so the normal accepted path keeps
  its prior `appinstalled`-driven behavior — the original unconditional
  binding broke the harness's later stale-install asserts by setting
  `vestedInstalled` early) sets `vestedInstalled` + `notifyReady`.
  Outcomes: `true` accepted, `false` dismissed, `"none"` no event held,
  `"unsupported"` `prompt()` threw, `"pending"` still working.
- **`js/ui/screenSettings.js`**: `"pending"` shows a neutral info toast
  (no error buzz, no guide flash); the guide flashes only for the
  no-mechanism outcomes.
- **i18n**: new `settings.installPending` EN + ID.
- Harness unchanged (still 87 — the `prompt()`-throws→`"unsupported"`
  assert already covers the only no-timer branch; a deterministic slow-
  resolution test would need real timers, which the suite deliberately
  avoids). CACHE_NAME → v52.

### The browser remembers old installs (SW v53)
User report + earlier findings: even with the ghost `brave://apps` entry
deleted, the button showed "Your browser didn't allow install prompt" —
and the user asked for the button to trigger the address-bar install icon.
Root cause, confirmed from Chromium issue 40550435 and community practice:
**`beforeinstallprompt` is silently withheld on any origin that was
*previously installed* on that profile** — `AppBannerSettingsHelper::
ShouldShowBanner` keys on "installed at some point", not "installed now".
The address-bar icon and our `prompt()` pull from the *same* internal
install dialog; pages **cannot** programmatically click the address-bar
icon (no such API exists), so the only browser-side reset is clearing the
origin's site data, which flips the flag back and re-fires the event.
Fix (i18n/UI/docs only; no DB/schema/CSS/backup change):
- **i18n**: `settings.installUnsupported` reworded from "didn't allow an
  install prompt" (answer-less) into the concrete fix — "Brave hides the
  install prompt because it remembers an old install… shield/lock icon in
  the address bar → Site settings → Clear data → reload — then this button
  opens the same dialog as the address-bar icon." New `settings.
  installResetDesktop` / `installResetAndroid` guide steps (EN + ID).
- **`js/ui/screenSettings.js`**: the general install guide now lists the
  always-working browser-menu step **plus** the per-platform site-data
  reset step (desktop: lock/shield icon → Site settings → Clear data;
  Android: lock icon → Cookies and site data). The `isRelatedInstalled()`
  panel keeps its own brave://apps clear instructions.
- Harness unchanged (87). CACHE_NAME → v53.

### Install rebuilt to match missmybae exactly (SW v54)
User's final direction: "hapus semua fitur instal ini, bangun dari awal,
bikin dengan cara yang sama persis seperti project missmybae." The whole
custom install apparatus we'd layered on across v46–v53 is removed and
replaced with the reference's proven four-line pattern (read verbatim out
of `ai-companion` `client/src/App.jsx`: defer `beforeinstallprompt`,
render the button **only** while the event is held, `prompt()` +
`await userChoice` in a try/catch, clear on `appinstalled`). No DB/
schema/backup change; JS + CSS + i18n + harness + docs only.
- **`js/ui/installPrompt.js` written from scratch** (path kept): exports
  are now just `captureInstallPrompt()` (registers `beforeinstallprompt` +
  `appinstalled`), `hasInstallPrompt()`, `installApp()`, and
  `onInstallPromptReady`. Deleted: `isInstalled`, `isIOS`, `isAndroid`,
  `isRelatedInstalled`, `refreshRelatedInstalled`, `canInstall`,
  `supportsInstallElement`, `withTimeout`, `INSTALL_PROMPT_TIMEOUT`,
  `vestedInstalled`. `installApp()` returns nothing, swallows any
  `prompt()`/`userChoice` rejection (cancelling the dialog is normal), and
  clears the event.
- **`js/ui/screenSettings.js`**: `buildInstallSection` is now six lines —
  `if (!hasInstallPrompt()) return null;` then a heading + a plain
  `Install App` button whose handler just plays the click sfx and calls
  `installApp()`. No toasts, no branches, no flash, no re-render-on-click.
  `el()` null-filters, so the whole section disappears when the browser
  offers no event (missmybae shows *nothing* install-related then too).
- **`js/app.js`**: untouched — `captureInstallPrompt()` at boot and the
  `onInstallPromptReady` Settings re-render (so the button pops in/out
  live) still line up with the kept export names.
- **CSS**: `.install-guide`, `__intro`, `__step`, `.install-pwa`,
  `.install-guide--flash` + `@keyframes install-guide-flash` deleted.
- **i18n**: `settings.install` + `settings.installBtn` kept; all sixteen
  saga keys (`installDesc`, `installIOS`, `installNote`, `installGuide*`,
  `installExisting`, `installNotCompleted`, `installPending`,
  `installAlreadyDetected`, `installFailed`, `installUnsupported`,
  `installReset*`, `installed`) deleted in EN and ID.
- **Harness** (`test/verify5.mjs`): the 21-assertion install saga block
  (canInstall/supportsInstallElement/timed-out outcomes/stale-install
  stubs) replaced with an 11-assertion missmybae-style block — no button
  with no event, `installApp()` resolves quietly (undefined), button
  appears only while the event is held, prompts that resolve or throw both
  clear the event without hanging, `appinstalled` removes the button.
  87 → **77**.
- Verified: `node --check` all edited JS; verify5 ALL VERIFIED (77);
  linkall 35 ok/1 fail (app.js DOM-only); CSS braces balanced; grep shows
  no leftover install-saga class/key references in `js/`/`css/`.
  CACHE_NAME → v54.
  - **Behavioral note for the user**: from now on the Install button
    exists *only* when the browser actually offers `beforeinstallprompt`.
    On a Brave profile that still remembers an earlier install of this
    origin, that event stays suppressed, so the Settings tab shows no
    install button until the origin's site data is cleared — the browser's
    own address-bar icon / ⋮ menu is the install path in the meantime.

### Install with an always-visible button + manual fallback guide (SW v55)
User follow-up to v54: "null hahaha" — with every guide removed, their
Brave (which never offers the event) renders no install UI at all. New
direction the user approved: bring the button back as an
**always-visible** control that fails over to a short manual tutorial
instead of a dead end, plus an app-wide cleanup pass (dead code/CSS/i18n
removed, doc sync).

- **`js/ui/installPrompt.js`**: adds `hasInstalled()` — `installedFlag` set
  on `appinstalled` OR `matchMedia("(display-mode: standalone)")` /
  `navigator.standalone` (try/catch → false; fails safe in Node). `installApp()`
  and the `beforeinstallprompt` handling stay untouched (missmybae shape).
- **`js/ui/screenSettings.js` `buildInstallSection`**: three states instead
  of "exists only while the event is held". Installed (`hasInstalled()`) →
  heading + `settings.installed` status line, no button. Otherwise a
  heading + Install App button **always rendered** + a `.install-guide`
  div hidden by default (`hidden` attr). Button click: `playClick()`;
  if `!hasInstallPrompt()` → `guide.hidden = false` (reveals the manual
  steps inline, no toast); else → `void installApp()` (the native dialog).
- **i18n**: `settings.installed` restored + five new keys (EN + ID):
  `installGuideHint`, `installManualDesktop` (address-bar ⤓ or ⋮ → Save and
  Share → Install page as app…), `installManualAndroid`, `installManualIOS`,
  and `installResetHint` (Chrome/Brave one-line site-data reset — the only
  fix that revives the suppressed prompt). Written casual-Indonesian.
- **CSS**: `.install-guide` (dashed panel via `--panel-border`/`--bg-raised`/
  `--radius-md`), `[hidden]` guard, `__intro`, `__step` with gold bullets.
- **Harness** (`test/verify5.mjs`): install block 11 → 17 assertions —
  button always renders without an event, guide `hidden` by default,
  no-event click reveals it, `hasInstalled()` false in Node, event-stash
  still works, guide hidden on fresh render, quiet `installApp()` on
  accepted/consumed prompts, `appinstalled` clears the event AND flips
  `hasInstalled()`, installed sessions show the status instead of a button.
  77 → **83**, ALL VERIFIED.
- Verified: `node --check` all edited JS; verify5 ALL VERIFIED (83);
  linkall 35 ok/1 fail (app.js DOM-only); CSS braces balanced; i18n scan
  clean. CACHE_NAME → v55.

### Per-task weekly schedule + deactivation + Home quick wins + Report weekly breakdown + all-history CSV (SW v56)
Full feature pass; backup bumped v3 → v4, DB schema unchanged (v3).
- **`repeatDays` on tasks** (`core/repeatDays.js` new, `db/tasksRepo.js`):
  optional array of ints 0=Sun..6=Sat on a task; missing/empty = every day
  (the historical default). UI: 7-chip picker (all-selected ↔ every day;
  none-selected also normalizes to every day). Stored as a normalized
  unique-sorted array only when non-empty.
- **`deactivatedAt` on tasks** (`tasksRepo.js`): ISO string stamped
  automatically in `updateTask` when `isActive` flips false (skipped when
  the caller already provides one); cleared to `null` on reactivation.
  Legacy rows without it keep the old "always visible" behavior.
- **Weekday + deactivation filtering wired through**: `dailyTracker`
  (filters `allTasks` for the Home tab), `notifications` (skips reminders
  for non-applying weekdays), `history.getDayRecord` (exclude non-applying
  weekday + days after `deactivatedAt`; deactivation day itself still
  included), `monthlyReport.daysTaskExistedInRange` (now exported for
  tests; counts only repeat weekdays within created..deactivation range).
- **Home quick wins** (`screenHome.js`): always-visible yesterday recap
  pill (3 i18n variants: done+exp, done-zero, no-tasks-yesterday) +
  current-streak chip (`calculateCurrentStreak`) when streak > 0.
  Afternoon greeting icon corrected.
- **Weekly breakdown + best day on Report** (`core/weeklySummary.js` new,
  `screenReport.js`): `getWeeklySummary(completions, year, month)` returns
  Monday-start week buckets `{start, end, done, exp}` + best day
  `{day, rate, done, days}`. UI: tally-row bars with best-day line.
- **All-history CSV** (`backup/csvExport.js`): `buildAllCSV` +
  `exportAllCSV` (sorted by date asc, no UTF-8 BOM, filename
  `daily-tracker-all-history-<date>.csv`); a new "Export All (CSV)" button
  on Report beside the per-month export.
- **Backup v4** (`backup/backupManager.js`): `BACKUP_VERSION` 3 → 4;
  imports `normalizeRepeatDays`; cleanTask sanitizes `repeatDays` (only
  when non-empty) and valid `deactivatedAt` string; v3 backups still load.
- **Per-task detail** (`screenTaskDetail.js`): repeat line rendered when
  `hasRepeatDays`.
- **Manage Tasks** (`screenTasks.js`): repeat label `<span>` on every row;
  dupBtn carries repeatDays through the clone.
- **i18n** (`core/i18n.js`): `home.yesterdaySummary/yesterdayZero/
  yesterdayNoTasks/currentStreak`, `tasks.labelRepeat/everyDay`,
  `report.exportAllCsv/csvAllDownloaded/weeklyBreakdown/bestDay` (EN + ID).
- **CSS** (`components.css`): `.repeat-picker*`, `.task-manage-row__repeat`,
  `.week-summary__best`, `.home-yesterday*`, `.streak-chip*`.
- **New modules** (`core/repeatDays.js`, `core/weeklySummary.js`): added
  to SW `APP_SHELL`, `test/linkall.mjs`. linkall → 37 ok / 1 fail
  (app.js DOM-only).
- **Harness** (`test/verify5.mjs`): +29 assertions — repeatDays unit
  tests, tasksRepo repeatDays/deactivatedAt, the June-10 weekday +
  deactivation clamp, five `daysTaskExistedInRange` August 2026
  denominators, weeklySummary buckets/bestDay, `buildAllCSV`, Tasks
  repeat-picker, Report Export All + `week-summary`, Home yesterday pill +
  streak chip. 83 → **112**, ALL VERIFIED.
- Verified: `node --check` all edited JS; verify5 ALL VERIFIED (112);
  linkall 37 ok/1 fail (app.js DOM-only); CSS brace balance; i18n scan.
  CACHE_NAME → v56.

### UI polish pass (SW v57)
User-reported fixes after the v56 release; no DB/schema/backup change
(still DB v3, backup v4).
- **Repeat picker single row** (`css/components.css`): `.repeat-picker`
  `flex-wrap: wrap → nowrap` (gap 6→4px) and `.repeat-picker__day`
  `flex: 0 0 auto; min-width: 44px → flex: 1 1 0; min-width: 0; padding:
  5px 6px` — the seven chips now share the row equally on any width
  instead of wrapping to a second line on small phones.
- **3-letter EN day names** (`core/i18n.js`): `dayShortNames.en`
  `["Su","Mo",...] → ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]`, matching
  the ID set's 3-letter width so picker chips and the History calendar
  header look uniform in both languages.
- **Report print-button spacing** (`ui/screenReport.js` +
  `css/components.css`): the PDF button is wrapped in a centered
  `.report-actions` row (`margin: 16px 0 20px`) so it's no longer flush
  against the Weekly Breakdown section.
- **Weekly breakdown excluded from PDF** (`css/main.css` print block):
  `#report-print-area .week-summary { display: none !important }` restores
  the pre-v56 PDF shape (breakdown stays on-screen only).
- **Month dropdown arrow centered** (`css/components.css`):
  `.report-controls input[type="month"]` gets `height: 38px; display:
  inline-flex; align-items: center` + `::-webkit-calendar-picker-indicator
  { margin-left: auto }` so the calendar indicator sits vertically
  centered in Chromium.
- **Streak chip hardened** (`ui/screenHome.js`): `buildStreakChip` now
  returns `null` unless the streak is a finite number ≥ 1 and interpolates
  `Math.round(n)` — no "null"/"NaN"/"undefined" text can ever render in
  the Level→Daily-Target gap (live code was already null-safe; this is a
  belt-and-suspenders guarantee plus the cache bump flushes stale mixed
  modules on the user's device).
- **CSV unchanged**: `.csv` can't embed text alignment (the viewer
  decides); the export was already canonical (4 columns, escaped fields,
  zero-padded HH:MM, BOM, sorted). Documented to the user; no code change.
- **Harness** (`test/verify5.mjs`): +1 assertion — EN `dayShortName`
  returns Sun/Mon/Thu. 112 → **113**, ALL VERIFIED. linkall still
  "37 ok / 1 fail" (app.js DOM-only).
- Verified: `node --check` all edited JS; verify5 ALL VERIFIED (113);
  linkall 37 ok/1 fail; CSS braces balanced; README "What's new (cache
  v57)" added. CACHE_NAME → v57.

### Home streak chip removed (SW v58)
User request after the v57 polish pass: "the null between Level and Daily
Target" persisted, and on explanation that it's the v56 current-streak
chip, the user asked to remove it entirely ("ilangin aja, kan sebelumnya
juga ga ada"). No DB/schema/backup change (still DB v3, backup v4).
- **`ui/screenHome.js`**: deleted `buildStreakChip`, its `renderHome` call
  and `streak` variable, the `allCompletions` fetch (it fed only the chip),
  and now-unused imports `calculateCurrentStreak` (streak.js) +
  `completionsRepo`. Home's order is now greeting → yesterday pill → level
  panel → daily-target card.
- **CSS**: `.streak-chip` / `.streak-chip__text` blocks deleted from
  `components.css`.
- **i18n**: `home.currentStreak` removed (EN + ID); `detail.currentStreak`
  (Task Detail, a separate feature) untouched.
- **Harness** (`test/verify5.mjs`): the "current-streak chip shown" assert
  deleted → 113 → **112**. All other modules still import `streak.js`
  (`taskStats.js`), so it stays in APP_SHELL.
- Verified: `node --check` all edited JS; verify5 ALL VERIFIED (112);
  linkall 37 ok/1 fail (app.js DOM-only); CSS braces balanced; no
  remaining `streak-chip`/`home.currentStreak` refs in `js/`/`css/`;
  README "What's new (cache v58)" added. CACHE_NAME → v58.

### Lighthouse speed + security pass (SW v59)
User request: make Lighthouse scores optimal — Best Practices showed a red
exclamation and Performance measured 51–62 depending on the run. Diagnosis
from a headless Lighthouse 13 run: FCP 2.6s, LCP 3.3s (element render
delay ~4.9s — the LCP element painted almost 5s after the HTML arrived),
Speed Index 8.2s, TBT ~3s. Root causes: (1) the ESM import chain loads
serially under throttling (network tree showed `/` → `app.js` → `screenHome` →
`achievements` → `streak` one file at a time — 37 module requests);
(2) no CSP at all → the `csp-xss` audit is the red Best Practices flag
(adding a working CSP satisfies it). Fixes (HTML/config/docs only; no
DB/schema/backup change, no JS logic change, still DB v3 / backup v4):
- **Module preload** (`index.html`): a `<link rel="modulepreload">` for
  every module under `js/` (38 files incl. `app.js`) in the head, so the
  browser fetches the whole graph in parallel instead of walking the import
  waterfall. List kept in step with `js/` and the SW APP_SHELL. Pure
  front-loading; no behavior change, zero dependencies.
- **Critical splash CSS inlined** (`index.html` `<style>` block before the
  stylesheets): the splash screen + base `html,body` background now render
  from inline CSS (hardcoded Stat Sheet palette, overridden by the real
  stylesheets once they load) so first paint no longer waits on
  `main.css`.
- **Lazy screen loading** (`js/app.js`): the six screens + task detail are
  no longer static imports — `router()` does a dynamic `await import()`
  per route, deriving the `renderX` export name from the file name
  (`screenHome.js` → `renderHome`). Boot executes only the current screen's
  module graph; everything else is still fetched upfront via modulepreload.
  Dynamic `import()` is allowed by the CSP (`script-src 'self'`).
- **Content-Security-Policy** (`index.html` `<meta>` + `vercel.json`
  header): strict policy — `default-src 'self'`; `script-src 'self'`
  (no eval/inline handlers exist in the codebase — audited);
  `style-src 'self' 'unsafe-inline'` (required: the app sets
  `element.style.*` and `--gold` custom properties at runtime);
  `connect-src 'self'`; `worker-src 'self'`; `manifest-src 'self'`;
  `img-src 'self' data:`; `font-src 'self' data:`; `object-src 'none'`;
  `base-uri 'none'`; `form-action 'none'`. The Vercel header additionally
  carries `frame-ancestors 'none'` (not expressible in a meta tag); the
  two combine (same policy, header strictly stronger).
- **CACHE_NAME → v59** (shell changed); README "What's new (cache v59)"
  + version line; AGENTS history entry; reference in this doc bumped.
- Harness untouched (112 assertions still green; the changes are
  HTML/header/docs only). Verified: verify5 ALL VERIFIED (112); linkall
  37 ok/1 fail (app.js DOM-only); manifest parses as JSON; Lighthouse
  re-run after deploy to confirm LCP/FCP/TBT + Best Practices gains.