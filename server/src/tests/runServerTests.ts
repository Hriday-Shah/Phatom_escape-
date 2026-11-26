/** Server room-logic unit tests (npm test -w server). */
import assert from 'node:assert/strict';
import { HouseLogic, MAX_ELAPSED_MS, RateLimiter, SPEED_JITTER_PX, SPEED_SLACK, parse } from '../houseLogic';
import { DEFAULT_SETTINGS, MAX_PLAYERS, maxPhantoms, PLAYER_COLOURS, SETTING_LIMITS } from '../../../client/src/lobby/lobby';
import { PLAYER_SPEED } from '../../../client/src/config/physicsConfig';
import { originAllowed, parseOrigins } from '../origins';
import { randomBytes } from 'node:crypto';
import { MIN_WIN_MS, createRound, createServerRoundFrom, hidingSpotList } from '../../../client/src/logic/itemRound';
import { canUseSpot, clampDrop, integrateSlide, losBlockers, movementBlockers, PLAYER_BODY_RADIUS, pointBlocked, spotById } from '../../../client/src/logic/worldCollision';
import { houseLayout } from '../../../client/src/data/houseLayout';
import { solvingLog, replayWin, createPuzzle } from '../../../client/src/logic/minigames/replay';

let n = 0;
const test = (name: string, f: () => void) => { f(); n++; console.log(`  ✓ ${name}`); };

function room(players = 3): HouseLogic {
  const h = new HouseLogic('ABC234');
  for (let i = 0; i < players; i++) assert.ok(h.join(`s${i}`, { nickname: `P${i}` }).ok);
  return h;
}
const pl = (h: HouseLogic, s: string) => h.snapshot().players.find((p) => p.id === h.playerId(s))!;

function beside(spotId: string): { x: number; y: number } {
  const s = spotById(spotId);
  if (!s) throw new Error(`no spot ${spotId}`);
  const blockers = movementBlockers();
  const cx = s.x + s.width / 2, cy = s.y + s.height / 2;
  for (const d of [20, 28, 36, 48, 60, 70, 84]) {
    for (const [dx, dy] of [[0, d], [0, -d], [d, 0], [-d, 0], [d, d], [-d, d], [d, -d], [-d, -d]]) {
      const p = { x: cx + dx, y: cy + dy };
      if (!pointBlocked(p.x, p.y, blockers) && canUseSpot(p, spotId)) return p;
    }
  }
  throw new Error(`no walkable pose beside ${spotId}`);
}

function stand(h: HouseLogic, session: string, x: number, y: number, now = Date.now()): void {
  h.setPoseForTest(session, { x, y, d: 0, m: 0 }, now);
}

function standAtSpot(h: HouseLogic, session: string, spotId: string, now = Date.now()): { x: number; y: number } {
  const p = beside(spotId);
  stand(h, session, p.x, p.y, now);
  return p;
}

function winLog(h: HouseLogic) { return solvingLog(h.items!.puzzle); }

console.log('Server room logic');

test('first player is host; nicknames cleaned like the client', () => {
  const h = new HouseLogic('ABC234');
  h.join('a', { nickname: '  \u202eEvil\u200b   name  ' });
  h.join('b', { nickname: 42 });
  const s = h.snapshot();
  assert.equal(s.hostId, h.playerId('a'));
  assert.equal(s.players[0].nickname, 'Evil name');
  assert.equal(s.players[0].isHost, true);
  assert.equal(s.players[1].nickname, 'Player');
  h.join('c', { nickname: 'x'.repeat(5000) });
  assert.equal(pl(h, 'c').nickname.length, 16);
  assert.deepEqual(Object.keys(s.players[0]).sort(), ['away', 'colour', 'id', 'isHost', 'nickname', 'ready']);
});

test('colours are unique and server-enforced', () => {
  const h = room(2);
  const a = pl(h, 's0').colour, b = pl(h, 's1').colour;
  assert.notEqual(a, b);
  assert.deepEqual(h.setColour('s1', { colour: a }), { ok: false, error: 'colour-taken' });
  assert.equal(h.setColour('s1', { colour: 'gold' }).ok, false);
  assert.equal(h.setColour('s1', { colour: { $ne: 1 } }).ok, false);
  assert.equal(h.setColour('s1', { colour: 'pink' }).ok, true);
  assert.equal(pl(h, 's1').colour, 'pink');
  // a requested colour on join is honoured only when free
  const j = h.join('s2', { nickname: 'C', colour: 'pink' });
  assert.ok(j.ok);
  assert.notEqual(pl(h, 's2').colour, 'pink');
  const all = h.snapshot().players.map((p) => p.colour);
  assert.equal(new Set(all).size, all.length);
});

test('at most 8 players, each with a different colour', () => {
  const h = room(MAX_PLAYERS);
  assert.equal(MAX_PLAYERS, 8);
  assert.equal(h.canJoin(), 'full');
  assert.deepEqual(h.join('extra', { nickname: 'X' }), { ok: false, error: 'full' });
  assert.equal(new Set(h.snapshot().players.map((p) => p.colour)).size, PLAYER_COLOURS.length);
});

test('ready is per player and validated', () => {
  const h = room(2);
  assert.equal(h.setReady('s1', { ready: 'yes' }).ok, false);
  assert.equal(h.setReady('s1', { ready: true }).ok, true);
  assert.equal(pl(h, 's1').ready, true);
  assert.equal(pl(h, 's0').ready, true); // host counts as ready (R11)
  assert.equal(h.setReady('ghost', { ready: true }).ok, false);
});

