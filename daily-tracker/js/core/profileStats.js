import * as metaRepo from "../db/metaRepo.js";
import * as completionsRepo from "../db/completionsRepo.js";
import { getLevelProgress } from "./expEngine.js";
import { generateReport } from "./monthlyReport.js";

/**
 * "Grade" was only ever defined as a monthly metric (see monthlyReport.js),
 * so the profile shows *this month's* grade rather than inventing a
 * separate lifetime grading scheme. Reuses generateReport wholesale rather
 * than re-deriving grade logic, at the cost of a few redundant reads that
 * are trivial at this app's data volume.
 */
export async function getProfileStats() {
  const now = new Date();

  const [characterName, lifetimeExp, allCompletions, monthReport] = await Promise.all([
    metaRepo.getCharacterName(),
    metaRepo.getLifetimeExp(),
    completionsRepo.getAllCompletions(),
    generateReport(now.getFullYear(), now.getMonth() + 1),
  ]);

  return {
    characterName,
    progress: getLevelProgress(lifetimeExp),
    tasksCleared: allCompletions.length,
    currentMonthCompletionPercent: monthReport.completionPercent,
    currentMonthGrade: monthReport.grade,
  };
}
