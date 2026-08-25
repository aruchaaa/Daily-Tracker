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
    const hour = new Date(c.completedAt).getHours();
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
    earlyBird: all.some((c) => new Date(c.completedAt).getHours() < 9),
    nightOwl: all.some((c) => new Date(c.completedAt).getHours() >= 22),
    targetHit:
      dailyTarget > 0 && todays.reduce((sum, c) => sum + c.expAwarded, 0) >= dailyTarget,
    // One day that saw both an early (<9h) and a late (>=22h) completion.
    bothEnds: [...byDate.values()].some((day) => day.hours.some((h) => h < 9) && day.hours.some((h) => h >= 22)),
    targetHitStreak,
  };
}

/** Full badge state for the Profile gallery. */
export async function getAchievementState() {
  const [stats, unlockedEntries] = await Promise.all([computeStats(), metaRepo.getUnlockedAchievements()]);
  const byId = new Map(unlockedEntries.map((e) => [e.id, e]));
  return DEFINITIONS.map((def) => {
    const entry = byId.get(def.id);
    return { ...def, unlocked: Boolean(entry), at: entry ? entry.at : null, met: def.check(stats) };
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