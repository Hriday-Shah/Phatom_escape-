/**
 * Two-browser ground-floor playtest for PR 37 (movement / foyer / kitchen).
 * Usage: BASE=http://127.0.0.1:5173/ SERVER=ws://localhost:2567 node scripts/pr37-ground-floor-playtest.mjs
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';

const BASE = (process.env.BASE || 'http://127.0.0.1:5173/').replace(/\/?$/, '/');
const WS = process.env.SERVER || 'ws://localhost:2567';
const OUT = process.env.OUT || '/opt/cursor/artifacts';
mkdirSync(OUT, { recursive: true });

const TICK_MS = Math.round(1000 / 12);
const WALK_PER_TICK = 12;
const DESK = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
const ENTRY = `${BASE}?server=${encodeURIComponent(WS)}`;

const bugs = [];
const passes = [];

function pass(area, detail = '') {
  passes.push({ area, detail });
  console.log(`PASS: ${area}${detail ? ` — ${detail}` : ''}`);
}
function fail(area, detail) {
  bugs.push({ area, detail });
  console.log(`FAIL: ${area} — ${detail}`);
}

async function state(page) {
  return page.evaluate(() => {
    const g = window.__PE_GAME__;
    if (!g) return null;
    const s = g.scene.getScene('GameScene');
    if (!s?.player) return { phase: 'no-game' };
    return {
      x: Math.round(s.player.x * 10) / 10,
      y: Math.round(s.player.y * 10) / 10,
      open: s.hidingSpotManager?.openIds?.() ?? [],
      remotes: s.netSync?.remotePositions?.() ?? [],
    };
  });
}

async function waitGame(page) {
  await page.waitForFunction(
    () => window.__PE_GAME__?.scene?.isActive('GameScene'),
    null,
    { timeout: 120000 },
  );
  await page.click('canvas', { position: { x: 400, y: 400 } });
  await page.waitForTimeout(500);
}

async function hold(page, keys, ms) {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of keys) await page.keyboard.up(k);
  await page.waitForTimeout(150);
}

async function moved(page, before, minPx) {
  const after = await state(page);
  const d = Math.hypot(after.x - before.x, after.y - before.y);
  return { after, d, ok: d >= minPx };
}

async function measureTicks(page, keys, ticks) {
  const dists = [];
  for (let i = 0; i < ticks; i++) {
    const b = await state(page);
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(TICK_MS + 40);
    for (const k of keys) await page.keyboard.up(k);
    const a = await state(page);
    dists.push(Math.hypot(a.x - b.x, a.y - b.y));
    await page.waitForTimeout(80);
  }
  return dists;
}

async function lobbyHost(page, nick) {
  await page.goto(ENTRY);
  await page.waitForSelector('#pe-home:not([hidden])', { timeout: 30000 });
  await page.fill('#pe-nickname', nick);
  await page.click('#pe-create-room');
  await page.waitForSelector('#pe-lobby:not([hidden])', { timeout: 30000 });
  const code = (await page.textContent('#pe-lobby-code'))?.trim();
  if (!code) throw new Error('no room code');
  const ready = page.locator('#pe-lobby-ready');
  if (await ready.isVisible().catch(() => false)) await ready.click();
  return code;
}

async function lobbyJoin(page, nick, code) {
  await page.goto(ENTRY);
  await page.waitForSelector('#pe-home:not([hidden])', { timeout: 30000 });
  await page.fill('#pe-nickname', nick);
  await page.fill('#pe-room-code', code);
  await page.click('#pe-join-room');
  await page.waitForSelector('#pe-lobby:not([hidden])', { timeout: 30000 });
  await page.click('#pe-lobby-ready');
}

async function hostStart(page) {
  await page.click('#pe-lobby-start');
  const dialog = page.locator('#pe-lobby-confirm');
  if (await dialog.isVisible().catch(() => false)) {
    await page.click('#pe-lobby-confirm-ok');
  }
}

async function interact(page) {
  await page.keyboard.press('e');
  await page.waitForTimeout(400);
}

async function compareRemotes(host, guest, label, maxGap = 90) {
  const hs = await state(host);
  const gs = await state(guest);
  if (!hs || !gs) return;
  const remoteOnHost = hs.remotes[0];
  const remoteOnGuest = gs.remotes[0];
  if (!remoteOnHost || !remoteOnGuest) {
    fail(label, 'missing remote player on one screen');
    return;
  }
  const gapH = Math.hypot(remoteOnHost.x - gs.x, remoteOnHost.y - gs.y);
  const gapG = Math.hypot(remoteOnGuest.x - hs.x, remoteOnGuest.y - hs.y);
  const gap = Math.max(gapH, gapG);
  if (gap > maxGap) fail(label, `desync gap ${gap.toFixed(0)}px (host sees guest @${remoteOnHost.x},${remoteOnHost.y})`);
  else pass(label, `gap ${gap.toFixed(0)}px`);
}

async function drawerSync(host, guest, label) {
  await interact(host);
  await pageWaitNet(host, guest, 800);
  const hOpen = (await state(host))?.open ?? [];
  const gOpen = (await state(guest))?.open ?? [];
  if (hOpen.join() !== gOpen.join()) {
    fail(label, `host [${hOpen}] vs guest [${gOpen}]`);
    return false;
  }
  pass(label, hOpen.length ? hOpen.join(',') : 'closed match');
  return true;
}

async function pageWaitNet(host, guest, ms) {
  await host.waitForTimeout(ms);
  await guest.waitForTimeout(ms);
}

const browser = await chromium.launch({ headless: true });
const hostCtx = await browser.newContext(DESK);
const guestCtx = await browser.newContext(DESK);
const host = await hostCtx.newPage();
const guest = await guestCtx.newPage();

try {
  const code = await lobbyHost(host, 'Host');
  await lobbyJoin(guest, 'Guest', code);
  await hostStart(host);
  await waitGame(host);
  await waitGame(guest);

  // 1 — Spawn: host car-table diagonal; guest entrance walk speed
  {
    const ticks = await measureTicks(host, ['ArrowUp', 'ArrowRight'], 6);
    const steady = ticks.slice(2, 6);
    if (steady.filter((t) => t >= WALK_PER_TICK - 7).length < 2) {
      fail('host car-table slide', `steady ticks ${steady.map((t) => t.toFixed(1)).join(', ')}`);
    } else pass('host car-table slide', `steady ${steady.map((t) => t.toFixed(0)).join(',')} px/tick`);
    await guest.click('canvas', { position: { x: 400, y: 400 } });
    const gTicks = await measureTicks(guest, ['ArrowRight'], 6);
    const gSteady = gTicks.slice(2, 5);
    if (gSteady.filter((t) => t >= 10).length < 2) fail('guest spawn walk', `ticks ${gSteady.map((t) => t.toFixed(1)).join(', ')}`);
    else pass('guest spawn walk', gSteady.map((t) => t.toFixed(0)).join(',') + ' px/tick');
  }

  let s0 = await state(host);
  await hold(host, ['ArrowUp', 'ArrowRight'], 4500);
  const ent = await moved(host, s0, 80);
  if (!ent.ok) fail('entrance→living (host)', `stuck near ${ent.after.x},${ent.after.y}`);
  else pass('entrance→living (host)', `@ ${ent.after.x},${ent.after.y}`);
  await compareRemotes(host, guest, 'after entrance corridor');

  s0 = await state(guest);
  await hold(guest, ['ArrowUp', 'ArrowRight'], 4000);
  const gent = await moved(guest, s0, 60);
  if (!gent.ok) fail('entrance→living (guest)', `stuck @ ${gent.after.x},${gent.after.y}`);
  else pass('entrance→living (guest)');

  // 2 — Living / dining sweep + doorway walls
  s0 = await state(host);
  await hold(host, ['ArrowUp'], 2200);
  await hold(host, ['ArrowRight'], 1200);
  await hold(host, ['ArrowDown'], 1800);
  await hold(host, ['ArrowLeft'], 800);
  const lv = await moved(host, s0, 50);
  if (!lv.ok) fail('living/dining sweep', `stuck @ ${lv.after.x},${lv.after.y}`);
  else pass('living/dining sweep', `@ ${lv.after.x},${lv.after.y}`);

  // Push west wall then north (wall slide)
  s0 = await state(host);
  await hold(host, ['ArrowLeft'], 600);
  await hold(host, ['ArrowUp'], 1200);
  const wall = await moved(host, s0, 20);
  if (!wall.ok) fail('living west wall slide', `stuck @ ${wall.after.x},${wall.after.y}`);
  else pass('living west wall slide');

  // 3 — Foyer mouth → kitchen (avoid sideboard pocket: up/left then into kitchen)
  s0 = await state(host);
  await hold(host, ['ArrowRight'], 2000);
  await hold(host, ['ArrowUp', 'ArrowRight'], 2500);
  await hold(host, ['ArrowRight', 'ArrowDown'], 2000);
  const fo = await moved(host, s0, 40);
  if (!fo.ok) fail('foyer→kitchen route', `stuck @ ${fo.after.x},${fo.after.y}`);
  else pass('foyer→kitchen route', `${fo.after.x},${fo.after.y}`);
  await compareRemotes(host, guest, 'after foyer/kitchen');

  s0 = await state(host);
  if (s0 && s0.y < 230) await hold(host, ['ArrowLeft', 'ArrowDown'], 1500);
  await hold(host, ['ArrowDown', 'ArrowRight'], 4500);
  const kit = await moved(host, s0, 28);
  if (!kit.ok) fail('kitchen interior', `stuck @ ${kit.after.x},${kit.after.y}`);
  else pass('kitchen interior', `${kit.after.x},${kit.after.y}`);

  // Guest: south/east below the living north wall, then foyer mouth
  s0 = await state(guest);
  await guest.click('canvas', { position: { x: 400, y: 400 } });
  const guestNorth = (s0?.y ?? 400) < 270;
  if (guestNorth) {
    await hold(guest, ['ArrowDown', 'ArrowRight'], 4000);
    await hold(guest, ['ArrowRight'], 2500);
    await hold(guest, ['ArrowDown', 'ArrowRight'], 2500);
  } else {
    await hold(guest, ['ArrowRight'], 2000);
    await hold(guest, ['ArrowDown', 'ArrowRight'], 3500);
  }
  const gf = await moved(guest, s0, 35);
  if (!gf.ok) fail('guest foyer path', `stuck @ ${gf.after.x},${gf.after.y}`);
  else pass('guest foyer path');

  // 4 — Drawers: sofa (living), then stove drawers if in range
  await hold(host, ['ArrowLeft', 'ArrowUp'], 4500);
  await hold(guest, ['ArrowRight', 'ArrowDown'], 3500);
  s0 = await state(host);
  if (!(await drawerSync(host, guest, 'sofa drawer sync'))) {
    await host.screenshot({ path: `${OUT}/pr37-playtest-sofa-host.png` });
    await guest.screenshot({ path: `${OUT}/pr37-playtest-sofa-guest.png` });
  }
  await interact(host); // close
  await pageWaitNet(host, guest, 600);
  const h2 = (await state(host))?.open ?? [];
  const g2 = (await state(guest))?.open ?? [];
  if (h2.join() !== g2.join()) fail('sofa drawer close sync', `host [${h2}] guest [${g2}]`);
  else pass('sofa drawer close sync');

  // 5 — Reconnect: host reload while guest walks
  const g0 = await state(guest);
  const walkP = hold(guest, ['ArrowUp', 'ArrowRight'], 5000);
  await host.reload({ waitUntil: 'domcontentloaded' });
  await walkP;
  const g1 = await state(guest);
  const guestMoved = Math.hypot(g1.x - g0.x, g1.y - g0.y);
  if (guestMoved < 20) fail('reconnect', `guest froze during host reload (moved ${guestMoved.toFixed(0)}px)`);
  else pass('reconnect', `guest kept walking (+${guestMoved.toFixed(0)}px) while host reloaded`);

  await compareRemotes(host, guest, 'final positions', 110);

  const report = {
    passes,
    bugs,
    ts: new Date().toISOString(),
    branch: 'cursor/fix-foyer-kitchen-stall-7ca3',
  };
  writeFileSync(`${OUT}/pr37-ground-floor-report.json`, JSON.stringify(report, null, 2));
  console.log('\n=== Summary ===');
  console.log(`Passes: ${passes.length}, Fails: ${bugs.length}`);
  if (bugs.length) process.exitCode = 1;
} finally {
  await browser.close();
}