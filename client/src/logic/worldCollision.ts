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
  let best: Point = direct;
  if (direct.blocked) {
    const alongX = clampMove(from, { x: to.x, y: from.y }, blockers, radius, SLIDE_SKIN);
    const xy = clampMove(alongX, { x: alongX.x, y: to.y }, blockers, radius, SLIDE_SKIN);
    const alongY = clampMove(from, { x: from.x, y: to.y }, blockers, radius, SLIDE_SKIN);
    const yx = clampMove(alongY, { x: to.x, y: alongY.y }, blockers, radius, SLIDE_SKIN);
    const leftX = Math.hypot(to.x - xy.x, to.y - xy.y);
    const leftY = Math.hypot(to.x - yx.x, to.y - yx.y);
    best = leftX <= leftY ? xy : yx;
  }
  if (Math.hypot(best.x - to.x, best.y - to.y) <= SLIDE_REACH_EPS && !pointBlocked(to.x, to.y, blockers, radius)) {
    return { x: to.x, y: to.y, blocked: false };
  }
  const x = roundTenth(best.x);
  const y = roundTenth(best.y);
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
    if (left <= WALK_STEP && !moveHitsWall(n.x, n.y, to.x, to.y, blockers, radius, 0)) {
      return n.g + left;
    }
    for (const [dx, dy] of dirs) {
      const nx = n.x + dx;
      const ny = n.y + dy;
      const ng = n.g + Math.hypot(dx, dy);
      if (ng > maxLen) continue;
      if (pointBlocked(nx, ny, blockers, radius)) continue;
      if (moveHitsWall(n.x, n.y, nx, ny, blockers, radius, 0)) continue;
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
  const slid = slideMove(origin, to, blockers, radius);
  if (!slid.blocked && !pointBlocked(slid.x, slid.y, blockers, radius)) return slid;
  const straight = Math.hypot(to.x - origin.x, to.y - origin.y);
  const goalFree = !pointBlocked(to.x, to.y, blockers, radius);
  if (goalFree && straight > SLIDE_REACH_EPS) {
    const limit = Math.min(Math.max(maxDist, 0), straight * DOORWAY_DETOUR + DOORWAY_PAD);
    const walked = shortWalk(origin, to, blockers, radius, limit);
    if (walked != null && walked <= maxDist + 1) return { x: to.x, y: to.y, blocked: false };
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
  const frame = 1000 / 60;
  for (let i = 0; i < 8 && left > 1e-4; i++) {
    const dt = Math.min(frame, left);
    left -= dt;
    const dist = speed * dt / 1000;
    const next = slideMove({ x, y }, { x: x + ux * dist, y: y + uy * dist }, blockers, radius);
    x = next.x;
    y = next.y;
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
