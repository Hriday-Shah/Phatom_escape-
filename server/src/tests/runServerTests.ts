/** Server room-logic unit tests (npm test -w server). */
import assert from 'node:assert/strict';
import { HouseLogic, MAX_ELAPSED_MS, RateLimiter, SPEED_JITTER_PX, SPEED_SLACK, parse } from '../houseLogic';
import { DEFAULT_SETTINGS, MAX_PLAYERS, maxPhantoms, PLAYER_COLOURS, SETTING_LIMITS } from '../../../client/src/lobby/lobby';
import { PLAYER_SPEED } from '../../../client/src/config/physicsConfig';
import { originAllowed, parseOrigins } from '../origins';

let n = 0;
const test = (name: string, f: () => void) => { f(); n++; console.log(`  ✓ ${name}`); };

function room(players = 3): HouseLogic {
  const h = new HouseLogic('ABC234');
  for (let i = 0; i < players; i++) assert.ok(h.join(`s${i}`, { nickname: `P${i}` }).ok);
  return h;
}
const pl = (h: HouseLogic, s: string) => h.snapshot().players.find((p) => p.id === h.playerId(s))!;

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

test('movement: only after start, validated, speed-sane', () => {
  const h = room(2);
  assert.equal(h.move('s1', { x: 10, y: 10 }, 0), null); // lobby: dropped
  h.start('s0');
  for (const bad of [{ x: 'a', y: 1 }, { x: 1 }, { x: NaN, y: 0 }, { x: 1e9, y: 0 }, null, [1, 2]]) assert.equal(h.move('s1', bad, 0), null);
  assert.deepEqual(h.move('s1', { x: 100, y: 100, d: 2, m: 1 }, 1000), { x: 100, y: 100, d: 2, m: 1 });
  // a normal step is kept
  const step = PLAYER_SPEED * 0.1;
  assert.equal(h.move('s1', { x: 100 + step, y: 100, d: 9, m: 'x' }, 1100)!.x, 100 + step);
  assert.equal(h.move('s1', { x: 100 + step, y: 100, d: 9 }, 1150)!.d, 0); // bad d -> 0
  // a teleport is cut back to the allowed distance
  const p = h.move('s1', { x: 5000, y: 100 }, 1250)!;
  const allowed = PLAYER_SPEED * 0.1 * SPEED_SLACK + SPEED_JITTER_PX;
  assert.ok(Math.abs(p.x - (100 + step + allowed)) < 0.2, `x=${p.x}`);
  assert.equal(h.corrections, 1);
  // a long pause allows at most MAX_ELAPSED_MS worth of walking
  const q = h.move('s1', { x: -5000, y: 100 }, 60_000)!;
  assert.ok(p.x - q.x <= PLAYER_SPEED * MAX_ELAPSED_MS / 1000 * SPEED_SLACK + SPEED_JITTER_PX + 0.2);
  const dirty = h.takeDirtyPoses();
  assert.equal(dirty.length, 1);
  assert.equal(dirty[0][0], h.playerId('s1'));
  assert.equal(h.takeDirtyPoses().length, 0);
});

