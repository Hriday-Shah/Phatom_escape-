/**
 * Shared world collision and reach checks used by the client and the server
 * (R15-3, R15-4, R15-10). Geometry comes from houseLayout + colliders, the
 * same bodies GameScene puts in the Arcade wall group: walls (with exterior
 * growth), blocking furniture, and locked doors. Line of sight uses walls and
 * locked doors only; furniture never blocks sight.
 */
import { getStaticColliders, type Rect } from '../data/colliders';
import { PLAYER_BODY_RADIUS } from '../config/playerConfig';
import { PLAYER_SPEED } from '../config/physicsConfig';
import { hasLineOfSight, distanceToRect, centerOf, buildInteractables } from './spotTargeting';
import { houseLayout } from '../data/houseLayout';

export const NEAR_ITEM = 90;

export function hidingSpots(): { id: string; x: number; y: number; width: number; height: number }[] {
  return buildInteractables(houseLayout.hidingSpots).map((s) => ({
    id: s.id, x: s.x, y: s.y, width: s.width, height: s.height,
  }));
}

export type Point = { x: number; y: number };

/**
 * Bodies the player cannot walk through. Matches the Arcade groups in GameScene:
 * wall bodies, blocking furniture, every hiding spot (those are solid too), and locked doors.
 */
export function movementBlockers(debugUnlock = false): Rect[] {
  const c = getStaticColliders(debugUnlock);
  return [...c.walls, ...c.furniture, ...c.spots, ...c.doors];
}

/** Bodies that block sight (walls + locked doors; furniture never does). */
export function losBlockers(debugUnlock = false): Rect[] {
  const c = getStaticColliders(debugUnlock);
  return [...c.walls, ...c.doors];
}

/** Axis-aligned rect inflated by a circle radius (conservative at corners). */
export function inflateRect(r: Rect, radius: number): Rect {
  return { x: r.x - radius, y: r.y - radius, width: r.width + radius * 2, height: r.height + radius * 2 };
}

export function circleHitsRect(x: number, y: number, radius: number, r: Rect): boolean {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.width));
  const dy = Math.max(r.y - y, 0, y - (r.y + r.height));
  return Math.hypot(dx, dy) < radius - 0.01;
}

export function pointBlocked(x: number, y: number, blockers: Rect[], radius = PLAYER_BODY_RADIUS): boolean {
  return blockers.some((b) => circleHitsRect(x, y, radius, b));
}

/**
 * Does a circle swept from A to B hit a blocker?
 * `skin` shrinks the swept box so a circle already touching a wall can travel along it.
 * The destination itself is still tested at the full radius.
 */
export function moveHitsWall(
  x0: number, y0: number, x1: number, y1: number,
  blockers: Rect[], radius = PLAYER_BODY_RADIUS, skin = 0,
): boolean {
  if (pointBlocked(x1, y1, blockers, radius)) return true;
  for (const b of blockers) {
    if (segmentHitsInflated(x0, y0, x1, y1, b, radius, skin)) return true;
  }
  return false;
}

function segmentHitsInflated(x0: number, y0: number, x1: number, y1: number, r: Rect, radius: number, skin = 0): boolean {
  const box = inflateRect(r, Math.max(0, radius - skin));
  // Liang-Barsky; touching the inflated edge counts.
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - box.x, box.x + box.width - x0, y0 - box.y, box.y + box.height - y0];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}

/**
 * Clamp a requested pose so the circle stays in free space along the segment
 * from `from`. If the destination is clear, it is returned unchanged.
 */
export function clampMove(
  from: Point, to: Point, blockers: Rect[], radius = PLAYER_BODY_RADIUS, skin = 0,
): Point & { blocked: boolean } {
  if (!moveHitsWall(from.x, from.y, to.x, to.y, blockers, radius, skin)) {
    return { x: to.x, y: to.y, blocked: false };
  }
  let lo = 0, hi = 1;
  let best = { x: from.x, y: from.y };
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    const x = from.x + (to.x - from.x) * mid;
    const y = from.y + (to.y - from.y) * mid;
    if (moveHitsWall(from.x, from.y, x, y, blockers, radius, skin) || pointBlocked(x, y, blockers, radius)) {
      hi = mid;
    } else {
      best = { x, y };
      lo = mid;
    }
  }
  return { x: Math.round(best.x * 10) / 10, y: Math.round(best.y * 10) / 10, blocked: true };
}

