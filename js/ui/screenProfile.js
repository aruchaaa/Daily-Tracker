import * as metaRepo from "../db/metaRepo.js";
import { getProfileStats } from "../core/profileStats.js";
import { getRecentDailyExp } from "../core/expTrend.js";
import { getRecentSleep } from "../core/sleepTrend.js";
import { getAchievementState } from "../core/achievements.js";
import { playSave, playError } from "../core/sounds.js";
import { t } from "../core/i18n.js";
import { el, buildLevelPanel, statCard, gradeClass, buildTrendChart } from "./components.js";
import { showToast } from "./toast.js";

/** Measure any Unicode badge glyph's real bounding box (at 100px) and return
 *  a font-size that makes it fill roughly `targetPx`. Glyphs like ⚜ vs ⚔
 *  have very different metrics at the same font-size, so this normalizes
 *  them to a consistent visual size on the share card and the gallery. */
function fitBadgeIconFontSize(icon, targetPx) {
  try {
    const probe = document.createElement("canvas").getContext("2d");
    probe.font = "100px sans-serif";
    const m = probe.measureText(icon);
    const w = m.width || 100;
    const h = (m.actualBoundingBoxAscent || 100) + (m.actualBoundingBoxDescent || 0);
    const box = Math.max(w, h);
    if (box <= 0) return targetPx;
    return Math.max(12, Math.min(targetPx * 2, (100 / box) * targetPx));
  } catch {
    // No canvas/measureText available (e.g. the Node test harness) — the
    // CSS/JS default size is a fine fallback.
    return targetPx;
  }
}

export async function renderProfile(container) {
  container.innerHTML = "";
  const [stats, expTrend, sleepTrend, achievementState] = await Promise.all([
    getProfileStats(),
    getRecentDailyExp(7),
    getRecentSleep(7),
    getAchievementState(),
  ]);
  stats.achievements = achievementState;

  const grid = el("div", { class: "report-grid" }, [
    statCard(t("profile.totalExp"), stats.progress.totalExp),
    statCard(t("profile.tasksCleared"), stats.tasksCleared),
    statCard(t("profile.thisMonthPct"), `${stats.currentMonthCompletionPercent}%`),
    statCard(t("profile.thisMonthGrade"), stats.currentMonthGrade, gradeClass(stats.currentMonthGrade)),
  ]);

  const expBars = expTrend.map((d) => ({ date: d.date, value: d.exp, label: `${d.exp} EXP` }));
  const sleepBars = sleepTrend.map((d) => ({
    date: d.date,
    value: d.hours,
    label: d.hours > 0 ? `${d.hours}h ${t("profile.sleepLog")}` : t("profile.noLog"),
  }));

  container.append(
    el("h2", { class: "section-title", text: t("profile.title") }),
    buildNameCard(stats.characterName, container),
    buildLevelPanel(stats.progress),
    el("h3", { class: "profile-subheading", text: t("profile.expTrend") }),
    buildTrendChart(expBars, { barClass: "exp-trend-bar", todayBarClass: "exp-trend-bar--today", caption: t("profile.expTrendCaption") }),
    el("h3", { class: "profile-subheading", text: t("profile.sleepTrend") }),
    buildTrendChart(sleepBars, { barClass: "sleep-trend-bar", todayBarClass: "sleep-trend-bar--today", caption: t("profile.sleepTrendCaption") }),
    el("h3", { class: "profile-subheading", text: t("profile.lifetimeStats") }),
    grid,
    el("h3", { class: "profile-subheading", text: t("profile.achievements") }),
    buildAchievementsSection(achievementState),
    el("h3", { class: "profile-subheading", text: t("profile.share") }),
    buildShareCardButton(stats)
  );
}

