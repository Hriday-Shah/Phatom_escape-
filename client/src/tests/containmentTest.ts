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
 *
 * Two passes per mode (QA R4-3): mixed 2/6/18-frame holds on 4px cells, and single-frame
 * steps on 3px cells (coarse settings alone can miss an R3-1 style wedge). The test also
 * checks itself: the R3-1 layout (sofa at y130) must leak in the 1-frame pass.
 */
import { houseLayout, HouseLayout } from '../data/houseLayout';
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
  /** Room ids with at least one reached position. */
  rooms: Set<string>;
}

export function floodContainment(opts: {
  debugUnlock?: boolean; overlapBias?: number; exteriorExtra?: number; maxCells?: number;
  cell?: number; steps?: number[]; layout?: HouseLayout; stopOnEscape?: boolean;
} = {}): ContainmentResult {
  const layout = opts.layout ?? houseLayout;
  const CELL_ = opts.cell ?? CELL;
  const STEPS_ = opts.steps ?? STEPS;
  const t0 = Date.now();
  const c = getStaticColliders(opts.debugUnlock ?? false, opts.exteriorExtra ?? EXTERIOR_WALL_BODY_EXTRA, layout);
  const sim = new ArcadeSim([...c.walls, ...c.furniture, ...c.spots, ...c.doors], opts.overlapBias ?? ARCADE_OVERLAP_BIAS, SPAWN);
  if (Math.abs(sim.bodyWidth - PLAYER_BODY_RADIUS * 2) > 0.01) throw new Error(`sim body ${sim.bodyWidth}px`);

  const bedroom = layout.rooms.find((r) => r.id === 'bedroom')!;
  const others = layout.rooms.filter((r) => r.id !== 'bedroom');
  const rooms = new Set<string>();
  const seen = new Set<string>();
  const queue: [number, number][] = [[SPAWN.x, SPAWN.y]];
  const outside: { x: number; y: number }[] = [];
  let inBedroom = 0;
  let firstEscape: string | undefined;
  const key = (x: number, y: number) => `${Math.floor(x / CELL_)},${Math.floor(y / CELL_)}`;
  seen.add(key(SPAWN.x, SPAWN.y));
  const max = opts.maxCells ?? 200000;

  while (queue.length && seen.size < max && !(opts.stopOnEscape && outside.length)) {
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
        layout.rooms.forEach((r) => { if (inRect(x, y, r)) rooms.add(r.id); });
        if (!layout.rooms.some((r) => inRect(x, y, r))) {
          outside.push({ x, y });
          const fromInside = layout.rooms.some((r) => inRect(px, py, r));
          if (!firstEscape && fromInside) {
            firstEscape = `from (${px.toFixed(1)},${py.toFixed(1)}) holding (${dx},${dy}) for ${n} frames -> (${x.toFixed(1)},${y.toFixed(1)})`;
          }
        }
        else if (inRect(x, y, bedroom) && !others.some((r) => inRect(x, y, r))) inBedroom++;
        queue.push([x, y]);
      }
    }
  }
  return { cells: seen.size, outside, inBedroom, ms: Date.now() - t0, firstEscape, rooms };
}

export const PASSES: { name: string; cell: number; steps: number[] }[] = [
  { name: '2/6/18-frame holds, 4px cells', cell: CELL, steps: STEPS },
  { name: '1-frame steps, 3px cells', cell: 3, steps: [1] },
];

/**
 * Grown (invisible) wall and door bodies may only cover wall or the outside: never a room's
 * open floor. Checks every 1px sample of every body against the layout rects.
 */
export function findBodyIntrusions(layout: HouseLayout = houseLayout): string[] {
  const out: string[] = [];
  const solidRects = [...layout.walls, ...layout.doors];
  const within = (x: number, y: number, r: { x: number; y: number; width: number; height: number }) =>
    x > r.x && x < r.x + r.width && y > r.y && y < r.y + r.height;
  for (const debugUnlock of [false, true]) {
    const c = getStaticColliders(debugUnlock, EXTERIOR_WALL_BODY_EXTRA, layout);
    for (const b of [...c.walls, ...c.doors]) {
      let bad = 0;
      for (let x = b.x + 0.5; x < b.x + b.width; x++) {
        for (let y = b.y + 0.5; y < b.y + b.height; y++) {
          if (layout.rooms.some((r) => within(x, y, r)) && !solidRects.some((r) => within(x, y, r))) bad++;
        }
      }
      if (bad) out.push(`body {${b.x},${b.y},${b.width},${b.height}} covers ${bad} px of room floor`);
    }
  }
  return out;
}

export function runContainmentTest(): void {
  console.log('=== CONTAINMENT TEST (real Arcade physics) ===');
  const errors: string[] = [];
  const intrusions = findBodyIntrusions();
  if (intrusions.length) errors.push(...intrusions);
  else console.log('✓ grown wall/door bodies cover no room floor');
  const allRooms = houseLayout.rooms.map((r) => r.id);
  for (const pass of PASSES) {
    for (const debugUnlock of [false, true]) {
      const r = floodContainment({ debugUnlock, cell: pass.cell, steps: pass.steps });
      const label = `${debugUnlock ? '?debug=unlock' : 'normal'} [${pass.name}]`;
      console.log(`${label}: ${r.cells} reachable cells, ${r.outside.length} outside, ${r.inBedroom} in bedroom (${r.ms} ms)`);
      if (r.outside.length) {
        const s = r.outside.slice(0, 5).map((p) => `(${p.x.toFixed(1)},${p.y.toFixed(1)})`).join(' ');
        errors.push(`${label}: player can reach ${r.outside.length} cells outside the house, e.g. ${s}; first escape ${r.firstEscape}`);
      }
      if (!debugUnlock && r.inBedroom) errors.push(`${label}: player can enter the locked bedroom (${r.inBedroom} cells)`);
      if (debugUnlock && !r.inBedroom) errors.push(`${label}: bedroom not reachable`);
      // Coverage guard: a flood that stalls (e.g. steps too short for the cell size) proves nothing.
      const missing = allRooms.filter((id) => (debugUnlock || id !== 'bedroom') && !r.rooms.has(id));
      if (missing.length) errors.push(`${label}: flood never reached ${missing.join(', ')}`);
    }
  }
  // Self-check: the 1-frame pass must still find the original R3-1 leak (sofa at y130).
  const r31: HouseLayout = {
    ...houseLayout,
    hidingSpots: houseLayout.hidingSpots.map((h) => (h.id === 'sofa' ? { ...h, y: 130 } : h)),
  };
  const fine = PASSES[1];
  const leak = floodContainment({ layout: r31, cell: fine.cell, steps: fine.steps, stopOnEscape: true });
  if (!leak.outside.length) errors.push(`self-check: the ${fine.name} pass no longer finds the R3-1 sofa leak`);
  else console.log(`✓ self-check: R3-1 layout (sofa y130) leaks in the ${fine.name} pass (${leak.ms} ms): ${leak.firstEscape}`);

  if (errors.length) {
    errors.forEach((e) => console.error(`  - ${e}`));
    throw new Error('Containment test failed');
  }
  console.log('✅ CONTAINMENT TEST PASSED\n');
}
