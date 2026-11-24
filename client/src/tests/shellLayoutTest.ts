/**
 * Console shell layout across aspect ratios (phones, tablets, desktop, odd windows, notches):
 * integer scale >= 2 (buttons >= 48 CSS px), every piece inside the safe area, no overlaps,
 * whole-CSS-px positions, a usable game screen, and the README scale rule. Insets are
 * orientation-matched (notch top/bottom in portrait, left/right in landscape) plus none; and
 * also the worst case on every viewport as a robustness check (scale steps down to fit).
 */
import { Box, computeShellLayout, shellScale } from '../ui/shellLayout';

const VIEWPORTS: [number, number][] = [
  [844, 390], [667, 375], [390, 844], [375, 667], [360, 780], [430, 932], [932, 430], [780, 360],
  [1366, 768], [1920, 1080], [1280, 720], [820, 1180], [1180, 820], [1024, 1366], [568, 320], [320, 568],
  [2560, 1080], [800, 800], [1000, 400], [400, 1000],
];
const INSETS = [
  { top: 0, right: 0, bottom: 0, left: 0 },
  { top: 47, right: 0, bottom: 34, left: 0 },
  { top: 0, right: 47, bottom: 21, left: 47 },
];

const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (a: Box, b: Box) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
const whole = (b: Box) => [b.x, b.y, b.w, b.h].every(Number.isInteger);

export function runShellLayoutTest(): void {
  console.log('=== SHELL LAYOUT TEST ===');
  const errors: string[] = [];
  if (shellScale(390, 844) !== 3 || shellScale(360, 780) !== 2 || shellScale(844, 390) !== 2 || shellScale(667, 375) !== 2) {
    errors.push('shell scale rule: portrait 3 at short side >= 390 else 2, landscape 2');
  }
  for (const [w, h] of VIEWPORTS) for (const ins of INSETS) {
    const L = computeShellLayout(w, h, ins);
    const tag = `${w}x${h} insets ${JSON.stringify(ins)}`;
    const safe = { x: ins.left, y: ins.top, w: w - ins.left - ins.right, h: h - ins.top - ins.bottom };
    if (!Number.isInteger(L.s) || L.s < 2) errors.push(`${tag}: scale ${L.s}`);
    const pieces: [string, Box][] = [
      ['bezel', L.bezel], ['well', L.well], ['logo', L.logo], ['led', L.led], ['grille', L.grille],
      ...Object.entries(L.buttons).map(([id, b]) => [`socket ${id}`, b.socket] as [string, Box]),
    ];
    const shown = pieces.filter(([, b]) => b.w > 0);
    for (const [n, b] of shown) {
      if (!inside(b, safe)) errors.push(`${tag}: ${n} outside the safe area ${JSON.stringify(b)}`);
      if (!whole(b)) errors.push(`${tag}: ${n} not on whole CSS px ${JSON.stringify(b)}`);
    }
    for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) {
      if (overlap(shown[i][1], shown[j][1])) errors.push(`${tag}: ${shown[i][0]} overlaps ${shown[j][0]}`);
    }
    for (const [id, b] of Object.entries(L.buttons)) if (b.button.w < 48) errors.push(`${tag}: ${id} button ${b.button.w} < 48 CSS px`);
    if (!inside(L.screen, L.bezel)) errors.push(`${tag}: screen not inside the bezel`);
    if (L.screen.w < 150 || L.screen.h < 150) errors.push(`${tag}: game screen too small ${L.screen.w}x${L.screen.h}`);
    if (L.portrait !== h > w) errors.push(`${tag}: orientation`);
  }
  if (errors.length) {
    errors.slice(0, 20).forEach((e) => console.error(`  - ${e}`));
    throw new Error(`Shell layout: ${errors.length} problems`);
  }
  console.log(`✓ ${VIEWPORTS.length * INSETS.length} viewport x inset combinations: in the safe area, no overlaps, buttons >= 48 CSS px`);
  console.log('✅ SHELL LAYOUT TEST PASSED');
}
