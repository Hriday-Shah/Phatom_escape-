/**
 * Shared world collision and reach checks used by the client and the server
 * (R15-3, R15-4, R15-10). Geometry comes from houseLayout + colliders, the
 * same bodies GameScene puts in the Arcade wall group: walls (with exterior
 * growth), blocking furniture, and locked doors. Line of sight uses walls and
 * locked doors only; furniture never blocks sight.
 */
import { type Rect } from '../data/colliders';
import { PLAYER_BODY_RADIUS } from '../config/playerConfig';
import { PLAYER_SPEED } from '../config/physicsConfig';
import { hasLineOfSight, distanceToRect, centerOf, buildInteractables } from './spotTargeting';
import { houseLayout } from '../data/houseLayout';
import { FLOOR_GROUND, type FloorId, normaliseFloor, poseInsideFloor } from '../data/houseFloors';
import { losBlockersForFloor, movementBlockersForFloor, spotFloor } from './floorMovement';

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
export function movementBlockers(debugUnlock = false, floor: FloorId | number = FLOOR_GROUND): Rect[] {
  return movementBlockersForFloor(normaliseFloor(floor), debugUnlock);
}

/** Bodies that block sight (walls + locked doors; furniture never does). */
export function losBlockers(debugUnlock = false, floor: FloorId | number = FLOOR_GROUND): Rect[] {
  return losBlockersForFloor(normaliseFloor(floor), debugUnlock);
}

/** Walls and locked doors only — used so furniture corners are not treated as doorways. */
export function wallDoorBlockers(debugUnlock = false, floor: FloorId | number = FLOOR_GROUND): Rect[] {
  return losBlockersForFloor(normaliseFloor(floor), debugUnlock);
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

/**
 * Segment vs axis-aligned rect (Liang-Barsky). The boundary counts as a hit
 * so a graze is rejected; callers shrink `rad` with `skin` to allow wall slides.
 */
function segmentHitsRect(x0: number, y0: number, x1: number, y1: number, box: Rect): boolean {
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

function segmentHitsPoint(x0: number, y0: number, x1: number, y1: number, px: number, py: number, rad: number): boolean {
  const dx = x1 - x0, dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 0) t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len2));
  return Math.hypot(x0 + dx * t - px, y0 + dy * t - py) < rad;
}

/**
 * Swept-circle vs AABB. The Minkowski sum is a rectangle with rounded corners,
 * not a square-inflated box. Square inflation was ~0.4 r too fat at corners and
 * froze legal poses next to door jambs (the circle was free, every step looked
 * like a hit).
 */