/**
 * How far a swept circle may graze a wall it is already touching.
 * Without this, the contact line along the car table counts as a hit and the slide stops.
 */
const SLIDE_SKIN = 0.05;
/** A slide that lands this close to the request, on a free point, accepts the request. */
const SLIDE_REACH_EPS = 0.35;

function roundTenth(n: number): number {
  return Math.round(n * 10) / 10;
}

function slideMoved(from: Point, p: Point): boolean {
  return Math.hypot(p.x - from.x, p.y - from.y) > SLIDE_REACH_EPS;
}

function carTableRect(): Rect | null {
  return houseLayout.furniture.find((f) => f.id === 'car_table') ?? null;
}

function stoveDrawerCabinet(): Rect | null {
  return houseLayout.hidingSpots.find((s) => s.id === 'stove_drawers') ?? null;
}

/**
 * NE kitchen: pushing into stove-side drawers / the east wall shelf should slide along
 * the free face (south or west), not freeze under the cabinet art.
 */
function kitchenCabinetSlide(
  from: Point, to: Point, blockers: Rect[], radius = PLAYER_BODY_RADIUS,
): Point | null {
  const cab = stoveDrawerCabinet();
  if (!cab) return null;
  const westShelf = cab.x - radius - 2;
  if (from.x < westShelf - 48 || from.x > westShelf + 12) return null;
  const bottomBand = cab.y + cab.height - radius;
  if (from.y < cab.y - 16 || from.y > bottomBand + 24) return null;
  const adx = to.x - from.x;
  const ady = to.y - from.y;
  const dist = Math.hypot(adx, ady);
  if (dist < SLIDE_REACH_EPS) return null;
  if (ady >= SLIDE_REACH_EPS && adx <= SLIDE_REACH_EPS) return null;
  const trySlide = (fx: number, fy: number): Point | null => {
    const c = clampMove(from, { x: fx, y: fy }, blockers, radius, SLIDE_SKIN);
    if (!slideMoved(from, c) || pointBlocked(c.x, c.y, blockers, radius)) return null;
    if (movementDeadEnd(c, blockers, radius)) return null;
    return { x: c.x, y: c.y };
  };
  const southOffShelf = from.y > bottomBand;
  if (southOffShelf || ady < -SLIDE_REACH_EPS || adx > SLIDE_REACH_EPS) {
    const south = trySlide(from.x, from.y + dist);
    if (south) return south;
    if (!southOffShelf) {
      const west = trySlide(from.x - dist, from.y);
      if (west) return west;
    }
  }
  return null;
}

/**
 * Diagonal into the car table should slide along its south face toward the living
 * opening, not climb the north-east corner into the entrance pinch.
 */
/** Living-room north wall: NE / E into the top edge slides south along the wall. */
function livingNorthWallSlide(
  from: Point, to: Point, blockers: Rect[], radius = PLAYER_BODY_RADIUS,
): Point | null {
  const contactY = 100 + 10 + radius;
  if (from.y < contactY - 6 || from.y > contactY + 18) return null;
  if (from.x < 432 || from.x > 798) return null;
  const adx = to.x - from.x;
  const ady = to.y - from.y;
  const dist = Math.hypot(adx, ady);
  if (dist < SLIDE_REACH_EPS) return null;
  if (ady >= -SLIDE_REACH_EPS && adx <= SLIDE_REACH_EPS) return null;
  if (ady < -SLIDE_REACH_EPS || (Math.abs(ady) <= SLIDE_REACH_EPS && adx > SLIDE_REACH_EPS)) {
    const south = clampMove(from, { x: from.x, y: from.y + dist }, blockers, radius, SLIDE_SKIN);
    if (slideMoved(from, south) && !pointBlocked(south.x, south.y, blockers, radius)
        && !movementDeadEnd(south, blockers, radius)) {
      return { x: south.x, y: south.y };
    }
  }
  return null;
}

