import * as metaRepo from "../db/metaRepo.js";

// Adding a theme is just: pick an id, add it here, and add its token block
// to css/main.css. No component CSS or JS needs to change — every color in
// components.css is a var(--...) that these token blocks redefine.
export const THEMES = [
  { id: "stat-sheet", name: "Robo Star", blurb: "Indigo & brass HUD — the original look" },
  { id: "dnd", name: "Adventurer's Log", blurb: "Parchment, wax seals, tabletop ledger" },
  { id: "cyberpunk", name: "Neon Circuit", blurb: "Terminal glow, sharp edges, night city" },
];

const DEFAULT_THEME = "stat-sheet";
const VALID_IDS = new Set(THEMES.map((t) => t.id));

export function applyTheme(themeId) {
  const id = VALID_IDS.has(themeId) ? themeId : DEFAULT_THEME;
  document.documentElement.setAttribute("data-theme", id);
  return id;
}

/** Reads the saved theme (if any) and applies it, along with any saved
 *  custom accent override. Call once on startup. */
export async function loadAndApplyTheme() {
  const saved = await metaRepo.getTheme();
  const applied = applyTheme(saved);
  const customAccent = await metaRepo.getCustomAccent();
  applyCustomAccent(customAccent);
  return applied;
}

export async function setTheme(themeId) {
  const applied = applyTheme(themeId);
  await metaRepo.setTheme(applied);
  return applied;
}

/** Darkens a #rrggbb hex color by `amount` (0 = unchanged, 1 = black).
 *  Used to derive a matching "-dim" shade for a custom accent color
 *  without needing the user to pick two colors. */
function darkenHex(hex, amount = 0.55) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${toHex(r * (1 - amount))}${toHex(g * (1 - amount))}${toHex(b * (1 - amount))}`;
}

/**
 * Custom accent is a universal override on top of whichever theme is
 * active (set as inline styles, which beat the [data-theme] rules on
 * specificity) — it persists across theme switches until explicitly
 * reset, rather than being tied to one specific theme.
 */
export function applyCustomAccent(hexColor) {
  const root = document.documentElement;
  if (hexColor) {
    root.style.setProperty("--gold", hexColor);
    root.style.setProperty("--gold-dim", darkenHex(hexColor));
  } else {
    root.style.removeProperty("--gold");
    root.style.removeProperty("--gold-dim");
  }
}

export async function setCustomAccent(hexColor) {
  applyCustomAccent(hexColor);
  await metaRepo.setCustomAccent(hexColor);
}
