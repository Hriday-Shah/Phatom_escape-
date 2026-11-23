/**
 * CI containment test (QA R3-1): flood-fills the player's reachable positions by stepping
 * Phaser's REAL Arcade physics (see arcadeSim.ts) with the real body radius, overlap bias and
 * collider rects, and asserts that no reachable position is outside the house, and that the
 * locked bedroom is never entered.
 *
 * Search: breadth-first over exact positions, bucketed into CELL px cells. From every new
 * cell we hold each of 8 directions for several frame counts (short taps and long holds, so
 * corner nudges like the sofa repro are covered), continuing from the exact resulting
 * position each time.
 */
import { houseLayout } from '../data/houseLayout';
import { getStaticColliders } from '../data/colliders';
import { ARCADE_OVERLAP_BIAS, EXTERIOR_WALL_BODY_EXTRA } from '../config/physicsConfig';
import { PLAYER_BODY_RADIUS } from '../config/playerConfig';
import { ArcadeSim } from './arcadeSim';

const CELL = 4;
const STEPS = [2, 6, 18];
const DIRS: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];
export const SPAWN = { x: 300, y: 430 };

const inRect = (x: number, y: number, r: { x: number; y: number; width: number; height: number }) =>
  x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;

export interface ContainmentResult {
  cells: number;
  outside: { x: number; y: number }[];
  inBedroom: number;
  ms: number;
  /** First move that left the house: from position, direction, frames held, landing position. */
  firstEscape?: string;
}

export function floodContainment(opts: {
  debugUnlock?: boolean; overlapBias?: number; exteriorExtra?: number; maxCells?: number;
  cell?: number; steps?: number[];
} = {}): ContainmentResult {
  const CELL_ = opts.cell ?? CELL;
  const STEPS_ = opts.steps ?? STEPS;
  const t0 = Date.now();
  const c = getStaticColliders(opts.debugUnlock ?? false, opts.exteriorExtra ?? EXTERIOR_WALL_BODY_EXTRA);
  const sim = new ArcadeSim([...c.walls, ...c.furniture, ...c.spots, ...c.doors], opts.overlapBias ?? ARCADE_OVERLAP_BIAS, SPAWN);
  if (Math.abs(sim.bodyWidth - PLAYER_BODY_RADIUS * 2) > 0.01) throw new Error(`sim body ${sim.bodyWidth}px`);

  const bedroom = houseLayout.rooms.find((r) => r.id === 'bedroom')!;
  const others = houseLayout.rooms.filter((r) => r.id !== 'bedroom');
  const seen = new Set<string>();
  const queue: [number, number][] = [[SPAWN.x, SPAWN.y]];
  const outside: { x: number; y: number }[] = [];
  let inBedroom = 0;
  let firstEscape: string | undefined;
  const key = (x: number, y: number) => `${Math.floor(x / CELL_)},${Math.floor(y / CELL_)}`;
  seen.add(key(SPAWN.x, SPAWN.y));
  const max = opts.maxCells ?? 200000;

  while (queue.length && seen.size < max) {
    const [px, py] = queue.shift()!;
    for (const [dx, dy] of DIRS) {
      sim.place(px, py);
      let done = 0;
      for (const n of STEPS_) {
        for (; done < n; done++) sim.frame(dx, dy);
        const x = sim.x, y = sim.y;
        const k = key(x, y);
        if (seen.has(k)) continue;
        seen.add(k);
        if (!houseLayout.rooms.some((r) => inRect(x, y, r))) {
          outside.push({ x, y });
          const fromInside = houseLayout.rooms.some((r) => inRect(px, py, r));
          if (!firstEscape && fromInside) {
            firstEscape = `from (${px.toFixed(1)},${py.toFixed(1)}) holding (${dx},${dy}) for ${n} frames -> (${x.toFixed(1)},${y.toFixed(1)})`;
          }
        }
        else if (inRect(x, y, bedroom) && !others.some((r) => inRect(x, y, r))) inBedroom++;
        queue.push([x, y]);
      }
    }
  }
  return { cells: seen.size, outside, inBedroom, ms: Date.now() - t0, firstEscape };
}

export function runContainmentTest(): void {
  console.log('=== CONTAINMENT TEST (real Arcade physics) ===');
  const errors: string[] = [];
  for (const debugUnlock of [false, true]) {
    const r = floodContainment({ debugUnlock });
    const label = debugUnlock ? '?debug=unlock' : 'normal';
    console.log(`${label}: ${r.cells} reachable cells, ${r.outside.length} outside, ${r.inBedroom} in bedroom (${r.ms} ms)`);
    if (r.outside.length) {
      const s = r.outside.slice(0, 5).map((p) => `(${p.x.toFixed(1)},${p.y.toFixed(1)})`).join(' ');
      errors.push(`${label}: player can reach ${r.outside.length} cells outside the house, e.g. ${s}; first escape ${r.firstEscape}`);
    }
    if (!debugUnlock && r.inBedroom) errors.push(`normal: player can enter the locked bedroom (${r.inBedroom} cells)`);
    if (debugUnlock && !r.inBedroom) errors.push('?debug=unlock: bedroom not reachable');
  }
  if (errors.length) {
    errors.forEach((e) => console.error(`  - ${e}`));
    throw new Error('Containment test failed');
  }
  console.log('✅ CONTAINMENT TEST PASSED\n');
}
