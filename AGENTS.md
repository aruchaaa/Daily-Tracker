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

There is **no package.json / test framework in the repo**. The test
harness lives outside the repo at
`C:\Users\Admin\AppData\Local\Temp\opencode\idbtest` (it runs the app's
modules against `fake-indexeddb` in Node):

```powershell
cd C:\Users\Admin\AppData\Local\Temp\opencode\idbtest
node verify5.mjs          # full regression suite — expect "ALL VERIFIED"
node linkall.mjs          # module-import check — expect "27 ok" + app.js
                          # (app.js needs a DOM, so its failure is expected)
```

Ad-hoc checks used after edits:

- `node --check <file>.js` on every edited JS file.
- Brace balance on the CSS files (e.g. count `{` vs `}` in
  `css/main.css` and `css/components.css`).
- `Invoke-WebRequest http://localhost:8080/` → expect HTTP 200.
- After any change that touches the precache shell or JS/CSS, bump
  `CACHE_NAME` in `service-worker.js` **and** the matching `daily-tracker-vN`
  reference in `README.md` (currently `v33`).

## Architecture

```
daily-tracker/
├── index.html            single-page shell + bottom nav (one module entry: js/app.js)
├── manifest.json         PWA metadata (name, icons, #161227 colors, standalone)
├── service-worker.js     network-first, cache-fallback; precache list + self-update
├── css/
│   ├── main.css          tokens, themes, layout, print
│   └── components.css    UI parts (BEM-ish, all colors via CSS variables)
├── icons/                icon-192.png, icon-512.png, icon-512-maskable.png
└── js/
    ├── app.js            hash router, nav highlight, error boundary, theme boot,
    │                     SW registration + one-shot reload, install wiring
    ├── utils.js          local-date YYYY-MM-DD, display dates, generateId, month names
    ├── db/               THE ONLY place raw IndexedDB calls happen
    │   ├── db.js         lazy single connection (DailyTrackerDB v2), promisify wrappers,
    │   │                 onversionchange close + cache reset
    │   ├── tasksRepo.js  task CRUD, sortOrder, setTaskOrder, restoreTask (undo)
    │   │                 moveTask removed (dead code); setTaskOrder kept for harness
    │   ├── completionsRepo.js  records keyed "<date>_<taskId>"; toggleCompletion is the
    │   │                 single EXP chokepoint (multi-store tx, snapshot, serialized)
    │   ├── metaRepo.js   flat key-value store (EXP total, name, theme, toggles,
    │   │                 achievements, moments, lastBackupAt, dailyTargetExp,
    │   │                 onboardingDone)
    │   └── sleepRepo.js  per-day sleep hours (upsert + range)
    ├── core/             business logic, NO DOM (15 modules)
    │   ├── expEngine.js      progressive curve: level N→N+1 = 100 + (N-1)*20
    │   ├── dailyTracker.js   today's state (join tasks+completions, sort, totals)
    │   ├── history.js        read-only day record (self-contained snapshots)
    │   ├── streak.js         longest + current streak (UTC-midnight diffing)
    │   ├── monthlyReport.js  % (per-task existence-weighted), grade, tally
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
    ├── ui/               one file per screen + shared helpers
    │   ├── components.js el() builder (+generic click-sound fallback via
    │   │                 lastPlayedSeq), level panel (clickable/levelUp options),
    │   │                 progress ring, stat card, trend chart, heatmap,
    │   │                 formatTimeRange
    │   ├── screenHome.js       checklist, daily target, sleep, backup banner,
    │   │                       level-up flash on badge
    │   ├── screenTasks.js      add/edit/delete (Undo toast; delete is type-to-confirm),
    │   │                       chips, drag-to-reorder unscheduled tasks
    │   │                       (flexible positioning between scheduled tasks)
    │   ├── screenTaskDetail.js #/task/<id>: streaks, heatmap, notes, reminder
    │   ├── screenProfile.js    rename, trends, stats, achievements, share card canvas
    │   ├── screenHistory.js    month calendar + day detail, PDF via print
    │   ├── screenReport.js     monthly report, year grid, CSV, PDF
    │   ├── screenSettings.js   install, theme/accent, toggles, backup, danger zone
    │   ├── installPrompt.js    beforeinstallprompt stash + installApp + listeners
    │   └── toast.js           showToast (stack ≤4, optional action) +
    │                          showConfirmDialog (optional type-to-confirm)
    └── backup/
        ├── backupManager.js  versioned JSON export/import (replace/merge)/clear
        └── csvExport.js      pure buildMonthCSV + exportMonthCSV (UTF-8 BOM)
```

## Data model (IndexedDB `DailyTrackerDB`, v2)

- **tasks** — keyPath `id`; name, expValue, isActive, optional
  startTime/endTime, sortOrder, createdAt.
- **completions** — keyPath `id` = `"<date>_<taskId>"` (enforces
  one-per-task-per-day); indexes on `date` and `taskId`; snapshots
  `taskName`/`expAwarded`/`completedAt` at completion time so history and
  EXP survive later task edits/deletes.
- **meta** — keyPath `key`; lifetimeExp, characterName, theme,
  customAccent, lastBackupAt, dailyTargetExp, remindersEnabled,
  soundEnabled, achievements (array of `{id, at}`, legacy string arrays
  normalized on read), `momentNote:YYYY-MM`.
- **sleepLogs** — keyPath `date`; hours.

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
  adding a new module, add it there too. `icons/icon-512-maskable.png` is
  deliberately manifest-only (fetched at install time, runtime-cached
  afterwards).
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
  Enter confirms when enabled. Used by Manage Tasks delete, backup
  import-replace, and Settings clear-all-data.
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

### Testing notes
- `verify5.mjs` assertions are deliberately time-zone- and clock-aware:
  avoid asserting exact badge sets when early-bird/night-owl depend on the
  wall clock (assert membership, not exact lists). The suite runs against
  `fake-indexeddb` with an in-memory DB and stubbed `document`/`el`.
- Sound calls don't need stubbing: `sounds.js` `ctx()` returns null when
  there is no AudioContext (as in Node), so every effect no-ops safely.
- Harness provenance: both scripts hardcode an absolute `file:///` base.
  They used to point at a stale copy under
  `Downloads\1\daily-tracker` and were silently testing old code; they
  now point at this repo. If the project folder ever moves again, update
  `base` at the top of both scripts.
- The hard-tier test seeds a 503-day completion range and must survive the
  real date drifting: it now backfills the 40 days ending "today" (adding
  only missing dates) so the daily-target streak check holds on any day the
  suite runs — a seed range that collides with the loop's dates silently
  toggles them off, which is exactly what broke `target-streak` when the
  wall clock moved past 2026-08-20.