function buildNameCard(currentName, container) {
  const nameInput = el("input", {
    type: "text",
    class: "input",
    placeholder: t("profile.namePlaceholder"),
    value: currentName || "",
    maxlength: "24",
  });

  const saveBtn = el("button", {
    class: "btn btn--primary",
    type: "button",
    text: t("profile.save"),
    onclick: async () => {
      try {
        const name = nameInput.value.trim();
        await metaRepo.setCharacterName(name);
        playSave();
        showToast(name ? t("profile.namedTo", { name }) : t("profile.nameCleared"), "success");
        renderProfile(container);
      } catch (err) {
        playError();
        showToast(t("profile.cardFailed") + ": " + err.message, "error");
      }
    },
  });

  return el("div", { class: "profile-name-card" }, [
    el("div", { class: "profile-name-card__label", text: t("profile.characterName") }),
    el("div", { class: "profile-name-card__row" }, [nameInput, saveBtn]),
  ]);
}

/** Badge gallery: unlocked tiles are gold-bordered and opaque with their
 *  unlock date; locked ones show their requirement as a hint. */
function buildAchievementsSection(state) {
  const unlockedCount = state.filter((a) => a.unlocked).length;

  const grid = el("div", { class: "ach-grid" });
  state.forEach((a) => {
    const hint = a.unlocked
      ? a.at
        ? t("profile.unlockedOn", { date: new Date(a.at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) })
        : t("profile.unlocked")
      : a.desc;
    const icon = el("span", { class: "ach-tile__icon", text: a.icon });
    icon.style.fontSize = `${fitBadgeIconFontSize(a.icon, 26)}px`;
    grid.appendChild(
      el("div", { class: `ach-tile ${a.unlocked ? "ach-tile--unlocked" : ""}`.trim(), title: a.desc }, [
        icon,
        el("span", { class: "ach-tile__title", text: a.title }),
        el("span", { class: "ach-tile__hint", text: hint }),
      ])
    );
  });

  return el("div", { class: "ach-section" }, [
    el("div", { class: "ach-counter", text: t("profile.ofAchievements", { n: unlockedCount, total: state.length }) }),
    grid,
  ]);
}

/** Renders the character card (name, level ring, EXP, month grade, and the
 *  achievement badge roster) onto a canvas and downloads it as a PNG —
 *  shareable without screenshots. */
function buildShareCardButton(stats) {
  return el("button", {
    class: "btn",
    type: "button",
    text: t("profile.downloadCard"),
    onclick: async () => {
      try {
        const canvas = await renderCardCanvas(stats);
        const url = canvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = url;
        a.download = "character-card.png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        playSave();
      } catch (err) {
        playError();
        showToast(t("profile.cardFailed") + ": " + err.message, "error");
      }
    },
  });
}

