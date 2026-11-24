/**
 * Console shell layout across aspect ratios (phones, tablets, desktop, odd windows, notches):
 * at DPR 1, 2, 2.625 (Pixel 7, QA R7-5) and 3: a whole number of device px per art px, buttons
 * >= 48 CSS px, every piece inside the safe area, no overlaps, every edge on a whole device px,
 * a usable game screen, the README scale rule, and (R7-6) small landscape windows keep a game
 * screen at least as wide as it is tall where possible, so the camera keeps its zoom. Insets are
 * orientation-matched (notch top/bottom in portrait, left/right in landscape) plus none; and
 * also the worst case on every viewport as a robustness check (scale steps down to fit).
 */
import { Box, computeShellLayout, shellScale } from '../ui/shellLayout';
import { snappedCameraZoom } from '../logic/cameraZoom';

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
const DPRS = [1, 2, 2.625, 3];
const isWhole = (v: number) => Math.abs(v - Math.round(v)) < 1e-6;

export function runShellLayoutTest(): void {
  console.log('=== SHELL LAYOUT TEST ===');
  const errors: string[] = [];
  if (shellScale(390, 844) !== 3 || shellScale(360, 780) !== 2 || shellScale(844, 390) !== 2 || shellScale(667, 375) !== 2) {
    errors.push('shell scale rule: portrait 3 at short side >= 390 else 2, landscape 2');
  }
  let n = 0;
  for (const dpr of DPRS) for (const [w, h] of VIEWPORTS) for (const [ii, ins] of INSETS.entries()) {
    // DPR 1 also gets every inset set on every viewport (robustness); other DPRs get the
    // realistic ones (notch top/bottom in portrait, left/right in landscape).
    if (dpr !== 1 && ii !== 0 && (h > w) !== (ii === 1)) continue;
    n++;
    const L = computeShellLayout(w, h, ins, dpr);
    const tag = `${w}x${h}@${dpr} insets ${JSON.stringify(ins)}`;
    const safe = { x: ins.left, y: ins.top, w: w - ins.left - ins.right, h: h - ins.top - ins.bottom };
    const whole = (b: Box) => [b.x, b.y, b.w, b.h].every((v) => isWhole(v * dpr));
    if (!Number.isInteger(L.k) || L.s < 2 - 1e-9 || !isWhole(L.s * dpr)) errors.push(`${tag}: scale ${L.s} (k ${L.k})`);
    if (dpr === Math.round(dpr) && L.s !== Math.round(L.s)) errors.push(`${tag}: integer DPR but fractional CSS scale ${L.s}`);
    const pieces: [string, Box][] = [
      ['bezel', L.bezel], ['well', L.well], ['logo', L.logo], ['led', L.led], ['grille', L.grille],
      ...Object.entries(L.buttons).map(([id, b]) => [`socket ${id}`, b.socket] as [string, Box]),
    ];
    const shown = pieces.filter(([, b]) => b.w > 0);
    for (const [n, b] of shown) {
      if (!inside(b, { x: safe.x - 1e-6, y: safe.y - 1e-6, w: safe.w + 2e-6, h: safe.h + 2e-6 })) errors.push(`${tag}: ${n} outside the safe area ${JSON.stringify(b)}`);
      if (!whole(b)) errors.push(`${tag}: ${n} not on whole device px ${JSON.stringify(b)}`);
    }
    for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) {
      if (overlap(shown[i][1], shown[j][1])) errors.push(`${tag}: ${shown[i][0]} overlaps ${shown[j][0]}`);
    }
    if (!whole(L.screen)) errors.push(`${tag}: screen not on whole device px`);
    for (const [id, b] of Object.entries(L.buttons)) if (b.button.w < 48 - 1e-6) errors.push(`${tag}: ${id} button ${b.button.w} < 48 CSS px`);
    if (!inside(L.screen, L.bezel)) errors.push(`${tag}: screen not inside the bezel`);
    if (L.screen.w < 150 || L.screen.h < 150) errors.push(`${tag}: game screen too small ${L.screen.w}x${L.screen.h}`);
    if (L.portrait !== h > w) errors.push(`${tag}: orientation`);
  }
  // R7-6: small landscape windows keep the camera zoom (screen at least as wide as tall).
  for (const [w, h, dpr, minZoom] of [[800, 600, 1, 2], [568, 320, 2, 2], [844, 390, 3, 3.5], [667, 375, 2, 2.5], [1366, 768, 1, 2.5]] as const) {
    const L = computeShellLayout(w, h, { top: 0, right: 0, bottom: 0, left: 0 }, dpr);
    const z = snappedCameraZoom(Math.round(Math.min(L.screen.w, L.screen.h) * dpr));
    if (z < minZoom) errors.push(`R7-6 ${w}x${h}@${dpr}: screen ${L.screen.w}x${L.screen.h}, zoom ${z} (< ${minZoom})`);
  }
  // R7-5: Pixel 7 gets whole device px per art px (6 landscape, 7 portrait).
  const p7l = computeShellLayout(915, 412, { top: 0, right: 0, bottom: 0, left: 0 }, 2.625);
  const p7p = computeShellLayout(412, 915, { top: 0, right: 0, bottom: 0, left: 0 }, 2.625);
  if (p7l.k !== 6 || p7p.k !== 7) errors.push(`R7-5 Pixel 7: k landscape ${p7l.k}, portrait ${p7p.k}`);
  if (errors.length) {
    errors.slice(0, 20).forEach((e) => console.error(`  - ${e}`));
    throw new Error(`Shell layout: ${errors.length} problems`);
  }
  console.log(`✓ ${n} viewport x inset x DPR combinations: whole device px per art px, in the safe area, no overlaps, buttons >= 48 CSS px`);
  console.log('✓ R7-5 Pixel 7 (2.625): 6 / 7 device px per art px; R7-6 800x600 and 568x320 keep zoom >= 2');
  console.log('✅ SHELL LAYOUT TEST PASSED');
}