/** Below the living north wall, E into the foyer jamb slides south until the opening clears. */
function livingEastJambSlide(
  from: Point, to: Point, blockers: Rect[], radius = PLAYER_BODY_RADIUS,
): Point | null {
  if (from.x < 680 || from.x > 798) return null;
  if (from.y < 118 || from.y > 268) return null;
  const adx = to.x - from.x;
  const ady = to.y - from.y;
  const dist = Math.hypot(adx, ady);
  if (dist < SLIDE_REACH_EPS || adx <= SLIDE_REACH_EPS) return null;
  const east = clampMove(from, { x: to.x, y: from.y }, blockers, radius, SLIDE_SKIN);
  if (!east.blocked && slideMoved(from, east)) return null;
  const south = clampMove(from, { x: from.x, y: from.y + Math.max(dist, adx > ady ? dist : dist * 0.75) }, blockers, radius, SLIDE_SKIN);
  if (slideMoved(from, south) && !pointBlocked(south.x, south.y, blockers, radius)
      && !movementDeadEnd(south, blockers, radius)) {
    return { x: south.x, y: south.y };
  }
  return null;
}

function carTableSouthSlide(
  from: Point, to: Point, blockers: Rect[], radius = PLAYER_BODY_RADIUS,
): Point | null {
  const table = carTableRect();
  if (!table) return null;
  const contactY = table.y + table.height + radius;
  const eastOfTable = from.x >= table.x - radius;
  const inCorridor = eastOfTable && from.x < 432
    && from.y >= contactY - 36 && from.y <= contactY + 10;
  if (!inCorridor) return null;
  const adx = to.x - from.x;
  const ady = to.y - from.y;
  if (adx <= SLIDE_REACH_EPS) return null;
  const climbingNorth = ady < -SLIDE_REACH_EPS || from.y < contactY - SLIDE_REACH_EPS;
  if (!climbingNorth && ady > SLIDE_REACH_EPS) return null;
  const along = clampMove(from, { x: to.x, y: contactY }, blockers, radius, SLIDE_SKIN);
  if (!slideMoved(from, along) || pointBlocked(along.x, along.y, blockers, radius)) return null;
  if (movementDeadEnd(along, blockers, radius)) return null;
  return { x: along.x, y: along.y };
}

/** True when no short slide leaves the circle off the blockers (pocket / nook). */
function movementDeadEnd(p: Point, blockers: Rect[], radius = PLAYER_BODY_RADIUS): boolean {
  const probes = [8, 16] as const;
  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
  ] as const;
  for (const dist of probes) {
    let any = false;
    for (const [dx, dy] of dirs) {
      const next = clampMove(
        p, { x: p.x + dx * dist, y: p.y + dy * dist }, blockers, radius, SLIDE_SKIN,
      );
      if (!next.blocked) { any = true; break; }
    }
    if (!any) return true;
  }
  return false;
}

/**
 * Move toward `to`, sliding along a wall or table the way the body does on the phone.
 * A straight stop would leave the server pose stuck on the corner while the sprite
 * walks along the edge. A request the slide actually reaches is returned unchanged.
 */