test('settings, kick and start are host-only', () => {
  const h = room(3);
  assert.deepEqual(h.updateSettings('s1', { patch: { phantoms: 2 } }), { ok: false, error: 'not-host' });
  assert.deepEqual(h.kick('s1', { id: h.playerId('s2') }), { ok: false, error: 'not-host' });
  assert.deepEqual(h.start('s1'), { ok: false, error: 'not-host' });
  assert.equal(h.started, false);
  assert.equal(h.updateSettings('s0', { patch: { phantoms: 2 } }).ok, true);
  assert.equal(h.snapshot().settings.phantoms, 2);
});

test('settings are validated and clamped server-side', () => {
  const h = room(4); // 4 players: the Phantom cap (R11) is 3 = the setting's max
  const ph = SETTING_LIMITS.phantoms;
  assert.equal(h.updateSettings('s0', { patch: { phantoms: 99 } }).ok, true);
  assert.equal(h.snapshot().settings.phantoms, ph.max);
  assert.equal(h.updateSettings('s0', { patch: { phantoms: -5 } }).ok, true);
  assert.equal(h.snapshot().settings.phantoms, ph.min);
  for (const bad of [{ phantoms: 'x' }, { phantoms: NaN }, { phantoms: Infinity }, { drawerNoise: 'deafening' }, { evil: 1 }, {}]) {
    const before = JSON.stringify(h.snapshot().settings);
    assert.equal(h.updateSettings('s0', { patch: bad }).ok, false, JSON.stringify(bad));
    assert.equal(JSON.stringify(h.snapshot().settings), before);
  }
  assert.equal(h.updateSettings('s0', null).ok, false);
  assert.equal(h.updateSettings('s0', { patch: { drawerNoise: 'loud' } }).ok, true);
  assert.equal(h.snapshot().settings.drawerNoise, 'loud');
  // every numeric setting is clamped into its range
  for (const [k, def] of Object.entries(SETTING_LIMITS)) {
    if (!('min' in def)) continue;
    h.updateSettings('s0', { patch: { [k]: def.max * 100 } });
    assert.equal((h.snapshot().settings as any)[k], def.max, k);
    h.updateSettings('s0', { patch: { [k]: (DEFAULT_SETTINGS as any)[k] } });
  }
});

test('kick removes the player and returns its session; host cannot kick self', () => {
  const h = room(3);
  const target = h.playerId('s2')!;
  assert.deepEqual(h.kick('s0', { id: h.playerId('s0') }), { ok: false, error: 'cannot-kick-self' });
  assert.deepEqual(h.kick('s0', { id: target }), { ok: true, session: 's2' });
  assert.equal(h.snapshot().players.length, 2);
  assert.equal(h.playerId('s2'), undefined);
  assert.equal(h.setReady('s2', { ready: true }).ok, false); // kicked session can't act
  assert.equal(h.kick('s0', { id: 'nobody' }).ok, false);
  assert.equal(h.kick('s0', { id: 7 }).ok, false);
});

test('host migration when the host leaves', () => {
  const h = room(3);
  const next = h.playerId('s1');
  h.leave('s0');
  const s = h.snapshot();
  assert.equal(s.hostId, next);
  assert.equal(s.players.filter((p) => p.isHost).length, 1);
  assert.equal(h.updateSettings('s1', { patch: { phantoms: 3 } }).ok, true);
  assert.equal(h.start('s2').ok, false);
  assert.equal(h.start('s1').ok, true);
  h.leave('s1'); // migration also mid-game
  assert.equal(h.snapshot().hostId, h.playerId('s2'));
  h.leave('s2');
  assert.equal(h.snapshot().players.length, 0);
});

test('no joining once started; start only once', () => {
  const h = room(2);
  assert.equal(h.start('s0').ok, true);
  assert.equal(h.canJoin(), 'started');
  assert.deepEqual(h.join('late', {}), { ok: false, error: 'started' });
  assert.equal(h.start('s0').ok, false);
});


test('movement: only after start, validated, speed-sane, official spawn', () => {
  const h = room(2);
  assert.equal(h.move('s1', { x: 10, y: 10 }, 0), null); // lobby: dropped
  h.start('s0', 0);
  const spawn = h.poseForTest('s1');
  assert.ok(spawn, 'start() assigns an official spawn');
  assert.ok(Math.hypot(spawn!.x - 300, spawn!.y - 430) < 200, `spawn ${spawn!.x},${spawn!.y}`);
  for (const bad of [{ x: 'a', y: 1 }, { x: 1 }, { x: NaN, y: 0 }, { x: 1e9, y: 0 }, null, [1, 2]]) assert.equal(h.move('s1', bad, 0), null);
  const jump = h.move('s1', { x: 100, y: 100, d: 2, m: 1 }, 50);
  assert.ok(jump);
  assert.ok(Math.hypot(jump!.x - 100, jump!.y - 100) > 20, 'must not teleport to (100,100) in 50 ms');
  stand(h, 's1', 360, 435, 1000);
  const step = PLAYER_SPEED * 0.1;
  const mid = h.move('s1', { x: 360 + step, y: 435, d: 9, m: 'x' }, 1100)!;
  assert.ok(Math.abs(mid.x - (360 + step)) < 1, `x=${mid.x}`);
  assert.equal(h.move('s1', { x: mid.x, y: 435, d: 9 }, 1150)!.d, 0);
  const p = h.move('s1', { x: 5000, y: 435 }, 1250)!;
  const allowed = PLAYER_SPEED * 0.1 * SPEED_SLACK + SPEED_JITTER_PX;
  assert.ok(p.x - mid.x <= allowed + 0.2, `teleport x=${p.x} from ${mid.x}`);
  assert.ok(h.corrections >= 1);
  const q = h.move('s1', { x: -5000, y: 435 }, 60_000)!;
  assert.ok(p.x - q.x <= PLAYER_SPEED * MAX_ELAPSED_MS / 1000 * SPEED_SLACK + SPEED_JITTER_PX + 0.2);
  const dirty = h.takeDirtyPoses();
  assert.ok(dirty.length >= 1);
  assert.equal(h.takeDirtyPoses().length, 0);
});