function renderCardCanvas(stats) {
  const style = getComputedStyle(document.documentElement);
  const css = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  const bg = css("--panel", "#211b36");
  const gold = css("--gold", "#e8b355");
  const ink = css("--ink", "#f1ede3");
  const inkDim = css("--ink-dim", "#9c93b8");
  const track = css("--panel-border-soft", "#2c2547");
  const danger = css("--danger", "#e0667a");
  const soft = css("--panel-soft", "#2a2242");

  const W = 560;
  const H = 760;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const roundRect = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  // Panel with a vertical gradient + soft glow behind the ring.
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, soft);
  grad.addColorStop(1, bg);
  ctx.fillStyle = grad;
  roundRect(0, 0, W, H, 24);
  ctx.fill();
  ctx.strokeStyle = gold;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.strokeStyle = gold;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1;
  roundRect(10, 10, W - 20, H - 20, 18);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Subtle decorative motif: a faint field of diamonds so the card is not
  // too plain. Kept well under the readability threshold.
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = gold;
  ctx.lineWidth = 1;
  const cell = 44;
  const s = 6;
  for (let py = cell / 2; py < H; py += cell) {
    for (let px = cell / 2; px < W; px += cell) {
      ctx.beginPath();
      ctx.moveTo(px, py - s);
      ctx.lineTo(px + s, py);
      ctx.lineTo(px, py + s);
      ctx.lineTo(px - s, py);
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();

  const cx = W / 2;

  // Eyebrow + name header.
  ctx.textAlign = "center";
  ctx.fillStyle = gold;
  ctx.font = "700 11px sans-serif";
  ctx.fillText("DAILY TRACKER", cx, 52);
  ctx.fillStyle = ink;
  ctx.font = "800 36px sans-serif";
  const name = stats.characterName || "Unnamed Character";
  ctx.fillText(name, cx, 96);
  ctx.fillStyle = inkDim;
  ctx.font = "13px sans-serif";
  ctx.fillText(`${stats.progress.totalExp} total EXP`, cx, 120);

  // Divider under the header.
  ctx.strokeStyle = gold;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 130, 136);
  ctx.lineTo(cx + 130, 136);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Glow behind the ring.
  const glow = ctx.createRadialGradient(cx, 240, 10, cx, 240, 150);
  glow.addColorStop(0, gold);
  glow.addColorStop(1, bg);
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;

  // Level ring + progress arc.
  const cy = 240;
  const r = 92;
  ctx.lineWidth = 14;
  ctx.strokeStyle = track;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  const pct = Math.max(0, Math.min(100, stats.progress.percent));
  ctx.strokeStyle = gold;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * pct) / 100);
  ctx.stroke();

  // Level number centered on the ring — drawn with baseline-middle so the
  // "LVL" + number pair sits exactly in the middle of the ring.
  ctx.textBaseline = "middle";
  ctx.fillStyle = gold;
  ctx.font = "600 14px sans-serif";
  ctx.fillText("LVL", cx, cy - 26);
  ctx.font = "800 52px sans-serif";
  ctx.fillText(String(stats.progress.level), cx, cy + 7);
  ctx.textBaseline = "alphabetic";

  const rows = [
    ["Total EXP", String(stats.progress.totalExp)],
    ["Tasks Cleared", String(stats.tasksCleared)],
    ["This Month", `${stats.currentMonthCompletionPercent}% (${stats.currentMonthGrade})`],
  ];
  rows.forEach(([label, value], i) => {
    const y = 400 + i * 46;
    ctx.fillStyle = inkDim;
    ctx.font = "12px sans-serif";
    ctx.fillText(label, cx, y);
    ctx.fillStyle = i === 2 && stats.currentMonthGrade.startsWith("D") ? danger : gold;
    ctx.font = "800 20px sans-serif";
    ctx.fillText(value, cx, y + 26);
  });

  // Achievement badge roster — two rows of ten, gold when unlocked.
  const badges = stats.achievements || [];
  ctx.strokeStyle = gold;
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 120, 570);
  ctx.lineTo(cx + 120, 570);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = gold;
  ctx.font = "700 11px sans-serif";
  ctx.fillText(`ACHIEVEMENTS  ${badges.filter((b) => b.unlocked).length} / ${badges.length}`, cx, 590);
  const inset = 18;
  const cellW = (W - inset * 2) / 10;
  badges.forEach((b, i) => {
    const row = Math.floor(i / 10);
    const col = i % 10;
    const bx = inset + col * cellW + cellW / 2;
    const by = 622 + row * 42;
    ctx.globalAlpha = b.unlocked ? 0.95 : 0.35;
    ctx.fillStyle = b.unlocked ? gold : inkDim;
    ctx.font = `${fitBadgeIconFontSize(b.icon, 26)}px sans-serif`;
    ctx.textBaseline = "middle";
    ctx.fillText(b.icon, bx, by);
    ctx.globalAlpha = 1;
  });
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = inkDim;
  ctx.font = "11px sans-serif";
  ctx.fillText(`Daily Tracker \u00b7 ${new Date().toLocaleDateString()}`, cx, H - 26);

  return canvas;
}