export function slideMove(
  from: Point, to: Point, blockers: Rect[], radius = PLAYER_BODY_RADIUS,
): Point & { blocked: boolean } {
  if (Math.hypot(to.x - from.x, to.y - from.y) <= SLIDE_REACH_EPS && !pointBlocked(to.x, to.y, blockers, radius)) {
    return { x: to.x, y: to.y, blocked: false };
  }
  const direct = clampMove(from, to, blockers, radius, SLIDE_SKIN);
  if (!direct.blocked && !pointBlocked(direct.x, direct.y, blockers, radius)) {
    const table = carTableRect();
    if (table) {
      const contactY = table.y + table.height + radius;
      const carAlong = carTableSouthSlide(from, to, blockers, radius);
      if (carAlong && direct.y < contactY - SLIDE_REACH_EPS) {
        const blocked = Math.hypot(carAlong.x - to.x, carAlong.y - to.y) > SLIDE_REACH_EPS;
        return { x: carAlong.x, y: carAlong.y, blocked };
      }
    }
    return { x: direct.x, y: direct.y, blocked: false };
  }
  let best: Point = direct;
  if (direct.blocked) {
    const alongX = clampMove(from, { x: to.x, y: from.y }, blockers, radius, SLIDE_SKIN);
    const xy = clampMove(alongX, { x: alongX.x, y: to.y }, blockers, radius, SLIDE_SKIN);
    const alongY = clampMove(from, { x: from.x, y: to.y }, blockers, radius, SLIDE_SKIN);
    const yx = clampMove(alongY, { x: to.x, y: alongY.y }, blockers, radius, SLIDE_SKIN);
    const leftX = Math.hypot(to.x - xy.x, to.y - xy.y);
    const leftY = Math.hypot(to.x - yx.x, to.y - yx.y);
    best = leftX <= leftY ? xy : yx;
    const carAlong = carTableSouthSlide(from, to, blockers, radius);
    if (carAlong) {
      const table = carTableRect()!;
      const contactY = table.y + table.height + radius;
      if (best.y < contactY - SLIDE_REACH_EPS || !slideMoved(from, best)) best = carAlong;
    }
    const northAlong = livingNorthWallSlide(from, to, blockers, radius);
    if (northAlong && (!slideMoved(from, best) || best.y <= from.y + SLIDE_REACH_EPS)) best = northAlong;
    const eastJamb = livingEastJambSlide(from, to, blockers, radius);
    if (eastJamb && (!slideMoved(from, best) || best.x <= from.x + SLIDE_REACH_EPS)) best = eastJamb;
    const cabinetAlong = kitchenCabinetSlide(from, to, blockers, radius);
    if (cabinetAlong && (!slideMoved(from, best) || (best.x <= from.x + SLIDE_REACH_EPS && best.y <= from.y + SLIDE_REACH_EPS))) {
      best = cabinetAlong;
    }
    const belowMouth = from.x <= 808 && from.y >= 290 && from.y <= 318 && to.x > from.x && to.y > from.y;
    if (belowMouth && best.y > from.y + SLIDE_REACH_EPS) {
      const north = clampMove(from, { x: from.x, y: to.y < from.y ? to.y : from.y - Math.hypot(to.x - from.x, to.y - from.y) }, blockers, radius, SLIDE_SKIN);
      if (slideMoved(from, north)) best = north;
    }
    // Pushing into a doorway jamb below the mouth: the chord stops but the body
    // can still slide along the wall the way Arcade does on a single-player body.
    if (!slideMoved(from, best)) {
      const adx = to.x - from.x;
      const ady = to.y - from.y;
      let corner = best;
      let cornerLeft = Math.hypot(to.x - best.x, to.y - best.y);
      const tryCorner = (fx: number, fy: number) => {
        const c = clampMove(from, { x: fx, y: fy }, blockers, radius, SLIDE_SKIN);
        if (!slideMoved(from, c)) return;
        const left = Math.hypot(to.x - c.x, to.y - c.y);
        if (left < cornerLeft) {
          cornerLeft = left;
          corner = c;
        }
      };
      if (Math.abs(adx) > SLIDE_REACH_EPS) {
        const towardX = clampMove(from, { x: to.x, y: from.y }, blockers, radius, SLIDE_SKIN);
        if (!slideMoved(from, towardX)) {
          tryCorner(from.x - Math.sign(adx) * Math.abs(adx), from.y);
        }
      }
      if (Math.abs(ady) > SLIDE_REACH_EPS) {
        const towardY = clampMove(from, { x: from.x, y: to.y }, blockers, radius, SLIDE_SKIN);
        if (!slideMoved(from, towardY)) {
          tryCorner(from.x, from.y - Math.sign(ady) * Math.abs(ady));
        }
      }
      best = corner;
    }
  }
  if (slideMoved(from, best) && movementDeadEnd(best, blockers, radius)) {
    best = from;
  }
  if (Math.hypot(best.x - to.x, best.y - to.y) <= SLIDE_REACH_EPS && !pointBlocked(to.x, to.y, blockers, radius)) {
    return { x: to.x, y: to.y, blocked: false };
  }
  let x = roundTenth(best.x);
  let y = roundTenth(best.y);
  if (pointBlocked(x, y, blockers, radius)) {
    if (pointBlocked(from.x, from.y, blockers, radius)) {
      const free = nearestFree(from, blockers, radius);
      x = free.x;
      y = free.y;
    } else {
      x = roundTenth(from.x);
      y = roundTenth(from.y);
    }
  }
  return { x, y, blocked: x !== to.x || y !== to.y };
}

/**
 * A doorway step may walk this much farther than the straight chord.
 * Going around the sofa is longer, so that chord still stops on the sofa.
 */