test('reconnect places a free pose once, then speed-caps again', () => {
  const h = room(1);
  h.start('s0', 0);
  stand(h, 's0', 316, 430, 1000);
  const blockers = movementBlockers();
  let far = { x: 0, y: 0 };
  let found = false;
  for (let y = 160; y < 700 && !found; y += 20) {
    for (let x = 200; x < 1000; x += 20) {
      if (pointBlocked(x, y, blockers)) continue;
      if (Math.hypot(x - 316, y - 430) <= 400) continue;
      far = { x, y }; found = true; break;
    }
  }
  assert.ok(found, 'a walkable point more than a speed-cap away');
  // A drop before the match starts must not turn the first walk into a teleport.
  const early = room(1);
  early.drop('s0');
  early.reconnect('s0');
  early.start('s0', 0);
  const spawned = early.poseForTest('s0')!;
  const first = early.move('s0', { x: far.x, y: far.y, d: 2, m: 1 }, 100)!;
  const cap = PLAYER_SPEED * 0.1 * SPEED_SLACK + SPEED_JITTER_PX;
  assert.ok(Math.hypot(first.x - spawned.x, first.y - spawned.y) <= cap + 0.2, `lobby reconnect teleported to ${first.x},${first.y}`);

  h.drop('s0');
  assert.equal(h.reconnect('s0'), true);
  const placed = h.move('s0', { x: far.x, y: far.y, d: 2, m: 0 }, 8000)!;
  assert.equal(placed.x, far.x, 'return pose is where the phone is');
  assert.equal(placed.y, far.y);
  assert.equal(placed.d, 2);
  const back = h.move('s0', { x: 316, y: 430, d: 0, m: 1 }, 8100)!;
  assert.ok(Math.hypot(back.x - far.x, back.y - far.y) <= cap + 0.2, `second far pose crawled ${back.x},${back.y}`);
  h.drop('s0');
  h.reconnect('s0');
  const table = { x: 195, y: 394 };
  assert.equal(pointBlocked(table.x, table.y, blockers), true, 'car table centre is solid');
  const refused = h.move('s0', { x: table.x, y: table.y, d: 0, m: 0 }, 9000)!;
  assert.equal(pointBlocked(refused.x, refused.y, blockers), false, 'a blocked return pose is not accepted');
  assert.ok(Math.hypot(refused.x - table.x, refused.y - table.y) > 16, 'did not stand inside the table');
});

test('R15-4: a wall-crossing move is clamped, not accepted', () => {
  const h = room(1);
  h.start('s0', 0);
  stand(h, 's0', 360, 435, 1000);
  const before = h.poseForTest('s0')!;
  const hit = h.move('s0', { x: 360, y: 0, d: 0, m: 1 }, 2000)!;
  assert.ok(hit.y > 50, `must not pass through the north walls (y=${hit.y})`);
  assert.ok(hit.y <= before.y + 1);
  assert.equal(pointBlocked(hit.x, hit.y, movementBlockers()), false);
  assert.ok(h.corrections >= 1);
});

/** Phone steps at 60 Hz, reports at 12 Hz, rounded the way NetSync sends. */
function reportSlide(from: { x: number; y: number }, dirX: number, dirY: number): { x: number; y: number } {
  const step = integrateSlide(from, dirX, dirY, 1000 / 12);
  return { x: Math.round(step.x * 10) / 10, y: Math.round(step.y * 10) / 10 };
}

test('car table: the server keeps the slide the phone walked, including facing and walk', () => {
  const h = room(2);
  h.start('s0', 0);
  const spawn = h.poseForTest('s0')!;
  const table = houseLayout.furniture.find((f) => f.id === 'car_table')!;
  assert.ok(spawn.x >= table.x && spawn.x <= table.x + table.width, 'host slot sits under the car table');
  assert.ok(spawn.y > table.y + table.height, 'host slot is on the near side of the table');

  // Stick straight into the table: stop on the near edge, still walking, still facing up.
  let pose = { x: spawn.x, y: spawn.y };
  let now = 0;
  for (let i = 0; i < 8; i++) {
    const sent = reportSlide(pose, 0, -1);
    now += 1000 / 12;
    const got = h.move('s0', { x: sent.x, y: sent.y, d: 3, m: 1 }, now)!;
    assert.ok(Math.hypot(got.x - sent.x, got.y - sent.y) < 0.05, `into table tick ${i}: server ${got.x},${got.y} vs phone ${sent.x},${sent.y}`);
    assert.equal(got.d, 3);
    assert.equal(got.m, 1);
    assert.equal(pointBlocked(got.x, got.y, movementBlockers()), false);
    pose = got;
  }
  const contact = table.y + table.height + PLAYER_BODY_RADIUS;
  assert.ok(Math.abs(pose.y - contact) < 1, `rests under the table, y=${pose.y} contact=${contact}`);
  assert.ok(Math.abs(pose.x - spawn.x) < 1, `straight up does not drift along the table, x=${pose.x}`);
  assert.ok(pose.y > table.y + table.height, 'does not tunnel through the table');

  // Stick up and to the right: slide along the table instead of sticking on the chord.
  h.setPoseForTest('s0', { x: spawn.x, y: spawn.y, d: 0, m: 0 }, now);
  pose = { x: spawn.x, y: spawn.y };
  for (let i = 0; i < 8; i++) {
    const sent = reportSlide(pose, 0.4, -1);
    now += 1000 / 12;
    const got = h.move('s0', { x: sent.x, y: sent.y, d: 3, m: 1 }, now)!;
    assert.ok(Math.hypot(got.x - sent.x, got.y - sent.y) < 0.05, `along table tick ${i}: server ${got.x},${got.y} vs phone ${sent.x},${sent.y}`);
    assert.equal(got.d, 3, 'facing stays the stick (up), not the slide axis');
    assert.equal(got.m, 1, 'still walking while sliding');
    assert.equal(pointBlocked(got.x, got.y, movementBlockers()), false);
    pose = got;
  }
  assert.ok(pose.x > spawn.x + 40, `slid along the table, x=${pose.x} from ${spawn.x}`);
});

