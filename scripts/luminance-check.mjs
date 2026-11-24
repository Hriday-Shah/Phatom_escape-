/**
 * R12-1 Playwright luminance check: furniture art must stay lit (no self-shadow
 * and no shadowing of neighbouring furniture) at the study drawers, stove
 * drawers, east counter and sofa.
 *
 * Method matches QA report-12 / selfshadow12.py: for pixels of the unit that
 * lie within 0.6× the light radius of the player and have nolight luminance
 * > 25, flag a self-shadow if light < 0.2 × nolight. Fail if that fraction
 * exceeds LIMIT (default 8%).
 *
 * Usage: BASE=http://127.0.0.1:4352/ node scripts/luminance-check.mjs
 * Optional: OUT=/tmp/lum TAG=run LIMIT=8
 *
 * Needs a running game server and Python with Pillow for the measurement.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const BASE = process.env.BASE || 'http://127.0.0.1:4352/';
const OUT = process.env.OUT || '/tmp/pe-luminance';
const TAG = process.env.TAG || 'run';
const LIMIT = process.env.LIMIT || '8';
mkdirSync(OUT, { recursive: true });

const ROOT = dirname(fileURLToPath(import.meta.url));
const MEASURE = join(ROOT, 'luminance-measure.py');

// World rects of the units named in R12-1 (must match houseLayout).
const LAYOUT = [
  { id: 'study_drawer_1', x: 80, y: 150, w: 46, h: 50 },
  { id: 'study_drawer_2', x: 80, y: 200, w: 46, h: 50 },
  { id: 'study_drawer_3', x: 80, y: 250, w: 46, h: 50 },
  { id: 'stove', x: 1044, y: 420, w: 36, h: 90 },
  { id: 'stove_drawers', x: 1044, y: 320, w: 36, h: 100 },
  { id: 'kitchen_east_counter', x: 1044, y: 510, w: 36, h: 54 },
  { id: 'sofa', x: 440, y: 110, w: 50, h: 160 },
];

const VIEWS = [
  { tag: 'study', x: 156, y: 230, q: '?debug=unlock', units: ['study_drawer_1', 'study_drawer_2', 'study_drawer_3'] },
  { tag: 'east', x: 1014, y: 450, q: '?spawn=kitchen&debug=1', units: ['stove_drawers', 'kitchen_east_counter', 'stove'] },
  { tag: 'sofa', x: 520, y: 365, q: '?debug=1', units: ['sofa'] },
];

const PHONE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const browser = await chromium.launch();
const meta = { radius: 208, views: [] };

async function shot(light, view) {
  const q = light
    ? view.q
    : view.q.replace('debug=unlock', 'debug=unlock,nolight').replace('debug=1', 'debug=1,nolight');
  const ctx = await browser.newContext(PHONE);
  const page = await ctx.newPage();
  await page.goto(BASE + q + '&v=' + Date.now());
  await page.waitForFunction(() => window.__PE_GAME__?.scene?.isActive('UIScene'), null, { timeout: 20000 });
  await page.evaluate(([x, y]) => {
    const gs = window.__PE_GAME__.scene.getScene('GameScene');
    gs.player.getBody().reset(x, y);
    const cam = gs.cameras.main;
    cam.stopFollow();
    cam.centerOn(x, y);
  }, [view.x, view.y]);
  await page.waitForTimeout(300);
  const info = await page.evaluate(({ want, layout }) => {
    const g = window.__PE_GAME__;
    const gs = g.scene.getScene('GameScene');
    const cam = gs.cameras.main;
    const canvas = g.canvas;
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const sx = r.width / canvas.width, sy = r.height / canvas.height;
    const toDev = (wx, wy) => {
      const cx = cam.x + (wx - cam.worldView.x) * cam.zoom;
      const cy = cam.y + (wy - cam.worldView.y) * cam.zoom;
      return { x: (r.left + cx * sx) * dpr, y: (r.top + cy * sy) * dpr };
    };
    const boxes = Object.fromEntries(layout.map((u) => [u.id, u]));
    const units = [];
    for (const id of want) {
      const u = boxes[id];
      if (!u) continue;
      const a = toDev(u.x + 2, u.y + 2), b = toDev(u.x + u.w - 2, u.y + u.h - 2);
      units.push({
        id, x: u.x, y: u.y, w: u.w, h: u.h,
        dev: { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) },
      });
    }
    return {
      px: gs.player.x, py: gs.player.y,
      wv: [cam.worldView.x, cam.worldView.y, cam.worldView.width, cam.worldView.height],
      cam: { x: cam.x, y: cam.y, zoom: cam.zoom, w: cam.width, h: cam.height },
      canvas: { left: r.left, top: r.top, w: r.width, h: r.height, cw: canvas.width, ch: canvas.height, dpr },
      units,
    };
  }, { want: view.units, layout: LAYOUT });
  const file = `${OUT}/${view.tag}-${TAG}-${light ? 'light' : 'nolight'}.png`;
  await page.screenshot({ path: file });
  await ctx.close();
  return { file, info };
}

for (const view of VIEWS) {
  const L = await shot(true, view);
  const N = await shot(false, view);
  meta.views.push({ tag: view.tag, want: view.units, x: view.x, y: view.y, light: L, nolight: N });
  console.log('captured', view.tag, 'player', L.info.px, L.info.py);
}
const metaPath = `${OUT}/selfshadow-meta-${TAG}.json`;
writeFileSync(metaPath, JSON.stringify(meta, null, 2));
await browser.close();

if (!existsSync(MEASURE)) {
  console.error('missing', MEASURE);
  process.exit(1);
}
const r = spawnSync('python3', [MEASURE, OUT, TAG, LIMIT], { stdio: 'inherit' });
process.exit(r.status === 0 ? 0 : 1);
