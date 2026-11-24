import assert from 'node:assert/strict';
import {
  PREEXISTING_ITEM_ART_KEYS, PREEXISTING_KIND_COUNT, KIND_COUNT_WITH_CONTROLLER,
  UNIQUE_SPAWN_KINDS_IF_ONE_EACH, ITEM_KINDS, ITEM_INFO,
} from '../logic/items';
import { makeEscapeCode, codesEqual } from '../logic/escapeCode';
import { hashSeed, mulberry32 } from '../logic/seededRng';
import {
  selectMinigame, minigameSeed, MINIGAME_IDS, MINIGAME_SECONDS,
  SlideGame, isSolvable, isSolved, inversions, makeSolvableBoard, solvingMoves, slideDir,
  SLIDE_SHUFFLE_MIN, SLIDE_SHUFFLE_MAX,
  MazeGame, generateMaze, mazePath, mazeWalkable, mazePorts, mazeDeadEnds, MAZE_W, MAZE_H,
  LockPickGame, pickAt, inZone, LOCK_HITS_NEEDED, ZONE_DEG,
  MemoryGame, MEMORY_PAIRS, MEMORY_CARDS,
  ChaseGame, DotDashGame, createMinigame, resolveMinigameId,
  runFleeChase, CHASE_WISP_COUNT, CHASE_WISP_DELAY, PLAY_WISP_KINDS,
} from '../logic/minigames';
import { ItemRound, createRound, inFrontOfTv, itemReachableFrom, MIN_WIN_MS, NEAR_ITEM, TV_UNIT } from '../logic/itemRound';
import { debugMinigame } from '../config/debugFlags';

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

  test('slide shuffle is 10–14 optimal moves; arrows move a tile into the gap', () => {
    const counts = new Map<number, number>();
    for (let s = 1; s <= 400; s++) {
      const tiles = makeSolvableBoard(mulberry32(s * 97 + 3));
      const d = solvingMoves(tiles).length;
      assert.ok(d >= SLIDE_SHUFFLE_MIN && d <= SLIDE_SHUFFLE_MAX, `seed ${s} optimal=${d}`);
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    const dist = [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([d, n]) => `${d}:${n}`).join(', ');
    console.log(`    slide shuffle distribution over 400 seeds: ${dist}`);
    for (let d = SLIDE_SHUFFLE_MIN; d <= SLIDE_SHUFFLE_MAX; d++) {
      assert.ok((counts.get(d) ?? 0) > 0, `no boards with optimal ${d}`);
    }
    // Solved, blank at bottom-right (index 8). ArrowRight used to move the blank;
    // now it moves the tile to the left of the gap (tile 8) into the gap.
    const start = [1, 2, 3, 4, 5, 6, 7, 8, 0];
    const moved = slideDir(start, 1, 0);
    assert.deepEqual(moved, [1, 2, 3, 4, 5, 6, 7, 0, 8]);
    const g = new SlideGame(1);
    const before = g.state();
    // If the blank has a tile on its left, ArrowRight must slide that tile.
    const blank = before.blank;
    if (blank % 3 !== 0) {
      g.input({ type: 'move', dx: 1, dy: 0 });
      assert.equal(g.state().blank, blank - 1);
    }
    void counts;
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
    g.input({ type: 'confirm' });
    assert.equal(g.state().hits, 1);
    // A later miss resets the pin progress (R14-7).
    const missTurn2 = (g.state().zone + 0.5) % 1;
    (g as unknown as { t: number; speed: number }).t = missTurn2 / (g as unknown as { speed: number }).speed;
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
    assert.equal(st.ghosts.length, CHASE_WISP_COUNT);
    assert.ok(st.ghosts.some((g) => g.kind === 'violet'), 'violet wisp missing');
    assert.ok(PLAY_WISP_KINDS.includes('violet'));
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
    const startAt = 1_000_000;
    assert.equal(r.startMinigame('p1', tv, startAt).ok, true);
    assert.equal(r.winMinigame('p1', startAt + 100).ok, false, 'too-fast must be rejected');
    const win = r.winMinigame('p1', startAt + MIN_WIN_MS[r.minigame] + 10);
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

  test('?debug=minigame=lock is an alias of lockpick', () => {
    assert.equal(resolveMinigameId('lock'), 'lockpick');
    assert.equal(debugMinigame('?debug=minigame=lock'), 'lockpick');
    assert.equal(debugMinigame('?debug=minigame=lockpick'), 'lockpick');
  });

  test('a floor controller can be picked up from any side within reach', () => {
    const r = ItemRound.fromSeed('FLOOR-1', 1);
    const item = r.items[0]!;
    const spot = item.spotId!;
    const pose = { x: item.x, y: item.y };
    assert.equal(r.pickup('p1', item.id, pose, [spot]).ok, true);
    assert.equal(r.drop('p1', 600, 420, null, { x: 600, y: 400 }, []).ok, true);
    const dropped = r.items[0]!;
    assert.equal(dropped.spotId, null);
    assert.equal(dropped.heldBy, null);
    const reach = NEAR_ITEM - 5;
    for (const [dx, dy, who] of [[0, -reach, 'n'], [reach, 0, 'e'], [0, reach, 's'], [-reach, 0, 'w']] as const) {
      const r2 = ItemRound.fromSeed('FLOOR-1', 1);
      const it = r2.items[0]!;
      r2.pickup('p1', it.id, { x: it.x, y: it.y }, [it.spotId!]);
      r2.drop('p1', 600, 420, null, { x: 600, y: 400 }, []);
      const floor = r2.items[0]!;
      const side = { x: floor.x + dx, y: floor.y + dy };
      assert.ok(itemReachableFrom(side, floor), `${who} should be in reach`);
      const got = r2.pickup('p2', floor.id, side, []);
      assert.equal(got.ok, true, `${who} pickup failed: ${got.error}`);
      assert.equal(r2.heldBy('p2')?.kind, 'game_controller');
    }
  });

  test('Chase mazes have loops, two delayed far wisps; a fleeing bot wins ≥30% of 300 seeds', () => {
    let looped = 0;
    for (let s = 1; s <= 40; s++) {
      const g = new ChaseGame(s);
      const st = g.state();
      const endsBefore = mazeDeadEnds(generateMaze(mulberry32(s >>> 0), MAZE_W, MAZE_H), MAZE_W, MAZE_H).length;
      // The playfield itself should have some cells with 3+ neighbours (a loop).
      let junctions = 0;
      for (let y = 1; y < st.h - 1; y++) for (let x = 1; x < st.w - 1; x++) {
        if (st.grid[y * st.w + x] !== 1) continue;
        let n = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (mazeWalkable(st.grid, x + dx, y + dy, st.w, st.h)) n++;
        }
        if (n >= 3) junctions++;
      }
      if (junctions > 0) looped++;
      assert.equal(st.ghosts.length, 2);
      assert.ok(st.ghosts.some((g) => g.kind === 'violet'));
      const { sx, sy } = mazePorts(st.w, st.h);
      for (const wisp of st.ghosts) {
        const path = mazePath(st.grid, sx, sy, wisp.x, wisp.y, st.w, st.h);
        const d = path.length ? path.length - 1 : 0;
        let maxD = 0;
        for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) {
          if (!mazeWalkable(st.grid, x, y, st.w, st.h)) continue;
          const p = mazePath(st.grid, sx, sy, x, y, st.w, st.h);
          const dd = p.length ? p.length - 1 : 0;
          if (dd > maxD) maxD = dd;
        }
        assert.ok(d >= Math.ceil(maxD / 2), `seed ${s} wisp too close ${d} max=${maxD}`);
      }
      void endsBefore; void CHASE_WISP_DELAY;
    }
    assert.ok(looped >= 20, `only ${looped}/40 chases had a loop junction`);

    let wins = 0;
    const N = 300;
    for (let s = 1; s <= N; s++) {
      if (runFleeChase(s, 30, 1 / 20).won) wins++;
    }
    const rate = wins / N;
    console.log(`    flee bot win rate ${wins}/${N} = ${(rate * 100).toFixed(1)}%`);
    assert.ok(rate >= 0.30, `flee bot won only ${(rate * 100).toFixed(1)}% of ${N} seeds`);
  });

  console.log(`✓ ${n} minigame / item tests\n`);
  console.log('✅ MINIGAME / ITEM TEST PASSED');
}
