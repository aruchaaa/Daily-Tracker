# Daily Tracker

A personal, offline-first daily task tracker with an EXP/level system.
Single user, no login, no backend, no cloud — everything lives in your
browser's IndexedDB on this device.

## Running it

Service workers and ES modules both require the page to be served over
**http(s)**, not opened directly as a `file://` path. Pick one:

```bash
# Python (already on most systems)
cd daily-tracker
python3 -m http.server 8080
# then open http://localhost:8080

# or Node
npx serve daily-tracker

# or VS Code: right-click index.html -> "Open with Live Server"
```

Open it in Chrome/Edge on Android and use the browser menu's
**"Add to Home Screen"** / **"Install app"** to install it as a PWA. After
the first successful load, it keeps working with no internet connection —
try it in airplane mode. For a real HTTPS link you can share (needed for
full offline/install support on another device), drag the project folder
onto app.netlify.com/drop — no account required.

## Folder structure

```
daily-tracker/
├── index.html            single-page app shell + bottom nav
├── manifest.json          PWA install metadata
├── service-worker.js       offline caching (network-first, cache fallback)
├── css/                   main.css = tokens/themes/layout, components.css = UI parts
├── js/
│   ├── app.js              hash router (#/home, #/tasks, #/profile, #/history, #/report, #/settings)
│   ├── utils.js             date formatting, id generation
│   ├── db/                 IndexedDB access — the only place raw IDB calls happen
│   ├── core/                business logic: EXP/level math, daily state, streaks,
│   │                        reports, achievements, sounds, profile stats,
│   │                        EXP/sleep trends, themes
│   ├── ui/                  one file per screen, plus shared DOM-builder/
│   │                        level-panel/stat-card/trend-chart helpers and
│   │                        the PWA install prompt
│   └── backup/               JSON export/import + monthly CSV export
└── icons/                  192x192 and 512x512 app icons
```

## How your data is stored

Four IndexedDB stores, database name `DailyTrackerDB`:

- **tasks** — your task definitions (name, EXP value, active/inactive,
  optional `startTime`/`endTime` schedule).
- **completions** — one record per (date, task) pair, created when you
  check a task off. Each record snapshots the task's name and EXP value
  *at the time you completed it*, so editing a task's EXP later never
  rewrites what you already earned in the past.
- **meta** — flat key-value rows: lifetime EXP total, character name,
  active theme, custom accent color override, daily EXP target, reminder
  & sound-effect toggles, unlocked achievement list (with unlock dates),
  last backup timestamp, and one freeform note per month (keyed
  `momentNote:YYYY-MM`). Level is always calculated from the EXP total,
  never stored separately, so it can't drift out of sync.
- **sleepLogs** — one optional hours-slept entry per date. Doesn't affect
  EXP at all; purely its own thing.

**Back up regularly** — this is the only copy of your data. Settings →
Export Backup downloads a JSON file containing *everything* (tasks, completions,
sleep logs, and all settings: name, theme, accent, monthly moments); Import
Backup restores from one (and fully replaces what's currently stored, so
double-check before confirming). Backup format is versioned; older v1 files
still import (they just restore with the extras empty).

## A couple of implementation notes

- **Leveling is progressive**: level N → N+1 costs `100 + (N-1)×20` EXP
  (100, 120, 140, 160, ...), not a flat 100 every time. Level is purely
  derived from lifetime EXP, never stored — so this needed no data
  migration, but it does mean a save's displayed level may have dropped
  when this changed, even though its EXP total didn't. Reshape the curve
  via the two constants at the top of `js/core/expEngine.js`.
