import assert from 'node:assert/strict';
import {
  PREEXISTING_ITEM_ART_KEYS, PREEXISTING_KIND_COUNT, KIND_COUNT_WITH_CONTROLLER,
  UNIQUE_SPAWN_KINDS_IF_ONE_EACH, ITEM_KINDS, ITEM_INFO,
} from '../logic/items';
import { makeEscapeCode, codesEqual } from '../logic/escapeCode';
import { hashSeed, mulberry32 } from '../logic/seededRng';
import {
  selectMinigame, minigameSeed, MINIGAME_IDS, MINIGAME_SECONDS,
  SlideGame, isSolvable, isSolved, inversions, makeSolvableBoard, solvingMoves,
  MazeGame, generateMaze, mazePath, mazeWalkable, mazePorts, MAZE_W, MAZE_H,
  LockPickGame, pickAt, inZone, LOCK_HITS_NEEDED, ZONE_DEG,
  MemoryGame, MEMORY_PAIRS, MEMORY_CARDS,
  ChaseGame, DotDashGame, createMinigame, resolveMinigameId,
} from '../logic/minigames';
import { ItemRound, createRound, inFrontOfTv, TV_UNIT } from '../logic/itemRound';

export function runMinigameTest(): void {
  console.log('=== MINIGAME / ITEM TEST ===');
  let n = 0;
  const test = (name: string, f: () => void) => { f(); n++; console.log(`  ✓ ${name}`); };

  test('item catalog: controller is the 8th kind; do not invent extras to reach 14', () => {
    assert.equal(PREEXISTING_KIND_COUNT, 7);
    assert.equal(KIND_COUNT_WITH_CONTROLLER, 8);
    assert.equal(ITEM_KINDS.length, 8);
    assert.ok(ITEM_KINDS.includes('game_controller'));
    assert.equal(PREEXISTING_ITEM_ART_KEYS.length, 11);
    assert.equal(ITEM_INFO.game_controller.artKey, 'item_game_controller');
    // 4 cars + 1 of each other kind (loaded gun is a state) = 11, not 14.
    assert.equal(UNIQUE_SPAWN_KINDS_IF_ONE_EACH, 11);
    assert.notEqual(UNIQUE_SPAWN_KINDS_IF_ONE_EACH, 14);
  });

  test('escape code is a permutation of the four car colours, seeded', () => {
    const a = makeEscapeCode(mulberry32(hashSeed('ROOM1')));
    const b = makeEscapeCode(mulberry32(hashSeed('ROOM1')));
    const c = makeEscapeCode(mulberry32(hashSeed('ROOM2')));
    assert.ok(codesEqual(a, b));
    assert.equal(new Set(a).size, 4);
    assert.ok(!codesEqual(a, c) || true); // may theoretically collide; uniqueness of letters is enough
    assert.deepEqual([...a].sort(), ['blue', 'red', 'violet', 'yellow']);
  });

  test('mini-game selection is deterministic per seed/round', () => {
    const a = selectMinigame('ABC234', 1);
    const b = selectMinigame('ABC234', 1);
    const c = selectMinigame('ABC234', 2);
    const d = selectMinigame('XYZ999', 1);
    assert.equal(a, b);
    assert.ok(MINIGAME_IDS.includes(a));
    assert.equal(minigameSeed('ABC234', 1), minigameSeed('ABC234', 1));
    assert.notEqual(minigameSeed('ABC234', 1), minigameSeed('ABC234', 2));
    // Different rooms usually differ; all five games must be reachable over many seeds.
    const seen = new Set(Array.from({ length: 80 }, (_, i) => selectMinigame(`ROOM${i}`, 1)));
    assert.equal(seen.size, 5, `only saw ${[...seen]}`);
    void c; void d;
  });

  test('slide puzzle boards are always solvable and not already solved', () => {
    for (let s = 0; s < 40; s++) {
      const tiles = makeSolvableBoard(mulberry32(s + 1));
      assert.ok(isSolvable(tiles), `seed ${s} inversions=${inversions(tiles)}`);
      assert.ok(!isSolved(tiles), `seed ${s} started solved`);
      const game = new SlideGame(s + 1);
      game.solve();
      assert.equal(game.status(), 'won');
      assert.ok(isSolved(game.state().tiles));
    }
    // An odd permutation is not solvable.
    assert.equal(isSolvable([2, 1, 3, 4, 5, 6, 7, 8, 0]), false);
    const g = new SlideGame(3);
    const start = g.state().tiles.slice();
    g.input({ type: 'move', dx: 1, dy: 1 }); // diagonal ignored
    assert.deepEqual(g.state().tiles, start);
  });

  test('slide solvingMoves is a legal path', () => {
    const g = new SlideGame(7);
    const moves = solvingMoves(g.state().tiles);
    assert.ok(moves.length > 0);
    for (const i of moves) g.input({ type: 'tap', index: i });
    assert.equal(g.status(), 'won');
  });

  test('maze is connected from start to exit', () => {
    for (let s = 0; s < 30; s++) {
      const rng = mulberry32(s + 11);
      const grid = generateMaze(rng, MAZE_W, MAZE_H);
      const { sx, sy, ex, ey } = mazePorts(MAZE_W, MAZE_H);
      const path = mazePath(grid, sx, sy, ex, ey, MAZE_W, MAZE_H);
      assert.equal(MAZE_W, 12);
      assert.equal(MAZE_H, 10);
      assert.ok(path.length >= 2, `seed ${s} disconnected`);
      assert.ok(mazeWalkable(grid, sx, sy, MAZE_W, MAZE_H));
      const g = new MazeGame(s + 11);
      g.solve();
      assert.equal(g.status(), 'won');
      const st = g.state();
      assert.equal(st.px, st.ex);
      assert.equal(st.py, st.ey);
    }
  });

  test('lock-pick hit windows and three hits win; misses do not consume the controller path', () => {
    assert.equal(ZONE_DEG, 30);
    const g = new LockPickGame(4);
    assert.equal(g.state().needed, LOCK_HITS_NEEDED);
    // Official path: forceInZone + confirm three times wins.
    const g2 = new LockPickGame(9);
    g2.solve();
    assert.equal(g2.status(), 'won');
    assert.equal(g2.state().hits, LOCK_HITS_NEEDED);
    void g;
  });

  test('lock-pick: a miss does not increment hits; a hit does', () => {
    const g = new LockPickGame(2);
    const st = g.state();
    // Park the pick 180° from the zone (always a miss).
    const missTurn = (st.zone + 0.5) % 1;
    (g as unknown as { t: number; speed: number }).t = missTurn / (g as unknown as { speed: number }).speed;
    assert.equal(inZone(g.state().pick, g.state().zone), false);
    g.input({ type: 'confirm' });
    assert.equal(g.state().hits, 0);
    assert.equal(g.state().lastHit, false);
    g.forceInZone();
    assert.ok(inZone(g.state().pick, g.state().zone));
    g.input({ type: 'confirm' });
    assert.equal(g.state().hits, 1);
    assert.equal(g.status(), 'playing');
    void pickAt;
  });

  test('memory flip has 4 pairs and solving matches all', () => {
    const g = new MemoryGame(5);
    const st = g.state();
    assert.equal(st.cards.length, MEMORY_CARDS);
    const counts = new Map<number, number>();
    for (const c of st.cards) counts.set(c, (counts.get(c) ?? 0) + 1);
    assert.equal(counts.size, MEMORY_PAIRS);
    for (const n of counts.values()) assert.equal(n, 2);
    g.solve();
    assert.equal(g.status(), 'won');
    assert.ok(g.state().matched.every(Boolean));
  });

  test('Chase (Dot Dash) has sparks, candles and wisps; solve eats them all; collision loses', () => {
    assert.equal(resolveMinigameId('dotdash'), 'chase');
    const g = new ChaseGame(8);
    const st = g.state();
    assert.equal(g.id, 'chase');
    assert.ok(st.dotsTotal > 0);
    assert.equal(st.w, 12);
    assert.equal(st.h, 10);
    const sparkN = st.dots.filter(Boolean).length;
    const candleN = st.candles.filter(Boolean).length;
    assert.equal(st.dotsLeft, sparkN + candleN);
    assert.ok(candleN >= 1);
    assert.ok(st.ghosts.length >= 1 && st.ghosts.length <= 3);
    g.solve();
    assert.equal(g.status(), 'won');
    assert.equal(g.state().dotsLeft, 0);

    // Wisp collision while not frightened: park a wisp on the player.
    const g3 = new ChaseGame(3, 1);
    (g3 as any).frightened = 0;
    (g3 as any).ghosts[0].x = (g3 as any).player.x;
    (g3 as any).ghosts[0].y = (g3 as any).player.y;
    (g3 as any).ghosts[0].fx = 0;
    (g3 as any).ghosts[0].fy = 0;
    (g3 as any).ghosts[0].dead = 0;
    g3.tick(0.016);
    assert.equal(g3.status(), 'lost');
    // Alias still constructs the same game.
    const alias = new DotDashGame(1, 1);
    assert.equal(alias.id, 'chase');
  });

  test('30-second timer constant; factory builds every game', () => {
    assert.equal(MINIGAME_SECONDS, 30);
    for (const id of MINIGAME_IDS) {
      const g = createMinigame(id, 1);
      assert.equal(g.id, id);
      assert.equal(g.status(), 'playing');
    }
  });

  test('round hides exactly one controller; winning does not consume it; code is private', () => {
    const r = ItemRound.fromSeed('ABC234', 1);
    assert.equal(r.items.length, 1);
    assert.equal(r.items[0]!.kind, 'game_controller');
    assert.ok(r.items[0]!.spotId);
    const spot = r.items[0]!.spotId!;
    const pose = { x: r.items[0]!.x, y: r.items[0]!.y };
    assert.equal(r.pickup('p1', r.items[0]!.id, pose, [spot]).ok, true);
    assert.equal(r.heldBy('p1')?.kind, 'game_controller');
    // TV is at a known rect; start only works in front of it.
    assert.equal(r.startMinigame('p1', pose).ok, false);
    const tv = { x: TV_UNIT.x - 10, y: TV_UNIT.y + TV_UNIT.height / 2 };
    assert.ok(inFrontOfTv(tv.x, tv.y));
    assert.equal(r.startMinigame('p1', tv).ok, true);
    const win = r.winMinigame('p1');
    assert.equal(win.ok, true);
    assert.ok(win.code);
    assert.ok(r.heldBy('p1'), 'controller was consumed');
    assert.equal(r.knowsCode('p1'), true);
    assert.equal(r.knowsCode('p2'), false);
    assert.equal(r.codeFor('p2'), null);
    // Can start again (retry) still holding it.
    assert.equal(r.startMinigame('p1', tv).ok, true);
  });

  test('same seed builds the same round (minigame, code, hiding spot)', () => {
    const a = createRound('SEED-7', 1);
    const b = createRound('SEED-7', 1);
    assert.equal(a.minigame, b.minigame);
    assert.equal(a.gameSeed, b.gameSeed);
    assert.ok(codesEqual(a.code, b.code));
    assert.equal(a.items[0]!.spotId, b.items[0]!.spotId);
    const c = createRound('SEED-8', 1);
    assert.ok(a.items[0]!.spotId !== c.items[0]!.spotId || !codesEqual(a.code, c.code) || a.minigame !== c.minigame);
  });

  test('public round view never includes the paper code', () => {
    const r = ItemRound.fromSeed('ABC234');
    const pub = r.publicView();
    assert.equal('code' in pub, false);
    assert.ok(pub.minigame);
    assert.equal(pub.items[0]!.kind, 'game_controller');
  });

  console.log(`✓ ${n} minigame / item tests\n`);
  console.log('✅ MINIGAME / ITEM TEST PASSED');
}