const DOORWAY_DETOUR = 1.45;
const DOORWAY_PAD = 48;
const WALK_STEP = 8;
const WALK_EXPAND = 1800;

/** When the stick aims through the living-room/foyer mouth, path around the jamb via the gap. */
function doorwayAim(from: Point, to: Point, blockers: Rect[], radius: number): Point {
  if (from.x > 808 || from.y < 286 || from.y > 318) return to;
  if (to.x <= from.x + 4) return to;
  const mouth = { x: 850, y: 268 };
  if (!pointBlocked(mouth.x, mouth.y, blockers, radius)) return mouth;
  return { x: Math.min(to.x, 834), y: Math.min(from.y, 292) };
}

function nearestFree(p: Point, blockers: Rect[], radius: number): Point {
  if (!pointBlocked(p.x, p.y, blockers, radius)) return { x: roundTenth(p.x), y: roundTenth(p.y) };
  for (let ring = 4; ring <= 64; ring += 4) {
    for (let a = 0; a < 16; a++) {
      const t = (a / 16) * Math.PI * 2;
      const x = p.x + Math.cos(t) * ring;
      const y = p.y + Math.sin(t) * ring;
      if (!pointBlocked(x, y, blockers, radius)) return { x: roundTenth(x), y: roundTenth(y) };
    }
  }
  return { x: roundTenth(p.x), y: roundTenth(p.y) };
}

/**
 * Shortest walk on an 8px grid from `from` to `to`, or null when no walk
 * fits in `maxLen`. Segment checks stop the grid from cutting a corner.
 */
function shortWalk(
  from: Point, to: Point, blockers: Rect[], radius: number, maxLen: number,
): number | null {
  const sx = Math.round(from.x);
  const sy = Math.round(from.y);
  const nodes: { x: number; y: number; g: number; prev: number }[] = [{ x: sx, y: sy, g: 0, prev: -1 }];
  const best = new Map<string, number>([[`${sx},${sy}`, 0]]);
  const open: number[] = [0];
  const dirs = [
    [WALK_STEP, 0], [-WALK_STEP, 0], [0, WALK_STEP], [0, -WALK_STEP],
    [WALK_STEP, WALK_STEP], [WALK_STEP, -WALK_STEP], [-WALK_STEP, WALK_STEP], [-WALK_STEP, -WALK_STEP],
  ];
  let expanded = 0;
  while (open.length && expanded < WALK_EXPAND) {
    let pick = 0;
    let pickF = Infinity;
    for (let i = 0; i < open.length; i++) {
      const n = nodes[open[i]]!;
      const f = n.g + Math.hypot(n.x - to.x, n.y - to.y);
      if (f < pickF) { pickF = f; pick = i; }
    }
    const idx = open.splice(pick, 1)[0]!;
    const n = nodes[idx]!;
    if ((best.get(`${n.x},${n.y}`) ?? 0) < n.g - 1e-6) continue;
    expanded++;
    const left = Math.hypot(n.x - to.x, n.y - to.y);
    if (left <= WALK_STEP && !moveHitsWall(n.x, n.y, to.x, to.y, blockers, radius, SLIDE_SKIN)) {
      return n.g + left;
    }
    for (const [dx, dy] of dirs) {
      const nx = n.x + dx;
      const ny = n.y + dy;
      const ng = n.g + Math.hypot(dx, dy);
      if (ng > maxLen) continue;
      if (pointBlocked(nx, ny, blockers, radius)) continue;
      if (moveHitsWall(n.x, n.y, nx, ny, blockers, radius, SLIDE_SKIN)) continue;
      const key = `${nx},${ny}`;
      const prev = best.get(key);
      if (prev != null && prev <= ng) continue;
      best.set(key, ng);
      nodes.push({ x: nx, y: ny, g: ng, prev: idx });
      open.push(nodes.length - 1);
    }
  }
  return null;
}

const WALK_DIRS = [
  [WALK_STEP, 0], [-WALK_STEP, 0], [0, WALK_STEP], [0, -WALK_STEP],
  [WALK_STEP, WALK_STEP], [WALK_STEP, -WALK_STEP], [-WALK_STEP, WALK_STEP], [-WALK_STEP, -WALK_STEP],
] as const;

type WalkNode = { x: number; y: number; g: number; prev: number };