test('a wall slide keeps the free axis and a hiding spot stays solid', () => {
  const h = room(1);
  h.start('s0', 0);
  stand(h, 's0', 200, 450, 1000);
  let pose = { x: 200, y: 450 };
  let now = 1000;
  for (let i = 0; i < 6; i++) {
    const sent = reportSlide(pose, -1, -0.25);
    now += 1000 / 12;
    const got = h.move('s0', { x: sent.x, y: sent.y, d: 1, m: 1 }, now)!;
    assert.ok(Math.hypot(got.x - sent.x, got.y - sent.y) < 0.05, `wall tick ${i}: server ${got.x},${got.y} vs phone ${sent.x},${sent.y}`);
    assert.equal(got.m, 1);
    assert.equal(pointBlocked(got.x, got.y, movementBlockers()), false);
    pose = got;
  }
  assert.ok(pose.x < 190, `moved left onto the entrance wall, x=${pose.x}`);
  assert.ok(pose.y < 440, `slid up the wall, y=${pose.y}`);

  const sofa = houseLayout.hidingSpots.find((s) => s.id === 'sofa')!;
  const y = sofa.y + sofa.height / 2;
  const fromX = sofa.x + sofa.width + PLAYER_BODY_RADIUS + 20;
  stand(h, 's0', fromX, y, now);
  assert.equal(pointBlocked(fromX, y, movementBlockers()), false, 'start beside the sofa, not inside it');
  const through = h.move('s0', { x: sofa.x - 40, y, d: 1, m: 1 }, now + 1000)!;
  assert.ok(through.x >= sofa.x + sofa.width + PLAYER_BODY_RADIUS - 1, `sofa did not stop the chord, x=${through.x}`);
  assert.equal(pointBlocked(through.x, through.y, movementBlockers()), false);
});

test('a stall then one pose through the foyer is not stuck on the sideboard', () => {
  const h = room(1);
  h.start('s0', 0);
  const start = { x: 700, y: 380 };
  stand(h, 's0', start.x, start.y, 0);
  assert.equal(pointBlocked(start.x, start.y, movementBlockers()), false, 'start is open floor');
  const goal = { x: 900, y: 265 };
  let phone = { ...start };
  const samples: { x: number; y: number }[] = [];
  for (let i = 0; i < 40 && Math.hypot(goal.x - phone.x, goal.y - phone.y) > 8; i++) {
    const stepped = integrateSlide(phone, goal.x - phone.x, goal.y - phone.y, 1000 / 12);
    phone = { x: Math.round(stepped.x * 10) / 10, y: Math.round(stepped.y * 10) / 10 };
    samples.push({ ...phone });
  }
  assert.ok(phone.x > 840, `phone walks through the foyer, x=${phone.x} y=${phone.y}`);
  assert.equal(pointBlocked(phone.x, phone.y, movementBlockers()), false);

  // The backlog keeps only the newest pose. One second of budget must land on it,
  // not on the sideboard face (x ≈ 744) the shortened chord used to creep along.
  const got = h.move('s0', { x: phone.x, y: phone.y, d: 2, m: 1 }, 1000)!;
  assert.ok(Math.hypot(got.x - phone.x, got.y - phone.y) < 1, `server ${got.x},${got.y} phone ${phone.x},${phone.y}`);
  assert.equal(got.d, 2);
  assert.equal(got.m, 1);
  assert.equal(pointBlocked(got.x, got.y, movementBlockers()), false);
  assert.ok(got.x > 840, `stuck beside the foyer at x=${got.x}`);

  // The same walk delivered as one millisecond of samples still ends on the phone.
  stand(h, 's0', start.x, start.y, 2000);
  let burst = { x: start.x, y: start.y, d: 0, m: 0 };
  for (const s of samples) burst = h.move('s0', { x: s.x, y: s.y, d: 3, m: 1 }, 3000)!;
  assert.ok(Math.hypot(burst.x - phone.x, burst.y - phone.y) < 1, `burst server ${burst.x},${burst.y} phone ${phone.x},${phone.y}`);
  assert.equal(burst.d, 3);
  assert.equal(burst.m, 1);
  assert.equal(pointBlocked(burst.x, burst.y, movementBlockers()), false);
});

