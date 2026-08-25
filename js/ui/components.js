/**
 * Tiny element builder so screens don't hand-write createElement/appendChild
 * chains. `el('button', { class: 'btn', onclick: fn, text: 'Save' }, [child])`
 * Every screen re-renders itself fully from fresh DB reads rather than
 * patching the DOM in place — simple and correct at this data volume.
 */
import { getTodayDateString } from "../utils.js";
import * as sounds from "../core/sounds.js";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function parseDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** "2026-08-20" -> "Aug 20, 2026" (year only when the range spans years). */
function formatShortDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${MONTH_SHORT[m - 1]} ${d}, ${y}`;
}
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);

  Object.entries(attrs).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (key === "class") {
      node.className = value;
    } else if (key === "text") {
      node.textContent = value;
    } else if (key.startsWith("on") && typeof value === "function") {
      if (key === "onclick") {
        // Generic click sound for every button. A handler that plays its own
        // effect (save, delete, error, …) is detected via sounds' monotonic
        // sequence and skips the generic blip — awaited handlers are checked
        // after they settle so async sounds aren't doubled.
        const before = sounds.lastPlayedSeq();
        const wrapped = (e) => {
          const result = value(e);
          const playGeneric = () => {
            if (sounds.lastPlayedSeq() === before) sounds.playClick();
          };
          if (result && typeof result.then === "function") result.then(playGeneric);
          else playGeneric();
        };
        node.addEventListener("click", wrapped);
      } else {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      }
    } else if (key === "checked" || key === "disabled" || key === "required") {
      // DOM properties, not attributes — authoritative for live element state.
      node[key] = Boolean(value);
    } else if (value !== false) {
      node.setAttribute(key, value);
    }
  });

  const kids = Array.isArray(children) ? children : [children];
  kids.forEach((child) => {
    if (child === null || child === undefined) return;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  });

  return node;
}

/**
 * Level badge + segmented EXP bar. Shared by Home and Profile so both stay
 * visually identical with one implementation. The badge used to sit inside
 * a circular progress ring, but the segmented EXP bar right next to it
 * already shows progress, so the ring was removed. Pass { clickable: true }
 * to make the badge a link to the Profile screen (used on Home, where tapping
 * your own badge is a natural "view character" shortcut). Pass
 * { levelUp: true } to play a one-shot flash animation on the badge.
 */
export function buildLevelPanel(progress, { clickable = false, levelUp = false } = {}) {
  const fill = el("div", { class: "exp-bar__fill" });
  fill.style.width = `${progress.percent}%`;

  const badgeInner = el("div", { class: "level-badge__inner" }, [
    el("span", { class: "level-badge__tag", text: "LVL" }),
    el("span", { class: "level-badge__num", text: String(progress.level) }),
  ]);

  const badge = el("div", { class: `level-badge${levelUp ? " level-badge--level-up" : ""}` }, [badgeInner]);

  const badgeEl = clickable
    ? el("a", { href: "#/profile", class: "level-badge-link", title: "View character profile" }, [badge])
    : badge;

  return el("div", { class: "level-panel" }, [
    badgeEl,
    el("div", { class: "level-panel__bar-area" }, [
      el("div", {
        class: "level-panel__exp-text",
        text: `${progress.currentLevelExp} / ${progress.expPerLevel} EXP`,
      }),
      el("div", { class: "exp-bar" }, [fill]),
    ]),
  ]);
}

/**
 * Circular progress ring drawn with SVG stroke-dasharray. Used by the daily
 * target card on Home (className "percent-ring").
 */
export function buildProgressRing(percent, { size = 88, stroke = 5, className = "level-ring" } = {}) {
  const r = (size - stroke) / 2 - 1;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));
  const ns = "http://www.w3.org/2000/svg";

  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("class", className);

  const track = document.createElementNS(ns, "circle");
  track.setAttribute("cx", size / 2);
  track.setAttribute("cy", size / 2);
  track.setAttribute("r", r);
  track.setAttribute("fill", "none");
  track.setAttribute("class", `${className}__track`);

  const progress = document.createElementNS(ns, "circle");
  progress.setAttribute("cx", size / 2);
  progress.setAttribute("cy", size / 2);
  progress.setAttribute("r", r);
  progress.setAttribute("fill", "none");
  progress.setAttribute("class", `${className}__progress`);
  progress.style.strokeDasharray = c.toFixed(1);
  progress.style.strokeDashoffset = (c * (1 - clamped / 100)).toFixed(1);

  svg.append(track, progress);
  return svg;
}

/**
 * Themed empty-state with a small inline SVG icon and an action hint,
 * replacing the bare text-only paragraph. Icons are static strings, so the
 * innerHTML here is safe.
 */
const EMPTY_ICONS = {
  plus: '<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
  chart: '<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round"><path d="M4 20h16M7 20v-6M12 20v-10M17 20V8"/></svg>',
  clock: '<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
};

export function buildEmptyState(icon, title, hint = "") {
  const iconWrap = el("div", { class: "empty-state__icon" });
  iconWrap.innerHTML = EMPTY_ICONS[icon] || EMPTY_ICONS.check;
  return el("div", { class: "empty-state empty-state--icon" }, [
    iconWrap,
    el("p", { class: "empty-state__title", text: title }),
    hint ? el("p", { class: "empty-state__hint", text: hint }) : null,
  ]);
}

/** One stat card for the report/profile grids. extraClass is used for
 *  grade color-coding (see gradeClass below). */
export function statCard(label, value, extraClass = "") {
  return el("div", { class: "report-stat" }, [
    el("div", { class: `report-stat__value ${extraClass}`.trim(), text: String(value) }),
    el("div", { class: "report-stat__label", text: label }),
  ]);
}

const GRADE_CLASSES = { "A+": "grade-aplus", A: "grade-a", B: "grade-b", C: "grade-c", D: "grade-d" };

/** Maps a letter grade to its CSS color class, shared by Report and Profile. */
export function gradeClass(grade) {
  return GRADE_CLASSES[grade] || "";
}

/**
 * Hand-rolled SVG bar chart — no charting library. dataPoints:
 * [{date, value, label}, ...], oldest first, today last. Today's bar gets
 * `todayBarClass` so it's easy to spot at a glance. Shared by the EXP and
 * sleep trend charts on Profile — only the CSS classes/caption differ.
 * Each bar gets a visible value label above it (not just a hover title —
 * hover doesn't exist on touch devices, which is most of this app's use).
 */
export function buildTrendChart(dataPoints, { barClass = "exp-trend-bar", todayBarClass = "exp-trend-bar--today", caption = "" } = {}) {
  const width = 320;
  const height = 80;
  const labelSpace = 15;
  const barAreaHeight = height - labelSpace;
  const gap = 6;
  const n = dataPoints.length;
  const barWidth = (width - gap * (n - 1)) / n;
  const maxVal = Math.max(1, ...dataPoints.map((d) => d.value));
  const todayIndex = n - 1;

  const parts = dataPoints
    .map((d, i) => {
      const barHeight = d.value > 0 ? Math.max((d.value / maxVal) * (barAreaHeight - 4), 3) : 1;
      const x = i * (barWidth + gap);
      const barTop = labelSpace + (barAreaHeight - barHeight);
      const labelY = Math.max(barTop - 4, 10);
      const cx = (x + barWidth / 2).toFixed(1);
      const cls = i === todayIndex ? `${barClass} ${todayBarClass}` : barClass;
      const displayVal = Number.isInteger(d.value) ? d.value : Number(d.value.toFixed(1));
      return (
        `<text x="${cx}" y="${labelY}" class="trend-bar-label" text-anchor="middle">${displayVal}</text>` +
        `<rect x="${x.toFixed(1)}" y="${barTop.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="1.5" class="${cls}"><title>${d.date}: ${d.label}</title></rect>`
      );
    })
    .join("");

  const wrap = el("div", { class: "exp-trend-wrap" });
  const svgHost = document.createElement("div");
  svgHost.innerHTML = `<svg viewBox="0 0 ${width} ${height}" class="exp-trend-chart" preserveAspectRatio="none">${parts}</svg>`;
  wrap.appendChild(svgHost.firstChild);
  wrap.appendChild(el("div", { class: "exp-trend-caption", text: caption }));
  return wrap;
}