/** Grid search toward `to` within `searchLen`; returns nodes, goal index, and best partial index. */
function pathfindToward(
  from: Point, to: Point, blockers: Rect[], radius: number, searchLen: number,
): { nodes: WalkNode[]; goalIdx: number; partialIdx: number } | null {
  if (searchLen <= 0) return null;
  const sx = Math.round(from.x);
  const sy = Math.round(from.y);
  const nodes: WalkNode[] = [{ x: sx, y: sy, g: 0, prev: -1 }];
  const best = new Map<string, number>([[`${sx},${sy}`, 0]]);
  const open: number[] = [0];
  let goalIdx = -1;
  let partialIdx = -1;
  let partialH = Infinity;
  let expanded = 0;
  while (open.length && expanded < WALK_EXPAND) {
    let pick = 0;
    let pickF = Infinity;
    for (let i = 0; i < open.length; i++) {
      const n = nodes[open[i]]!;
      const f = n.g + Math.hypot(n.x - to.x, n.y - to.y);
      if (f < pickF) { pickF = f; pick = i; }
    }
    const idx = open.splice(pick, 1)[0]!;
    const n = nodes[idx]!;
    if ((best.get(`${n.x},${n.y}`) ?? 0) < n.g - 1e-6) continue;
    expanded++;
    const h = Math.hypot(n.x - to.x, n.y - to.y);
    if (n.g > 0 && n.g <= searchLen && h < partialH) {
      partialH = h;
      partialIdx = idx;
    }
    const left = Math.hypot(n.x - to.x, n.y - to.y);
    if (goalIdx < 0 && left <= WALK_STEP && !moveHitsWall(n.x, n.y, to.x, to.y, blockers, radius, SLIDE_SKIN)) {
      goalIdx = idx;
      break;
    }
    for (const [dx, dy] of WALK_DIRS) {
      const nx = n.x + dx;
      const ny = n.y + dy;
      const ng = n.g + Math.hypot(dx, dy);
      if (ng > searchLen) continue;
      if (pointBlocked(nx, ny, blockers, radius)) continue;
      if (moveHitsWall(n.x, n.y, nx, ny, blockers, radius, SLIDE_SKIN)) continue;
      const key = `${nx},${ny}`;
      const prev = best.get(key);
      if (prev != null && prev <= ng) continue;
      best.set(key, ng);
      nodes.push({ x: nx, y: ny, g: ng, prev: idx });
      open.push(nodes.length - 1);
    }
  }
  if (goalIdx < 0 && partialIdx < 0) return null;
  return { nodes, goalIdx, partialIdx };
}

/** Walk up to `stepLen` along the shortest grid path toward `to` found within `searchLen`. */
function walkAlongPath(
  from: Point, to: Point, blockers: Rect[], radius: number, searchLen: number, stepLen: number,
): Point | null {
  const path = pathfindToward(from, to, blockers, radius, searchLen);
  if (!path || stepLen <= SLIDE_REACH_EPS) return null;
  const target = path.goalIdx >= 0 ? path.goalIdx : path.partialIdx;
  if (target < 0) return null;
  const chain: number[] = [];
  let idx = target;
  while (idx >= 0) { chain.push(idx); idx = path.nodes[idx]!.prev; }
  chain.reverse();
  let walked = 0;
  let out = { x: from.x, y: from.y };
  for (let i = 1; i < chain.length; i++) {
    const a = path.nodes[chain[i - 1]!]!;
    const b = path.nodes[chain[i]!]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (walked + seg >= stepLen - 1e-6) {
      const t = Math.min(1, (stepLen - walked) / seg);
      return {
        x: roundTenth(a.x + (b.x - a.x) * t),
        y: roundTenth(a.y + (b.y - a.y) * t),
      };
    }
    walked += seg;
    out = { x: b.x, y: b.y };
  }
  if (path.goalIdx >= 0) {
    const goalSeg = Math.hypot(to.x - out.x, to.y - out.y);
    if (walked + goalSeg >= stepLen - 1e-6) {
      const t = Math.min(1, (stepLen - walked) / goalSeg);
      return {
        x: roundTenth(out.x + (to.x - out.x) * t),
        y: roundTenth(out.y + (to.y - out.y) * t),
      };
    }
    return { x: roundTenth(to.x), y: roundTenth(to.y) };
  }
  if (slideMoved(from, out)) return { x: roundTenth(out.x), y: roundTenth(out.y) };
  return null;
}