test('living-room/foyer mouth and kitchen entry keep shared slide at walk speed', () => {
  const h = room(1);
  h.start('s0', 0);
  const routes = [
    { start: { x: 760, y: 295 }, goal: { x: 1000, y: 450 }, label: 'foyer mouth' },
    { start: { x: 820, y: 270 }, goal: { x: 950, y: 400 }, label: 'foyer to kitchen' },
    { start: { x: 860, y: 330 }, goal: { x: 1000, y: 500 }, label: 'kitchen' },
  ];
  const tick = 1000 / 12;
  let now = 0;
  for (const route of routes) {
    stand(h, 's0', route.start.x, route.start.y, now);
    let pose = { ...route.start };
    let still = 0;
    for (let i = 0; i < 100 && Math.hypot(route.goal.x - pose.x, route.goal.y - pose.y) > 12; i++) {
      const dx = route.goal.x - pose.x;
      const dy = route.goal.y - pose.y;
      const sent = reportSlide(pose, dx, dy);
      now += tick;
      const got = h.move('s0', { x: sent.x, y: sent.y, d: 2, m: 1 }, now)!;
      assert.ok(Math.hypot(got.x - sent.x, got.y - sent.y) < 0.15, `${route.label} tick ${i}: server agreed`);
      assert.equal(pointBlocked(got.x, got.y, movementBlockers()), false, `${route.label} lands in free space`);
      still = got.x === pose.x && got.y === pose.y ? still + 1 : 0;
      assert.ok(still < 8, `${route.label} frozen at ${got.x},${got.y}`);
      pose = { x: got.x, y: got.y };
    }
    assert.ok(
      Math.hypot(route.goal.x - pose.x, route.goal.y - pose.y) < 12,
      `${route.label} reached the goal, at ${pose.x},${pose.y}`,
    );
  }
  const table = houseLayout.furniture.find((f) => f.id === 'car_table')!;
  const along = { x: 228, y: table.y + table.height + 20 };
  stand(h, 's0', along.x, along.y, now);
  let slidePose = { ...along };
  const tickDist: number[] = [];
  for (let i = 0; i < 10; i++) {
    const before = { ...slidePose };
    const sent = reportSlide(slidePose, 0.4, -1);
    now += tick;
    slidePose = h.move('s0', { x: sent.x, y: sent.y, d: 3, m: 1 }, now)!;
    tickDist.push(Math.hypot(slidePose.x - before.x, slidePose.y - before.y));
  }
  assert.ok(
    tickDist[0] >= 12 && tickDist[1] >= 12 && tickDist[2] >= 12,
    `car-table slide keeps walk speed: ${tickDist.slice(0, 4).join(', ')}`,
  );
});


test('spots: unknown ids refused; open/close needs reach and line of sight', () => {
  const h = room(2);
  assert.equal(h.setSpot('s0', { id: 'sofa_d1', open: true }), null); // lobby: dropped
  h.start('s0', 0);
  assert.equal(h.setSpot('s1', { id: 'kitchen_d1', open: true }), null, 'unknown id');
  assert.equal(h.setSpot('s0', { id: '<img onerror>', open: true }), null);
  assert.equal(h.setSpot('s0', { id: 'x'.repeat(100), open: true }), null);
  assert.equal(h.setSpot('s0', { id: 'bed', open: 1 }), null);
  assert.equal(h.setSpot('ghost', { id: 'bed', open: true }), null);
  assert.equal(h.setSpot('s0', { id: 'fridge', open: true }), null, 'too far / no LOS');
  standAtSpot(h, 's0', 'sofa_d1', 2000);
  const opened = h.setSpot('s0', { id: 'sofa_d1', open: true });
  assert.deepEqual(opened, { id: 'sofa_d1', open: true, by: h.playerId('s0') });
  assert.equal(h.setSpot('s0', { id: 'sofa_d1', open: true }), null);
  assert.deepEqual(h.openSpots(), ['sofa_d1']);
  h.setSpot('s0', { id: 'sofa_d1', open: false });
  assert.deepEqual(h.openSpots(), []);
  for (let i = 0; i < 300; i++) h.setSpot('s0', { id: `d${i}`, open: true });
  assert.equal(h.openSpots().length, 0, 'fake ids never accumulate');
  standAtSpot(h, 's0', 'sofa_d1', 2500);
  assert.ok(h.setSpot('s0', { id: 'sofa_d1', open: true }));
  stand(h, 's0', 316, 430, 3000);
  assert.equal(h.setSpot('s0', { id: 'sofa_d1', open: false }), null, 'too far to close');
  assert.equal(h.isSpotOpen('sofa_d1'), true);
  assert.deepEqual(h.spotCorrection({ id: 'sofa_d1', open: false }), { id: 'sofa_d1', open: true });
  assert.equal(h.spotCorrection({ id: 'sofa_d1', open: true }), null, 'already the server flag');
  assert.equal(h.spotCorrection({ id: 'not_a_spot', open: true }), null);
  assert.equal(h.spotCorrection({ id: 'sofa_d1' }), null);
});

test('rate limiter: burst then sustained rate', () => {
  const r = new RateLimiter(10, 5, 0);
  let ok = 0; for (let i = 0; i < 20; i++) if (r.take(0)) ok++;
  assert.equal(ok, 5);
  assert.equal(r.take(50), false);
  assert.equal(r.take(150), true);
});