/** "19:00–20:00" / "19:00" / "" — for tasks with an optional schedule. */
export function formatTimeRange(task) {
  if (!task.startTime) return "";
  return task.endTime ? `${task.startTime}\u2013${task.endTime}` : task.startTime;
}

/**
 * GitHub-style completion heatmap for one task, aligned to real calendar
 * weeks (Sun-first columns). cells: [{date, done}, ...] in chronological
 * order, length = weeksCount*7 + 0..6 (window may not start on a Sunday).
 * Renders full Sun–Sat day labels, full month names on the weeks where the
 * month changes (labeled columns are always >= 4 apart, so long labels
 * never collide), a gold outline on today's cell, and a caption with the
 * exact visible date range. Geometry is tuned so 24 weeks (~447px) fills
 * the 480px app container edge to edge on phones/tablets.
 */
export function buildHeatmap(cells, weeksCount, { startDate, endDate } = {}) {
  const cellSize = 13;
  const gap = 3;
  const labelWidth = 50;
  const labelHeight = 22;

  const weekCount = Math.ceil(cells.length / 7);
  const width = labelWidth + weekCount * (cellSize + gap) - gap;
  const height = labelHeight + 7 * (cellSize + gap) - gap;
  const today = getTodayDateString();

  // Month label on each week column whose first day starts a new month
  // (the first column is always labeled). Month changes are >= 4 weeks
  // apart (28 days), so full month names never overlap.
  const monthLabels = [];
  let lastMonth = null;
  for (let w = 0; w < weekCount; w++) {
    const cellDate = parseDate(cells[w * 7].date);
    const m = MONTH_FULL[cellDate.getMonth()];
    monthLabels.push(m !== lastMonth ? m : "");
    lastMonth = m;
  }

  const parts = [];
  monthLabels.forEach((label, w) => {
    if (!label) return;
    const x = labelWidth + w * (cellSize + gap) + cellSize / 2;
    parts.push(`<text x="${x}" y="10" class="heatmap-month-label" text-anchor="middle">${label}</text>`);
  });

  DAY_FULL.forEach((label, row) => {
    const y = labelHeight + row * (cellSize + gap) + cellSize / 2 + 3;
    parts.push(`<text x="${labelWidth - 4}" y="${y}" class="heatmap-day-label" text-anchor="end">${label}</text>`);
  });

  cells.forEach((cell, i) => {
    const col = Math.floor(i / 7);
    const row = i % 7;
    const x = labelWidth + col * (cellSize + gap);
    const y = labelHeight + row * (cellSize + gap);
    const cls = ["heatmap-cell"];
    if (cell.done) cls.push("heatmap-cell--done");
    if (cell.date === today) cls.push("heatmap-cell--today");
    parts.push(
      `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2.5" class="${cls.join(" ")}"><title>${cell.date}: ${cell.done ? "done" : "not done"}</title></rect>`
    );
  });

  let caption = "";
  if (startDate && endDate) {
    const startY = startDate.slice(0, 4);
    const endY = endDate.slice(0, 4);
    caption = startY === endY
      ? `${formatShortDate(startDate).replace(`, ${endY}`, "")} \u2013 ${formatShortDate(endDate)}`
      : `${formatShortDate(startDate)} \u2013 ${formatShortDate(endDate)}`;
  }

  const wrap = el("div", { class: "heatmap-wrap" });
  const svgHost = document.createElement("div");
  svgHost.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" class="heatmap-svg">${parts.join("")}</svg>`;
  wrap.appendChild(svgHost.firstChild);
  if (caption) wrap.appendChild(el("div", { class: "heatmap-caption", text: caption }));
  return wrap;
}