/**
 * Slide toward `to`, but take a short walk through a doorway when the straight
 * chord stops on the jamb. `maxDist` is the speed budget. A long loop around
 * furniture is not that walk: the chord still stops where the slide stops.
 * Never returns a point inside a blocker.
 */
export function resolveMove(
  from: Point,
  to: Point,
  blockers: Rect[],
  maxDist: number,
  radius = PLAYER_BODY_RADIUS,
): Point & { blocked: boolean } {
  const origin = pointBlocked(from.x, from.y, blockers, radius) ? nearestFree(from, blockers, radius) : from;
  const aim = doorwayAim(origin, to, blockers, radius);
  const doorwayCase = aim.x !== to.x || aim.y !== to.y;
  const slid = slideMove(origin, to, blockers, radius);
  if (!slid.blocked && !pointBlocked(slid.x, slid.y, blockers, radius)) return slid;
  if (doorwayCase) {
    const north = clampMove(origin, { x: origin.x, y: origin.y - maxDist }, blockers, radius, SLIDE_SKIN);
    if (slideMoved(origin, north) && !pointBlocked(north.x, north.y, blockers, radius)) {
      return { x: north.x, y: north.y, blocked: true };
    }
    const straight = Math.hypot(aim.x - origin.x, aim.y - origin.y);
    const goalFree = !pointBlocked(aim.x, aim.y, blockers, radius);
    if (straight > SLIDE_REACH_EPS) {
      const searchLen = Math.max(straight * DOORWAY_DETOUR + DOORWAY_PAD, maxDist);
      const walked = shortWalk(origin, aim, blockers, radius, searchLen);
      if (goalFree && walked != null && walked <= maxDist + 1) {
        return { x: aim.x, y: aim.y, blocked: false };
      }
      const step = walkAlongPath(origin, aim, blockers, radius, searchLen, maxDist);
      if (step && slideMoved(origin, step) && !pointBlocked(step.x, step.y, blockers, radius)) {
        const atGoal = goalFree && Math.hypot(step.x - aim.x, step.y - aim.y) <= SLIDE_REACH_EPS;
        return { x: step.x, y: step.y, blocked: !atGoal };
      }
    }
  }
  if (!pointBlocked(slid.x, slid.y, blockers, radius)) return slid;
  const free = nearestFree(slid, blockers, radius);
  return { x: free.x, y: free.y, blocked: true };
}

/**
 * Advance one phone step: fixed 60 Hz slides, the same steps between two pose sends.
 * `dtMs` is capped at 100 so a hitch cannot tunnel through a table in one segment.
 */
