/**
 * Lightweight confetti burst for milestone moments (level-up, achievement
 * unlock).  The host is absolutely positioned so it overlays the page
 * without affecting layout; pieces self-remove after their animation
 * completes.  Works entirely in CSS (no requestAnimationFrame) so the
 * main thread stays free for any screen re-render that follows.
 *
 * Respects `prefers-reduced-motion` via a blanket CSS rule that hides
 * the host entirely — no JS check needed.
 */

const COLORS = [
  "var(--gold, #e8b355)",
  "var(--primary, #9d88d6)",
  "var(--success, #66bb6a)",
  "var(--danger, #e0667a)",
  "var(--ink-dim, #9c93b8)",
];

const COUNT = 24;

export function confettiBurst() {
  if (typeof document === "undefined") return;
  const host = document.createElement("div");
  host.className = "confetti-host";
  for (let i = 0; i < COUNT; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    const size = 5 + Math.random() * 7;
    const hue = Math.floor(Math.random() * 360);
    piece.style.cssText =
      `left:${Math.random() * 100}%;` +
      `--c-sz:${size.toFixed(1)}px;` +
      `--c-w:${(size * (0.55 + Math.random() * 0.9)).toFixed(1)}px;` +
      `--c-tx:${(Math.random() * 140 - 70).toFixed(0)}px;` +
      `--c-rot:${Math.floor(Math.random() * 2 + 1) * 360 + (Math.random() > 0.5 ? 0 : 180)}deg;` +
      `--c-dur:${(1.0 + Math.random() * 1.3).toFixed(2)}s;` +
      `--c-delay:${(Math.random() * 0.35).toFixed(2)}s;` +
      `--c-rad:${Math.random() > 0.5 ? "2px" : "50%"};` +
      `background:${i % 5 === 0 ? `hsl(${hue},72%,62%)` : COLORS[i % COLORS.length]};`;
    host.appendChild(piece);
  }
  document.body.appendChild(host);
  setTimeout(() => host.remove(), 2800);
}