test('join options and origins', () => {
  assert.deepEqual(parse.join({ nickname: 'Ana', colour: 'violet' }), { nickname: 'Ana', colour: 'violet' });
  assert.deepEqual(parse.join({ colour: 'mauve' }), { nickname: 'Player', colour: undefined });
  assert.ok(originAllowed('https://hriday-shah.github.io'));
  assert.ok(originAllowed('http://localhost:5173'));
  assert.ok(originAllowed('http://127.0.0.1:4173'));
  assert.ok(originAllowed(undefined));
  assert.ok(!originAllowed('https://evil.example'));
  assert.ok(!originAllowed('https://hriday-shah.github.io.evil.example'));
  assert.ok(!originAllowed('http://localhost.evil.example'));
  const only = parseOrigins('https://a.example, https://b.example/');
  assert.ok(originAllowed('https://b.example', only));
  assert.ok(!originAllowed('http://localhost:5173', only), 'no localhost unless listed');
  assert.ok(originAllowed('http://localhost:5173', parseOrigins('https://a.example,localhost')));
  assert.ok(originAllowed('https://hriday-shah.github.io', parseOrigins('')), 'empty -> default');
});

test('R11: host always counts as ready (also after migration)', () => {
  const h = room(3);
  assert.equal(pl(h, 's0').ready, true);
  assert.equal(h.setReady('s0', { ready: false }).ok, true);
  assert.equal(pl(h, 's0').ready, true);
  assert.equal(pl(h, 's1').ready, false);
  h.leave('s0');
  assert.equal(pl(h, 's1').ready, true, 'new host is ready');
  assert.equal(pl(h, 's2').ready, false);
});

test('R11: Phantoms capped at max(1, players - 1)', () => {
  assert.deepEqual([1, 2, 3, 4, 8].map(maxPhantoms), [1, 1, 2, 3, 3]); // client rule, also <= setting max
  const h = room(1);
  h.updateSettings('s0', { patch: { phantoms: 3 } });
  assert.equal(h.snapshot().settings.phantoms, 1, 'alone: 1');
  h.join('s1', {}); h.join('s2', {});
  h.updateSettings('s0', { patch: { phantoms: 3 } });
  assert.equal(h.snapshot().settings.phantoms, 2, '3 players: 2');
  h.join('s3', {});
  h.updateSettings('s0', { patch: { phantoms: 3 } });
  assert.equal(h.snapshot().settings.phantoms, 3);
  h.leave('s3'); h.leave('s2');
  assert.equal(h.snapshot().settings.phantoms, 1, 'players leaving lower it');
  h.join('s4', {}); h.kick('s0', { id: h.playerId('s4') });
  assert.equal(h.snapshot().settings.phantoms, 1);
});

test('stage 2: a drop keeps seat, colour and host; others see it as away', () => {
  const h = room(3);
  h.setColour('s1', { colour: 'pink' });
  h.setReady('s1', { ready: true });
  assert.equal(h.drop('s0'), true);
  assert.equal(h.drop('ghost'), false);
  let s = h.snapshot();
  assert.equal(s.hostId, h.playerId('s0'), 'host kept while reconnecting');
  assert.deepEqual(s.players.map((p) => p.away), [true, false, false]);
  assert.equal(h.canJoin(), null);
  h.drop('s1');
  assert.equal(h.setColour('s2', { colour: 'pink' }).ok, false, 'colour still held');
  assert.equal(h.reconnect('s1'), true);
  assert.equal(pl(h, 's1').colour, 'pink'); assert.equal(pl(h, 's1').ready, true); assert.equal((pl(h, 's1') as any).away, false);
  assert.equal(h.reconnect('s0'), true);
  s = h.snapshot();
  assert.equal(s.hostId, h.playerId('s0'));
  assert.ok(s.players.every((p) => !p.away));
});

test('stage 2: reconnection window runs out -> removed, host migrates; kicked while away -> no way back', () => {
  const h = room(3);
  h.start('s0');
  h.drop('s0');
  h.leave('s0'); // window ran out
  assert.equal(h.snapshot().hostId, h.playerId('s1'));
  assert.equal(h.snapshot().players.length, 2);
  h.drop('s2');
  assert.equal(h.kick('s1', { id: h.playerId('s2') }).ok, true);
  assert.equal(h.reconnect('s2'), false);
  assert.equal(h.snapshot().players.length, 1);
  assert.equal(h.canJoin(), 'started', 'new players still refused mid-game');
});


test('stage 2: spot state (sofa, bed, drawers) for a returning player; away players cannot act', () => {
  const h = room(2);
  h.start('s0', 0);
  standAtSpot(h, 's0', 'sofa_d1', 1000);
  assert.ok(h.setSpot('s0', { id: 'sofa_d1', open: true }));
  standAtSpot(h, 's0', 'bed', 2000);
  assert.ok(h.setSpot('s0', { id: 'bed', open: true }));
  standAtSpot(h, 's0', 'stove_drawers_d2', 3000);
  assert.ok(h.setSpot('s0', { id: 'stove_drawers_d2', open: true }));
  h.drop('s1');
  standAtSpot(h, 's1', 'fridge', 4000);
  assert.equal(h.setSpot('s1', { id: 'fridge', open: true }), null, 'away: ignored');
  standAtSpot(h, 's0', 'bed', 5000);
  h.setSpot('s0', { id: 'bed', open: false });
  h.reconnect('s1');
  assert.deepEqual(h.openSpots().sort(), ['sofa_d1', 'stove_drawers_d2']);
  standAtSpot(h, 's1', 'fridge', 6000);
  assert.ok(h.setSpot('s1', { id: 'fridge', open: true }));
});

