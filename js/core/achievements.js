import * as completionsRepo from "../db/completionsRepo.js";
import * as metaRepo from "../db/metaRepo.js";
import { getLevel } from "./expEngine.js";
import { calculateLongestStreak } from "./streak.js";
import { getTodayDateString, formatDate } from "../utils.js";

/**
 * Achievement badges: declarative checks over aggregate stats, unlocked
 * after any task toggle (see screenHome). Unlock state lives in one meta
 * row ("achievements" = array of ids), so backups carry it for free and
 * no DB migration is needed.
 *
 * `check` receives the shared stats object and returns a boolean; badges
 * are evaluated in definition order and only unlocked once.
 */

const DEFINITIONS = [
  { id: "first-blood", icon: "\u2691", title: "First Blood", desc: "Complete your first task.", check: (s) => s.totalCompletions >= 1 },
  { id: "centurion", icon: "\u2742", title: "Centurion", desc: "Clear 100 tasks in total.", check: (s) => s.totalCompletions >= 100 },
  { id: "streak-7", icon: "\u26A1", title: "On Fire", desc: "Reach a 7-day streak.", check: (s) => s.longestStreak >= 7 },
  { id: "streak-30", icon: "\u2726", title: "Unstoppable", desc: "Reach a 30-day streak.", check: (s) => s.longestStreak >= 30 },
  { id: "early-bird", icon: "\u263C", title: "Early Bird", desc: "Complete a task before 9 AM.", check: (s) => s.earlyBird },
  { id: "night-owl", icon: "\u25D0", title: "Night Owl", desc: "Complete a task after 10 PM.", check: (s) => s.nightOwl },
  { id: "level-5", icon: "\u265C", title: "Rising Star", desc: "Reach level 5.", check: (s) => s.level >= 5 },
  { id: "level-10", icon: "\u265B", title: "Legend", desc: "Reach level 10.", check: (s) => s.level >= 10 },
  { id: "exp-1000", icon: "\u27A4", title: "Wealthy", desc: "Earn 1,000 total EXP.", check: (s) => s.totalExp >= 1000 },
  { id: "target-day", icon: "\u25CE", title: "On Target", desc: "Hit your daily EXP target.", check: (s) => s.targetHit },
  // Hard tier — months of consistent use.
  { id: "veteran", icon: "\u2694", title: "Veteran", desc: "Clear 500 tasks in total.", check: (s) => s.totalCompletions >= 500 },
  { id: "target-streak-7", icon: "\u272A", title: "Perfect Week", desc: "Hit your daily EXP target 7 days in a row.", check: (s) => s.targetHitStreak >= 7 },
  { id: "full-circle", icon: "\u262F", title: "Full Circle", desc: "Complete a task before 9 AM and after 10 PM on the same day.", check: (s) => s.bothEnds },
  { id: "exp-5000", icon: "\u2756", title: "EXP Tycoon", desc: "Earn 5,000 total EXP.", check: (s) => s.totalExp >= 5000 },
  { id: "level-15", icon: "\u25C8", title: "Ascendant", desc: "Reach level 15.", check: (s) => s.level >= 15 },
  { id: "streak-100", icon: "\u269C", title: "Century", desc: "Reach a 100-day streak.", check: (s) => s.longestStreak >= 100 },
  { id: "target-streak-30", icon: "\u2735", title: "Unbreakable", desc: "Hit your daily EXP target 30 days in a row.", check: (s) => s.targetHitStreak >= 30 },
  { id: "exp-10000", icon: "\u2720", title: "EXP Mogul", desc: "Earn 10,000 total EXP.", check: (s) => s.totalExp >= 10000 },
  { id: "level-20", icon: "\u271A", title: "Transcendent", desc: "Reach level 20.", check: (s) => s.level >= 20 },
  { id: "streak-365", icon: "\u2604", title: "Year of Iron", desc: "Reach a 365-day streak.", check: (s) => s.longestStreak >= 365 },
];