export function integrateSlide(
  from: Point,
  dirX: number,
  dirY: number,
  dtMs: number,
  blockers: Rect[] = movementBlockers(),
  speed = PLAYER_SPEED,
  radius = PLAYER_BODY_RADIUS,
): Point {
  const len = Math.hypot(dirX, dirY);
  if (len === 0 || !(dtMs > 0)) return { x: from.x, y: from.y };
  const ux = dirX / len;
  const uy = dirY / len;
  let left = Math.min(dtMs, 100);
  let x = from.x;
  let y = from.y;
  if (pointBlocked(x, y, blockers, radius)) {
    const free = nearestFree({ x, y }, blockers, radius);
    x = free.x;
    y = free.y;
  }
  const totalBudget = speed * Math.min(dtMs, 100) / 1000;
  let lastSafe = { x, y };
  const frame = 1000 / 60;
  for (let i = 0; i < 8 && left > 1e-4; i++) {
    const dt = Math.min(frame, left);
    left -= dt;
    const dist = speed * dt / 1000;
    const before = { x, y };
    const next = slideMove(
      before, { x: before.x + ux * dist, y: before.y + uy * dist }, blockers, radius,
    );
    const mx = next.x - before.x;
    const my = next.y - before.y;
    const moved = Math.hypot(mx, my);
    if (moved > SLIDE_REACH_EPS && moved < dist - SLIDE_REACH_EPS) {
      const leftDist = dist - moved;
      const tx = mx / moved;
      const ty = my / moved;
      const more = slideMove(
        next,
        { x: next.x + tx * leftDist, y: next.y + ty * leftDist },
        blockers,
        radius,
      );
      if (Math.hypot(more.x - next.x, more.y - next.y) > SLIDE_REACH_EPS) {
        x = more.x;
        y = more.y;
        continue;
      }
    }
    x = next.x;
    y = next.y;
    if (!movementDeadEnd({ x, y }, blockers, radius) && !pointBlocked(x, y, blockers, radius)) {
      lastSafe = { x, y };
    }
  }
  const alongStick = (x - from.x) * ux + (y - from.y) * uy;
  // Wall slides that move across the stick (e.g. south while holding NE) must not
  // fund a tail back into the stick, which used to oscillate in the kitchen NE corner.
  const remain = alongStick > SLIDE_REACH_EPS ? Math.max(0, totalBudget - alongStick) : 0;
  const tailTo = { x: x + ux * remain, y: y + uy * remain };
  if (remain > SLIDE_REACH_EPS && (doorwayAim({ x, y }, tailTo, blockers, radius).x !== tailTo.x
      || doorwayAim({ x, y }, tailTo, blockers, radius).y !== tailTo.y)) {
    const doorway = resolveMove({ x, y }, tailTo, blockers, remain, radius);
    if (slideMoved({ x, y }, doorway)) {
      x = doorway.x;
      y = doorway.y;
    }
  }
  if (movementDeadEnd({ x, y }, blockers, radius) || pointBlocked(x, y, blockers, radius)) {
    x = lastSafe.x;
    y = lastSafe.y;
  }
  if (Math.hypot(x - from.x, y - from.y) < SLIDE_REACH_EPS) {
    const priX = { x: from.x + Math.sign(ux) * totalBudget, y: from.y };
    const priY = { x: from.x, y: from.y + Math.sign(uy) * totalBudget };
    const tries = Math.abs(ux) >= Math.abs(uy) ? [priX, priY] : [priY, priX];
    for (const pri of tries) {
      const fallback = slideMove(from, pri, blockers, radius);
      if (!slideMoved(from, fallback) || movementDeadEnd(fallback, blockers, radius)
          || pointBlocked(fallback.x, fallback.y, blockers, radius)) continue;
      x = fallback.x;
      y = fallback.y;
      break;
    }
  }
  return { x, y };
}

/**
 * Clamp a floor drop toward `dest`, staying within `reach` of `origin` and
 * never crossing a wall (R15-10).
 */
export function clampDrop(
  origin: Point, dest: Point, reach = NEAR_ITEM, blockers: Rect[] = losBlockers(),
): Point {
  let dx = dest.x, dy = dest.y;
  const dist = Math.hypot(dx - origin.x, dy - origin.y);
  if (dist > reach && dist > 0) {
    const t = reach / dist;
    dx = origin.x + (dx - origin.x) * t;
    dy = origin.y + (dy - origin.y) * t;
  } else if (dist === 0) {
    return { x: origin.x, y: origin.y };
  }
  if (!moveHitsWall(origin.x, origin.y, dx, dy, blockers, 1)) {
    return { x: dx, y: dy };
  }
  const clamped = clampMove(origin, { x: dx, y: dy }, blockers, 1);
  return { x: clamped.x, y: clamped.y };
}

/** In reach of a rect (or point) and with a clear line of sight to its centre (R15-3). */
export function reachableWithLos(
  pose: Point,
  target: { x: number; y: number; width?: number; height?: number },
  reach = NEAR_ITEM,
  blockers: Rect[] = losBlockers(),
): boolean {
  const rect = (target.width != null && target.height != null)
    ? { x: target.x, y: target.y, width: target.width, height: target.height }
    : { x: target.x - 1, y: target.y - 1, width: 2, height: 2 };
  if (distanceToRect(pose.x, pose.y, rect) > reach) return false;
  const c = centerOf(rect);
  return hasLineOfSight(pose.x, pose.y, c.x, c.y, blockers);
}

export function spotById(id: string): { id: string; x: number; y: number; width: number; height: number } | undefined {
  return hidingSpots().find((s) => s.id === id);
}

export function canUseSpot(pose: Point, spotId: string, reach = NEAR_ITEM): boolean {
  const spot = spotById(spotId);
  if (!spot) return false;
  return reachableWithLos(pose, spot, reach);
}

export { hasLineOfSight, distanceToRect, PLAYER_BODY_RADIUS };