test('starting a room hides the controller; the public view omits it and the code is not the room-code seed', () => {
  const a = room(2); const b = room(2);
  assert.equal(a.start('s0').ok, true);
  assert.equal(b.start('s0').ok, true);
  const ra = a.roundPublic()!, rb = b.roundPublic()!;
  assert.equal('code' in ra, false);
  assert.equal(ra.items.length, 0, 'hidden controller must not be in the public snapshot');
  assert.ok(a.items);
  assert.equal(a.items.items[0].kind, 'game_controller');
  assert.ok(a.items.items[0].spotId);
  const fromCode = createRound('ABC234', 1);
  // Server-only randomness: must not match the offline/room-code seed (R14-3).
  const sameA = fromCode.items[0]!.spotId === a.items.items[0]!.spotId && fromCode.minigame === a.items.minigame;
  const sameB = fromCode.items[0]!.spotId === b.items!.items[0]!.spotId && fromCode.minigame === b.items!.minigame;
  assert.equal(sameA && sameB && a.items.code.join() === fromCode.code.join() && b.items!.code.join() === fromCode.code.join(), false);
});


test('pickup, TV minigame, private code reveal, controller is not consumed', () => {
  const h = room(2);
  assert.equal(h.start('s0').ok, true);
  // R15-8: pin the controller far from the TV so startMinigame fails before walking there.
  h.items!.placeControllerForTest('study_drawer_1');
  const item = h.items!.items[0]!;
  const spot = item.spotId!;
  assert.equal(spot, 'study_drawer_1');
  standAtSpot(h, 's0', spot, Date.now());
  assert.equal(h.setSpot('s0', { id: spot, open: true })?.open, true);
  assert.equal(h.roundPublic()!.items.length, 0, 'round snapshot never carries spot contents');
  assert.equal(h.itemListFor(h.playerId('s0')!).length, 1, 'opener sees the controller');
  assert.equal(h.pickup('s0', { id: item.id }).ok, true);
  assert.equal(h.itemListFor(h.playerId('s0')!)[0].heldBy, h.playerId('s0'));
  assert.equal(h.startMinigame('s0').ok, false, 'must fail before walking to the TV');
  stand(h, 's0', 750, 165, Date.now() + 500);
  const startAt = Date.now();
  const start = h.startMinigame('s0', startAt);
  assert.equal(start.ok, true, start.error);
  assert.ok(start.puzzle, 'server sends a play view');
  const tooFast = h.winMinigame('s0', startAt + 50, winLog(h));
  assert.equal(tooFast.ok, false);
  assert.equal(tooFast.error, 'too-fast');
  const empty = h.winMinigame('s0', startAt + MIN_WIN_MS[h.items!.minigame] + 20, []);
  assert.equal(empty.ok, false, 'zero-input log must be rejected');
  const win = h.winMinigame('s0', startAt + MIN_WIN_MS[h.items!.minigame] + 20, winLog(h));
  assert.equal(win.ok, true, win.error);
  assert.ok(win.code);
  assert.equal(h.itemListFor(h.playerId('s0')!)[0].heldBy, h.playerId('s0'), 'controller kept');
  assert.equal(h.items!.knowsCode(h.playerId('s0')!), true);
  assert.equal(h.items!.knowsCode(h.playerId('s1')!), false);
  assert.equal(h.startMinigame('s0').ok, true);
});


test('anti-cheat: win without a start is rejected; a second win needs a new start', () => {
  const h = room(2);
  assert.equal(h.start('s0').ok, true);
  h.items!.placeControllerForTest('study_drawer_1');
  const item = h.items!.items[0]!;
  standAtSpot(h, 's0', item.spotId!, Date.now());
  h.setSpot('s0', { id: item.spotId!, open: true });
  assert.equal(h.pickup('s0', { id: item.id }).ok, true);
  stand(h, 's0', 750, 165, Date.now() + 1000);
  const now = Date.now() + 2000;
  assert.equal(h.winMinigame('s0', now, winLog(h)).ok, false);
  assert.equal(h.winMinigame('s0', now, winLog(h)).error, 'no-start');
  const t0 = now + 10;
  assert.equal(h.startMinigame('s0', t0).ok, true);
  const ok = h.winMinigame('s0', t0 + MIN_WIN_MS[h.items!.minigame] + 20, winLog(h));
  assert.equal(ok.ok, true, ok.error);
  const again = h.winMinigame('s0', t0 + MIN_WIN_MS[h.items!.minigame] + 40, winLog(h));
  assert.equal(again.ok, false);
  assert.equal(again.error, 'no-start');
});


test('anti-cheat: itemDrop is limited to reach and to open floor or open spots, not the closed bed', () => {
  const h = room(2);
  assert.equal(h.start('s0').ok, true);
  h.items!.placeControllerForTest('study_drawer_1');
  const item = h.items!.items[0]!;
  const t0 = Date.now();
  standAtSpot(h, 's0', item.spotId!, t0);
  h.setSpot('s0', { id: item.spotId!, open: true });
  assert.equal(h.pickup('s0', { id: item.id }).ok, true);
  stand(h, 's0', 750, 165, t0 + 1000);
  const pose = h.poseForTest('s0')!;
  const far = h.dropItem('s0', { x: -500, y: 99999, spotId: 'bed' });
  assert.equal(far.ok, false, 'closed bed across the house must be rejected');
  const floor = h.dropItem('s0', { x: pose.x + 10, y: pose.y + 10, spotId: null });
  assert.equal(floor.ok, true, floor.error);
  const dropped = h.items!.items[0]!;
  assert.equal(dropped.heldBy, null);
  assert.equal(dropped.spotId, null);
  stand(h, 's1', dropped.x, dropped.y + 20, t0 + 2000);
  const got = h.pickup('s1', { id: dropped.id });
  assert.equal(got.ok, true, got.error);
  assert.equal(h.itemListFor(h.playerId('s1')!).find((i) => i.id === dropped.id)?.heldBy, h.playerId('s1'));
});