- **Task schedules** (`startTime`/`endTime`) are optional; scheduled
  tasks sort chronologically on Home, unscheduled ones keep their
  creation order after them. Overlapping time ranges between two active
  tasks are rejected at creation/edit time (`core/schedule.js`'s
  `findTimeConflict`) — half-open interval logic, so back-to-back tasks
  (one ending exactly when the next starts) are allowed, genuine overlaps
  aren't. A task with only a start time is treated as a zero-width point
  for this check, so it still correctly conflicts with a range that
  contains that instant — including a range that starts at the exact same
  time, and two tasks both starting at the same time conflict with each
  other. **Reminders** (Settings) fire browser notifications at
  each scheduled task's start time — or its own per-task reminder time if
  set — while the app is open; background/periodic sync isn't possible in
  a browser-only app.
- **Sleep tracking** is a simple per-day hours log (Home screen, "Sleep
  Last Night"). Its trend chart on Profile reuses the same generic
  `buildTrendChart()` as the EXP trend, just with different colors.
- **Trend charts** show 7 days (not 14) specifically so each bar has room
  for a visible value label above it — a hover-only tooltip doesn't help
  on a touch device, which is most of this app's real usage.
- **Memorable Moment** is one freeform note per calendar month, tied to
  whichever month is selected in the Report screen's picker.
- **Task Breakdown** (Report screen) shows how many times each task was
  completed that month, sorted most-to-least, as a simple bar list.
  Deliberately *not* a full daily grid — the app doesn't track a per-day
  history of which tasks were active/inactive, so a grid would show
  tasks as "missed" on days before they even existed. A pure completion
  tally sidesteps that problem entirely, since it only counts things
  that are unambiguously true.
- **Task Completion meter**: a visual progress bar on the Report screen
  (and in the exported PDF) showing the month's completion percentage,
  above the stat grid — a companion to the plain "Completion" stat card.
- **Per-task detail view**: tapping a task's name in Manage Tasks opens
  `#/task/<id>` — current streak, longest streak, total times cleared,
  and a 12-week GitHub-style completion heatmap (`core/taskStats.js` +
  `ui/screenTaskDetail.js`). Current streak counts backward from today
  if today's already done, or from yesterday if not — so it doesn't
  read "0" the moment you open the app before doing today's task.
  The same screen also hosts per-day **notes** — each day gets its own
  note, shown in History for that day and previewed on the Manage Tasks
  row for today — plus a **per-task reminder time** that overrides the
  task's schedule for notifications.
- **Achievements**: twenty badges in two tiers (`core/achievements.js`) —
  ten everyday goals (first task, 100 tasks, 7/30-day streaks, early
  bird, night owl, levels 5/10, 1,000 EXP, daily target) and ten
  long-haul goals that take months of consistent use (500 tasks, 5K/10K
  EXP, 100/365-day streaks, 7/30-day target streaks, level 15/20, and a
  "full circle" day spanning before 9 AM and after 10 PM). Evaluated
  after every completion and shown in a gallery on Profile with unlock
  dates. Unlock state lives in a single meta row, so backups carry it
  for free.
- **Quick add on Home**: a "+" toggle in the section header opens an
  inline form (name + EXP + optional start time). It runs the same
  time-conflict check as the Tasks form and validates input.
  *(removed — all tasks are added in Manage Tasks so the Tasks tab stays
  the single place for task management)*
- **Undo on delete** (Manage Tasks only): deleting a task shows an Undo
  toast that re-puts the task with its original id and list position,
  reconnecting it to its history. Home toggles are single-step by design —
  the Undo button is reserved for the one action where accidental clicks
  are costly.
- **Drag to reorder** (Manage Tasks): unscheduled tasks get a grab handle
  (≡) — rows swap live while dragging and the final order is persisted
  once on release via `setTaskOrder()`. Scheduled tasks have no handle
  because Home orders them by time.
  *(removed — the list keeps creation order; tasks are ordered by schedule
  on Home instead)*
- **Sound effects** (`core/sounds.js`): short synthesized tick on
  completion (with a haptic vibration on mobile), fanfare on level-up and
  achievement unlock. Web Audio API only — no audio files, works offline.
  Toggle in Settings.
- **Year at a Glance** (Report screen): a 12-tile grid showing each
  month's completion percentage and grade; tapping a tile jumps the
  monthly report to that month.
- **CSV export** (Report screen): downloads the selected month's raw
  completions (`Date, Task Name, EXP Earned, Time`) as an Excel-friendly
  CSV with a UTF-8 BOM (`backup/csvExport.js`). `Time` is the completion's
  local wall-clock time (HH:MM) — the date is already its own column.
- **Shareable character card** (Profile): renders the character name,
  level ring, EXP, month grade, and the full achievement roster (gold for
  unlocked, dimmed for locked) onto a gradient canvas and downloads it as
  a PNG — shareable without a screenshot. Renaming the character
  re-renders the card so the exported PNG always shows the current name.
- **Install App** (Settings): surfaces the browser's
  `beforeinstallprompt` event as a button so the PWA can be installed
  from inside the app (`ui/installPrompt.js`).
- **Custom accent color** (Settings → Appearance): a color picker that
  overrides just `--gold` on top of whichever theme is active, applied
  as an inline style on `<html>` so it wins the cascade over any theme
  block without needing to touch one. A matching dim shade is derived
  automatically. Persists independently of theme choice; deliberately
  does *not* affect the print stylesheet.
- **Themes**: three selectable visual themes (Settings → Appearance) —
  Robo Star (default), Adventurer's Log, and Neon Circuit. Every color in
  `components.css` is a CSS variable, and every theme (including the
  default) has its own explicit `[data-theme="id"]` token block in
  `main.css` — component CSS never needs to change, and a nested element
  can locally preview any theme's colors regardless of which theme is
  active on the page (that's how the theme-picker swatches work). Badge
  shape is also a variable (`--badge-clip`, `--badge-radius`); the badge
  itself is two nested clipped layers rather than a `border`, since a
  plain CSS border doesn't properly trace an angled polygon's edges.
- **PDF export** uses the browser's native print dialog (`window.print()`)
  with its own dedicated, non-theme-reactive print stylesheet — exported
  reports always look the same regardless of which on-screen theme is
  active.
- **"Grade" is a monthly metric**, so the Profile screen shows *this
  month's* grade rather than a separate lifetime grading scheme.
- **Monthly report "active task occurrences"** is calculated per-task: a
  currently-active task contributes one expected slot for each day it has
  actually existed within the reporting range (based on its `createdAt`,
  clamped to the range) — not one slot for every day in the range
  regardless of when it was created. A task added on day 15 of a
  19-days-in month contributes 5 slots, not 19, so adding a new task
  mid-month no longer drags the percentage down for days before it
  existed. Residual limitation: a task toggled inactive and back on more
  than once within the month isn't tracked precisely (only creation date
  is) — full accuracy there would need a proper activation history log,
  a bigger change than that specific, rarer case justifies.
- Everything is vanilla HTML/CSS/JS with native browser APIs (IndexedDB,
  Service Worker, `crypto.randomUUID`, `color-mix()`) — no build step, no
  framework, no external dependency of any kind.

## Updating an already-installed copy

The service worker fetches fresh files over the network first and only
falls back to its cache when offline. Current cache name:
`daily-tracker-v35`. The app also auto-reloads itself once when a newer
service worker takes over, so most future updates should apply on their
own — but that only works once this version's code has loaded at least
once. If you ever see a blank content area under a working nav bar,
that's a leftover service worker from before; clear it once:

- **Fastest check:** open the app in a new Private/Incognito window. If it
  works there, it's confirmed to be old cached data, not a code problem.
- **Proper fix:** DevTools (F12) → Application tab → Service Workers →
  Unregister, then Application → Storage → "Clear site data" → reload.
- Or simplest of all: close every open tab of the app, then reopen it.

This update also bumps the local database schema (v1 → v2, adding
`sleepLogs`). That upgrade is additive-only and was specifically tested
against a pre-existing v1 database to confirm no existing tasks,
completions, or EXP get touched — see the project's test history if
you're curious, but in short: your data is safe across this update.
