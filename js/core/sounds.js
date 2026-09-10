import * as metaRepo from "../db/metaRepo.js";

/**
 * Tiny synthesized sound effects via the Web Audio API — no audio asset
 * files needed, so the offline-first, dependency-free constraint holds.
 * Every play call checks the Settings toggle first.
 *
 * Each effect has its own short pattern so actions are distinguishable by
 * ear: generic clicks, saves, toggles, deletes, errors, and the task tick /
 * level-up fanfare. `el()` in components.js plays a generic click on every
 * button as a fallback, unless the handler already played a specific
 * effect (tracked via `lastPlayedSeq`).
 */

let audioCtx = null;
let seq = 0;

function ctx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function tone(freq, start, dur, type = "sine", gain = 0.05) {
  const ac = ctx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ac.currentTime + start;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

/** Monotonic marker: the last effect that actually produced a sound.
 *  `el()`'s generic-click fallback compares this before/after a handler. */
export function lastPlayedSeq() {
  return seq;
}

async function enabled() {
  return Boolean(await metaRepo.getSoundEnabled());
}

/** Generic blip for any button press (the el() default). */
export async function playClick() {
  if (!(await enabled())) return;
  seq += 1;
  tone(660, 0, 0.06, "triangle", 0.035);
}

/** Soft pluck for tab navigation. */
export async function playNav() {
  if (!(await enabled())) return;
  seq += 1;
  tone(520, 0, 0.07, "sine", 0.04);
}

/** Short tick for completing a task. */
export async function playTick() {
  if (!(await enabled())) return;
  seq += 1;
  tone(880, 0, 0.09);
}

/** Lower tick for unchecking a task. */
export async function playUncheck() {
  if (!(await enabled())) return;
  seq += 1;
  tone(330, 0, 0.09, "sine", 0.04);
}

/** Two-tone confirmation for saves and successful actions. */
export async function playSave() {
  if (!(await enabled())) return;
  seq += 1;
  tone(523, 0, 0.08);
  tone(784, 0.09, 0.12);
}

/** Gentle two-note step for opening a detail/sub-page. */
export async function playOpen() {
  if (!(await enabled())) return;
  seq += 1;
  tone(784, 0, 0.06, "sine", 0.04);
  tone(1046, 0.07, 0.08, "sine", 0.035);
}

/** Short square blip for on/off toggles and chips. */
export async function playToggle() {
  if (!(await enabled())) return;
  seq += 1;
  tone(494, 0, 0.05, "square", 0.03);
}

/** Descending tone for deletions and destructive actions. */
export async function playDelete() {
  if (!(await enabled())) return;
  seq += 1;
  tone(330, 0, 0.09);
  tone(196, 0.1, 0.16);
}

/** Rising two-step for undo/revert actions. */
export async function playUndo() {
  if (!(await enabled())) return;
  seq += 1;
  tone(392, 0, 0.07);
  tone(587, 0.08, 0.1);
}

/** Low square buzz for validation errors and failed actions. */
export async function playError() {
  if (!(await enabled())) return;
  seq += 1;
  tone(180, 0, 0.18, "square", 0.03);
}

/** Rising arpeggio for level-ups and achievement unlocks. */
export async function playLevelUp() {
  if (!(await enabled())) return;
  seq += 1;
  [523, 659, 784, 1046].forEach((freq, i) => tone(freq, i * 0.09, 0.16));
}