function segmentHitsInflated(x0: number, y0: number, x1: number, y1: number, r: Rect, radius: number, skin = 0): boolean {
  const rad = Math.max(0, radius - skin) - 0.01;
  if (rad <= 0) return segmentHitsRect(x0, y0, x1, y1, r);
  // Face pads: grow on one axis only, leaving the corner squares to the circles.
  const padX = { x: r.x - rad, y: r.y, width: r.width + rad * 2, height: r.height };
  const padY = { x: r.x, y: r.y - rad, width: r.width, height: r.height + rad * 2 };
  if (segmentHitsRect(x0, y0, x1, y1, padX) || segmentHitsRect(x0, y0, x1, y1, padY)) return true;
  const rx = r.x + r.width, ry = r.y + r.height;
  return segmentHitsPoint(x0, y0, x1, y1, r.x, r.y, rad)
    || segmentHitsPoint(x0, y0, x1, y1, rx, r.y, rad)
    || segmentHitsPoint(x0, y0, x1, y1, r.x, ry, rad)
    || segmentHitsPoint(x0, y0, x1, y1, rx, ry, rad);
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
  return { x: best.x, y: best.y, blocked: true };
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

/** How far corner-assist may look along a wall for an opening. */
const CORNER_LOOK = 64;
/** Ignore a "funnel" that only opens after walking past a piece of furniture. */
const FUNNEL_MAX = 40;
const AXIS = [
  { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
] as const;

function movedFar(a: Point, b: Point, eps = SLIDE_REACH_EPS): boolean {
  return Math.hypot(b.x - a.x, b.y - a.y) > eps;
}

/**
 * When the stick is blocked, try a short sideways shuffle. If walking that
 * way soon lets the original direction through (a door a body-width to the
 * side), slide that way this frame. If the body is in a corner and only one
 * side is free, slide along that face so the sprite does not freeze.
 */
function cornerAssist(
  from: Point, ux: number, uy: number, dist: number,
  blockers: Rect[], radius: number, wallDoors: Rect[] = wallDoorBlockers(),
): Point | null {
  const open: { dir: { x: number; y: number }; detour: number; dot: number }[] = [];
  const blocked: { x: number; y: number }[] = [];
  const funnel: { dir: { x: number; y: number }; detour: number; progress: number }[] = [];
  const pocket = Math.max(radius, dist);
  for (const a of AXIS) {
    const slid = clampMove(from, { x: from.x + a.x * CORNER_LOOK, y: from.y + a.y * CORNER_LOOK }, blockers, radius, SLIDE_SKIN);
    const detour = Math.hypot(slid.x - from.x, slid.y - from.y);
    const dot = a.x * ux + a.y * uy;
    // A 5px pocket under a cabinet is not a free face for corner detection.
    if (detour <= pocket) { blocked.push(a); if (detour <= SLIDE_REACH_EPS) continue; }
    else open.push({ dir: a, detour, dot });
    // Backing up always "opens" the original direction; only look sideways or forward.
    // Probe along the path so a doorway mid-way is not missed after overshooting the jamb.
    // Only funnel around wall/door gaps, not the near corner of a table the player is pushing into.
    if (dot > -0.2 && detour > SLIDE_REACH_EPS
        && moveHitsWall(from.x, from.y, from.x + ux * 4, from.y + uy * 4, wallDoors, radius, SLIDE_SKIN)) {
      let bestProgress = 0;
      let bestDetour = detour;
      for (let t = Math.min(8, detour); t <= detour + 1e-6; t += 8) {
        const mx = from.x + a.x * t;
        const my = from.y + a.y * t;
        const mid = clampMove(from, { x: mx, y: my }, blockers, radius, SLIDE_SKIN);
        if (pointBlocked(mid.x, mid.y, blockers, radius)) break;
        const ahead = clampMove(mid, { x: mid.x + ux * dist, y: mid.y + uy * dist }, blockers, radius, SLIDE_SKIN);
        const progress = (ahead.x - from.x) * ux + (ahead.y - from.y) * uy;
        if (progress > bestProgress) { bestProgress = progress; bestDetour = Math.hypot(mid.x - from.x, mid.y - from.y); }
      }
      if (bestProgress > SLIDE_REACH_EPS && bestDetour <= FUNNEL_MAX) funnel.push({ dir: a, detour: bestDetour, progress: bestProgress });
    }
  }
  // Prefer a short shuffle that opens the original direction (a doorway to the side).
  // If the stick is nearly cardinal into a corner, slide along the one free side
  // so the sprite does not freeze. Diagonals are left alone to avoid oscillating
  // between the two faces.
  const inCorner = blocked.some((a, i) => blocked.some((b, j) => j > i && a.x * b.x + a.y * b.y === 0));
  const cardinal = Math.min(Math.abs(ux), Math.abs(uy)) < 0.25;
  const sides = inCorner && cardinal ? open.filter((o) => Math.abs(o.dot) < 0.25) : [];
  const pick = funnel.length
    ? funnel.sort((a, b) => a.detour - b.detour || b.progress - a.progress)[0]
    : (sides.length === 1 ? sides[0] : null);
  if (!pick) return null;
  const next = clampMove(
    from,
    { x: from.x + pick.dir.x * dist, y: from.y + pick.dir.y * dist },
    blockers, radius, SLIDE_SKIN,
  );
  return movedFar(from, next) && !pointBlocked(next.x, next.y, blockers, radius) ? next : null;
}

/**
 * One 60 Hz step: walk toward the stick, then spend leftover speed sliding
 * along a wall at full step length (not the tiny projected tangent). A player
 * who aims mostly through a door but is a few pixels off the opening then
 * slides into it instead of creeping.
 */
function stepSlide(
  from: Point, ux: number, uy: number, dist: number,
  blockers: Rect[], radius: number, wallDoors: Rect[] = wallDoorBlockers(),
): Point {
  const to = { x: from.x + ux * dist, y: from.y + uy * dist };
  const direct = clampMove(from, to, blockers, radius, SLIDE_SKIN);
  let best: Point = direct;
  const remain = dist - Math.hypot(direct.x - from.x, direct.y - from.y);
  if (remain > SLIDE_REACH_EPS) {
    const sx = Math.sign(ux), sy = Math.sign(uy);
    const alongX = clampMove(direct, { x: direct.x + sx * remain, y: direct.y }, blockers, radius, SLIDE_SKIN);
    const xy = clampMove(alongX, { x: alongX.x, y: alongX.y + sy * remain }, blockers, radius, SLIDE_SKIN);
    const alongY = clampMove(direct, { x: direct.x, y: direct.y + sy * remain }, blockers, radius, SLIDE_SKIN);
    const yx = clampMove(alongY, { x: alongY.x + sx * remain, y: alongY.y }, blockers, radius, SLIDE_SKIN);
    const leftX = Math.hypot(to.x - xy.x, to.y - xy.y);
    const leftY = Math.hypot(to.x - yx.x, to.y - yx.y);
    best = leftX <= leftY ? xy : yx;
  }
  const travelled = Math.hypot(best.x - from.x, best.y - from.y);
  if (travelled < dist * 0.5) {
    const assisted = cornerAssist(from, ux, uy, dist, blockers, radius, wallDoors);
    if (assisted && Math.hypot(assisted.x - from.x, assisted.y - from.y) >= travelled) {
      best = assisted;
    }
  }
  if (pointBlocked(best.x, best.y, blockers, radius)) return from;
  return best;
}


function snapFreeTenth(x: number, y: number, blockers: Rect[], radius: number): Point {
  const rx = roundTenth(x), ry = roundTenth(y);
  if (!pointBlocked(rx, ry, blockers, radius)) return { x: rx, y: ry };
  for (let s = 1; s <= 8; s++) {
    for (let dx = -s; dx <= s; dx++) {
      for (let dy = -s; dy <= s; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== s) continue;
        const p = { x: roundTenth(rx + dx / 10), y: roundTenth(ry + dy / 10) };
        if (!pointBlocked(p.x, p.y, blockers, radius)) return p;
      }
    }
  }
  if (!pointBlocked(x, y, blockers, radius)) return { x, y };
  return nearestFree({ x, y }, blockers, radius);
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
  wallDoors: Rect[] = wallDoorBlockers(),
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
  const frame = 1000 / 60;
  for (let i = 0; i < 8 && left > 1e-4; i++) {
    const dt = Math.min(frame, left);
    left -= dt;
    const dist = speed * dt / 1000;
    const next = stepSlide({ x, y }, ux, uy, dist, blockers, radius, wallDoors);
    x = next.x;
    y = next.y;
  }
  // Tenths are what the phone sends; pick a free tenth so rounding cannot
  // push a legal pose into a corner and desync the server.
  return snapFreeTenth(x, y, blockers, radius);
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

export function canUseSpot(
  pose: Point & { f?: number },
  spotId: string,
  reach = NEAR_ITEM,
): boolean {
  const spot = spotById(spotId);
  if (!spot) return false;
  const f = normaliseFloor(pose.f);
  if (f !== spotFloor(spotId)) return false;
  return reachableWithLos(pose, spot, reach, losBlockers(false, f));
}

export function poseOnFloor(pose: Point & { f?: number }, radius = PLAYER_BODY_RADIUS): boolean {
  return poseInsideFloor(pose.x, pose.y, normaliseFloor(pose.f), radius);
}

export { poseInsideFloor };

export { hasLineOfSight, distanceToRect, PLAYER_BODY_RADIUS };
