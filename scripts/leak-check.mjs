/**
 * R13-1 leak scan: furniture behind a wall must be as dark as plain darkness.
 * Reproduces report-13's 14-position scan (light vs nolight). A pixel is a leak
 * if it is lit (nolight L>25 and light > 0.25×nolight), is not on a wall, and
 * the segment from the player to it hits a wall or locked door.
 *
 * Usage: BASE=http://127.0.0.1:4352/ node scripts/leak-check.mjs
 * Optional: OUT=/tmp/pe-leak TAG=u LIMIT=200  (TAG=u uses ?debug=unlock)
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const BASE = process.env.BASE || 'http://127.0.0.1:4352/';
const OUT = process.env.OUT || '/tmp/pe-leak';
const TAG = process.env.TAG || 'u';
const LIMIT = process.env.LIMIT || '200';
mkdirSync(OUT, { recursive: true });
const MEASURE = join(dirname(fileURLToPath(import.meta.url)), 'leak-measure.py');

// Report-13's 14 positions (10 leaked on 2a84171, 4 were clean).
const POS = [
  [506, 200], [744, 158], [744, 408], [300, 430], [200, 260],
  [860, 250], [890, 170], [950, 460], [880, 520], [176, 464],
  [600, 200], [600, 420], [470, 420], [1010, 380],
];

const DESK = { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 };
const qLight = TAG === 'u' ? '?debug=unlock' : '?debug=1';
const qDark = TAG === 'u' ? '?debug=unlock,nolight' : '?debug=1,nolight';

const browser = await chromium.launch();

async function open(q) {
  const ctx = await browser.newContext(DESK);
  const page = await ctx.newPage();
  await page.goto(BASE + q + '&v=' + Date.now());
  await page.waitForFunction(() => window.__PE_GAME__?.scene?.isActive('UIScene'), null, { timeout: 20000 });
  return { ctx, page };
}

async function movePlayer(page, x, y) {
  await page.evaluate(([x, y]) => {
    const s = window.__PE_GAME__.scene.getScene('GameScene');
    s.player.getBody().reset(x, y);
    const c = s.cameras.main;
    c.stopFollow();
    c.centerOn(x, y);
  }, [x, y]);
}

async function readCam(page) {
  return page.evaluate(() => {
    const g = window.__PE_GAME__;
    const s = g.scene.getScene('GameScene');
    const c = s.cameras.main;
    // Read after a rendered frame so worldView matches the screenshot.
    const r = g.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return {
      px: s.player.x, py: s.player.y,
      wv: [c.worldView.x, c.worldView.y, c.worldView.width, c.worldView.height],
      vp: [c.x, c.y, c.width, c.height],
      zoom: c.zoom,
      canvas: { left: r.left, top: r.top, w: r.width, h: r.height, cw: g.canvas.width, ch: g.canvas.height, dpr },
    };
  });
}

const { ctx: A, page: pageA } = await open(qLight);
const { ctx: B, page: pageB } = await open(qDark);
const meta = [];
for (const [x, y] of POS) {
  await movePlayer(pageA, x, y);
  await movePlayer(pageB, x, y);
  await pageA.waitForTimeout(200);
  await pageB.waitForTimeout(200);
  const ma = await readCam(pageA);
  const mb = await readCam(pageB);
  await pageA.screenshot({ path: `${OUT}/${TAG}_${x}_${y}_L.png` });
  await pageB.screenshot({ path: `${OUT}/${TAG}_${x}_${y}_N.png` });
  meta.push({ x, y, ma, mb });
  console.log('captured', x, y);
}
writeFileSync(`${OUT}/meta_${TAG}.json`, JSON.stringify(meta));
await A.close(); await B.close();
await browser.close();

if (!existsSync(MEASURE)) { console.error('missing', MEASURE); process.exit(1); }
const r = spawnSync('python3', [MEASURE, OUT, TAG, LIMIT], { stdio: 'inherit' });
process.exit(r.status === 0 ? 0 : 1);