async function computeStats() {
  const all = await completionsRepo.getAllCompletions();
  const today = getTodayDateString();
  const byDate = new Map();
  all.forEach((c) => {
    const day = byDate.get(c.date) || { exp: 0, hours: [] };
    day.exp += c.expAwarded;
    // Legacy records may lack completedAt entirely (v1 imports); null/absent
    // timestamps must not be coerced into the epoch (midnight 1970), or a
    // UTC+7 clock would read it as "7 AM" and spuriously unlock Early Bird.
    const hour = isUsableCompletedAt(c) ? new Date(c.completedAt).getHours() : NaN;
    if (!Number.isNaN(hour)) day.hours.push(hour);
    byDate.set(c.date, day);
  });
  const todays = all.filter((c) => c.date === today);
  const [lifetimeExp, dailyTarget] = await Promise.all([
    metaRepo.getLifetimeExp(),
    metaRepo.getDailyTargetExp(),
  ]);

  // Consecutive days ending today where the day's EXP met the daily target.
  let targetHitStreak = 0;
  if (dailyTarget > 0) {
    const cursor = new Date();
    for (;;) {
      const day = byDate.get(formatDate(cursor));
      if (day && day.exp >= dailyTarget) {
        targetHitStreak += 1;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
  }

  return {
    totalCompletions: all.length,
    totalExp: lifetimeExp,
    longestStreak: calculateLongestStreak(all.map((c) => c.date)),
    level: getLevel(lifetimeExp),
    earlyBird: all.some((c) => isUsableCompletedAt(c) && new Date(c.completedAt).getHours() < 9),
    nightOwl: all.some((c) => isUsableCompletedAt(c) && new Date(c.completedAt).getHours() >= 22),
    targetHit:
      dailyTarget > 0 && todays.reduce((sum, c) => sum + c.expAwarded, 0) >= dailyTarget,
    // One day that saw both an early (<9h) and a late (>=22h) completion.
    bothEnds: [...byDate.values()].some((day) => day.hours.some((h) => h < 9) && day.hours.some((h) => h >= 22)),
    targetHitStreak,
  };
}

/** Only ISO timestamps from real completions count for hour-of-day stats. */
function isUsableCompletedAt(c) {
  return typeof c.completedAt === "string" && c.completedAt.length > 0;
}

/** Numeric progress for badges that have a countable stat ({ cur, goal })
 *  or null for unlock-once/event badges (early bird, night owl, full circle). */
function progressOf(def, s) {
  switch (def.id) {
    case "first-blood": return { cur: s.totalCompletions, goal: 1 };
    case "centurion": return { cur: s.totalCompletions, goal: 100 };
    case "veteran": return { cur: s.totalCompletions, goal: 500 };
    case "streak-7": return { cur: s.longestStreak, goal: 7 };
    case "streak-30": return { cur: s.longestStreak, goal: 30 };
    case "streak-100": return { cur: s.longestStreak, goal: 100 };
    case "streak-365": return { cur: s.longestStreak, goal: 365 };
    case "exp-1000": return { cur: s.totalExp, goal: 1000 };
    case "exp-5000": return { cur: s.totalExp, goal: 5000 };
    case "exp-10000": return { cur: s.totalExp, goal: 10000 };
    case "level-5": return { cur: s.level, goal: 5 };
    case "level-10": return { cur: s.level, goal: 10 };
    case "level-15": return { cur: s.level, goal: 15 };
    case "level-20": return { cur: s.level, goal: 20 };
    case "target-streak-7": return { cur: s.targetHitStreak, goal: 7 };
    case "target-streak-30": return { cur: s.targetHitStreak, goal: 30 };
    case "target-day": return { cur: s.targetHit ? 1 : 0, goal: 1 };
    default: return null;
  }
}

/** Maps a badge id to its i18n ach.* suffix, e.g. "first-blood" ->
 *  "firstBlood" and "streak-7" -> "streak7". Single source of truth for
 *  both the Profile gallery and the Home unlock toast (the old per-screen
 *  copies only handled letter suffixes, so every numeric badge rendered
 *  as its raw key, e.g. "ach.streak-7"). */
export function achievementKey(id) {
  return String(id).replace(/-([a-z0-9])/gi, (_, c) => c.toUpperCase());
}

/** Full badge state for the Profile gallery. */
export async function getAchievementState() {
  const [stats, unlockedEntries] = await Promise.all([computeStats(), metaRepo.getUnlockedAchievements()]);
  const byId = new Map(unlockedEntries.map((e) => [e.id, e]));
  return DEFINITIONS.map((def) => {
    const entry = byId.get(def.id);
    const unlocked = Boolean(entry);
    return { ...def, unlocked, at: entry ? entry.at : null, met: def.check(stats), progress: progressOf(def, stats), stats };
  });
}

/** Check for newly met badges and persist them. Returns the fresh
 *  definitions (for toasts/sounds) or an empty array. */
export async function evaluateAchievements() {
  const state = await getAchievementState();
  const fresh = state.filter((a) => !a.unlocked && a.met);
  if (fresh.length === 0) return [];
  await metaRepo.addUnlockedAchievements(fresh.map((a) => a.id));
  return fresh;
}