test('a disconnect drop leaves the controller on the floor, pick-up-able by someone else', () => {
  const h = room(2);
  assert.equal(h.start('s0').ok, true);
  h.items!.placeControllerForTest('study_drawer_1');
  const item = h.items!.items[0]!;
  const t0 = Date.now();
  standAtSpot(h, 's0', item.spotId!, t0);
  h.setSpot('s0', { id: item.spotId!, open: true });
  assert.equal(h.pickup('s0', { id: item.id }).ok, true);
  stand(h, 's0', 600, 420, t0 + 1000);
  h.leave('s0');
  const floor = h.items!.items[0]!;
  assert.equal(floor.heldBy, null);
  assert.equal(floor.spotId, null);
  stand(h, 's1', floor.x - 15, floor.y, t0 + 2000);
  const got = h.pickup('s1', { id: floor.id });
  assert.equal(got.ok, true, got.error);
});


test('R15-1: paper code and controller spot do not depend on gameSeed', () => {
  const seed = 0xC0FFEE;
  const secrets = new Set<string>();
  for (let i = 0; i < 80; i++) {
    const r = createServerRoundFrom(seed, randomBytes(16).toString('hex'));
    assert.equal(r.gameSeed, seed);
    secrets.add(`${r.code.join()}:${r.items[0]!.spotId}`);
  }
  assert.ok(secrets.size >= 50, `same gameSeed produced only ${secrets.size} distinct secrets`);
  const rooms = new Set<string>();
  for (let i = 0; i < 60; i++) {
    const h = room(1);
    assert.ok(h.start('s0').ok);
    rooms.add(`${h.items!.gameSeed}:${h.items!.code.join()}:${h.items!.items[0]!.spotId}`);
  }
  assert.equal(rooms.size, 60, '60 rooms should not collide on seed+secrets');
});

test('R15-2: a win must replay; empty and forged logs are rejected', () => {
  const h = room(1);
  h.start('s0');
  h.items!.placeControllerForTest('study_drawer_1');
  standAtSpot(h, 's0', 'study_drawer_1');
  h.setSpot('s0', { id: 'study_drawer_1', open: true });
  assert.ok(h.pickup('s0', { id: h.items!.items[0]!.id }).ok);
  stand(h, 's0', 750, 165);
  const t0 = 10_000;
  assert.ok(h.startMinigame('s0', t0).ok);
  const min = MIN_WIN_MS[h.items!.minigame] + 20;
  assert.equal(h.winMinigame('s0', t0 + min, []).error, 'no-play');
  assert.equal(h.winMinigame('s0', t0 + min, [{ t: 0, action: { type: 'confirm' } }]).ok, false);
  const log = winLog(h);
  assert.ok(log.length > 0);
  assert.equal(replayWin(h.items!.puzzle, log).ok, true);
  const win = h.winMinigame('s0', t0 + min, log);
  assert.equal(win.ok, true, win.error);
});

test('R15-3: spot contents go only to the opener or to players who can see the spot', () => {
  const h = room(2);
  h.start('s0', 0);
  h.items!.placeControllerForTest('study_drawer_1');
  standAtSpot(h, 's0', 'study_drawer_1', 1000);
  assert.ok(h.setSpot('s0', { id: 'study_drawer_1', open: true }));
  const opener = h.itemListFor(h.playerId('s0')!);
  assert.equal(opener.length, 1);
  assert.equal(opener[0]!.spotId, 'study_drawer_1');
  // Other player stays at the entrance spawn — a wall blocks the study.
  const other = h.itemListFor(h.playerId('s1')!);
  assert.equal(other.length, 0, 'remote player must not receive hidden contents');
  // Walk the other player beside the open spot: they can now see it.
  standAtSpot(h, 's1', 'study_drawer_1', 2000);
  assert.equal(h.itemListFor(h.playerId('s1')!).length, 1);
});

test('R15-10: clamping a far drop to reach must not go through a wall', () => {
  const origin = { x: 360, y: 435 };
  const dest = { x: 360, y: 40 }; // north, through walls
  const c = clampDrop(origin, dest, 90, losBlockers());
  assert.ok(c.y > 100, `drop must stop before the wall (y=${c.y})`);
  // And still within reach.
  assert.ok(Math.hypot(c.x - origin.x, c.y - origin.y) <= 90 + 0.5);
  const h = room(1);
  h.start('s0', 0);
  h.items!.placeControllerForTest('study_drawer_1');
  standAtSpot(h, 's0', 'study_drawer_1', 1000);
  h.setSpot('s0', { id: 'study_drawer_1', open: true });
  assert.ok(h.pickup('s0', { id: h.items!.items[0]!.id }).ok);
  stand(h, 's0', 360, 435, 2000);
  const r = h.dropItem('s0', { x: 360, y: 40, spotId: null });
  assert.equal(r.ok, true, r.error);
  const dropped = h.items!.items[0]!;
  assert.ok(dropped.y > 100, `server drop y=${dropped.y}`);
});

console.log(`\n✅ ${n} server tests passed`);