test('spots (drawers, sofa, bed...): validated, idempotent, synced state', () => {
  const h = room(2);
  assert.equal(h.setSpot('s0', { id: 'kitchen_d1', open: true }), null); // lobby: dropped
  h.start('s0');
  assert.deepEqual(h.setSpot('s1', { id: 'kitchen_d1', open: true }), { id: 'kitchen_d1', open: true, by: h.playerId('s1') });
  assert.equal(h.setSpot('s0', { id: 'kitchen_d1', open: true }), null); // no change
  assert.equal(h.setSpot('s0', { id: '<img onerror>', open: true }), null);
  assert.equal(h.setSpot('s0', { id: 'x'.repeat(100), open: true }), null);
  assert.equal(h.setSpot('s0', { id: 'bed', open: 1 }), null);
  assert.equal(h.setSpot('ghost', { id: 'bed', open: true }), null);
  assert.deepEqual(h.openSpots(), ['kitchen_d1']);
  h.setSpot('s0', { id: 'kitchen_d1', open: false });
  assert.deepEqual(h.openSpots(), []);
  for (let i = 0; i < 300; i++) h.setSpot('s0', { id: `d${i}`, open: true });
  assert.equal(h.openSpots().length, 255); // + kitchen_d1 (closed) = MAX_DRAWERS ids
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
  h.start('s0');
  h.setSpot('s0', { id: 'sofa_d1', open: true });
  h.setSpot('s0', { id: 'bed', open: true });
  h.setSpot('s0', { id: 'kitchen_drawers_d2', open: true });
  h.drop('s1');
  assert.equal(h.setSpot('s1', { id: 'fridge', open: true }), null, 'away: ignored');
  h.setSpot('s0', { id: 'bed', open: false }); // closed while s1 was away
  h.reconnect('s1');
  assert.deepEqual(h.openSpots().sort(), ['kitchen_drawers_d2', 'sofa_d1']);
  assert.ok(h.setSpot('s1', { id: 'fridge', open: true }));
});

test('starting a room chooses a mini-game and hides the controller, same seed each time', () => {
  const a = room(2); const b = room(2);
  // Both rooms use the same code 'ABC234' from room().
  assert.equal(a.start('s0').ok, true);
  assert.equal(b.start('s0').ok, true);
  const ra = a.roundPublic()!, rb = b.roundPublic()!;
  assert.equal(ra.minigame, rb.minigame);
  assert.equal(ra.gameSeed, rb.gameSeed);
  assert.equal(ra.items.length, 1);
  assert.equal(ra.items[0].kind, 'game_controller');
  assert.ok(ra.items[0].spotId);
  assert.equal('code' in ra, false);
  assert.notEqual(a.items!.code, undefined);
});

test('pickup, TV minigame, private code reveal, controller is not consumed', () => {
  const h = room(2);
  assert.equal(h.start('s0').ok, true);
  const item = h.roundPublic()!.items[0]!;
  const spot = item.spotId!;
  h.move('s0', { x: item.x, y: item.y, d: 0, m: 0 }, Date.now());
  assert.equal(h.setSpot('s0', { id: spot, open: true })?.open, true);
  assert.equal(h.pickup('s0', { id: item.id }).ok, true);
  assert.equal(h.itemList()[0].heldBy, h.playerId('s0'));
  // Not at the TV yet.
  assert.equal(h.startMinigame('s0').ok, false);
  h.move('s0', { x: 750, y: 165, d: 0, m: 0 }, Date.now() + 500);
  // Movement is speed-limited; step toward the TV over several updates if needed.
  let now = Date.now() + 500;
  for (let i = 0; i < 30; i++) {
    now += 200;
    h.move('s0', { x: 750, y: 165, d: 2, m: 1 }, now);
  }
  const pose = h.allPoses().find((p) => p[0] === h.playerId('s0'))!;
  // If still far, the start may fail; place a last acceptably close pose with a long dt.
  now += 1000;
  h.move('s0', { x: 750, y: 165, d: 2, m: 0 }, now);
  const start = h.startMinigame('s0');
  assert.equal(start.ok, true, `start at ${pose[1]},${pose[2]} -> ${start.error}`);
  const win = h.winMinigame('s0');
  assert.equal(win.ok, true);
  assert.ok(win.code);
  assert.equal(h.itemList()[0].heldBy, h.playerId('s0'), 'controller consumed');
  assert.equal(h.items!.knowsCode(h.playerId('s0')!), true);
  assert.equal(h.items!.knowsCode(h.playerId('s1')!), false);
  // Winner can retry (still holding it).
  assert.equal(h.startMinigame('s0').ok, true);
});

console.log(`\n✅ ${n} server tests passed`);
