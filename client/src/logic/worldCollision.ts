/**
 * Shared world collision and reach checks used by the client and the server
 * (R15-3, R15-4, R15-10). Geometry comes from houseLayout + colliders, the
 * same bodies GameScene puts in the Arcade wall group: walls (with exterior
 * growth), blocking furniture, and locked doors. Line of sight uses walls and
 * locked doors only; furniture never blocks sight.
 */
import { getStaticColliders, type Rect } from '../data/colliders';
import { PLAYER_BODY_RADIUS } from '../config/playerConfig';
import { hasLineOfSight, distanceToRect, centerOf, buildInteractables } from './spotTargeting';
import { houseLayout } from '../data/houseLayout';

export const NEAR_ITEM = 90;

export function hidingSpots(): { id: string; x: number; y: number; width: number; height: number }[] {
  return buildInteractables(houseLayout.hidingSpots).map((s) => ({
    id: s.id, x: s.x, y: s.y, width: s.width, height: s.height,
  }));
}

export type Point = { x: number; y: number };

/** Bodies the player cannot walk through (matches GameScene.wallGroup + locked doors). */
export function movementBlockers(debugUnlock = false): Rect[] {
  const c = getStaticColliders(debugUnlock);
  return [...c.walls, ...c.furniture, ...c.doors];
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

/** Does a circle swept from A to B hit a blocker? */
export function moveHitsWall(
  x0: number, y0: number, x1: number, y1: number,
  blockers: Rect[], radius = PLAYER_BODY_RADIUS,
): boolean {
  if (pointBlocked(x1, y1, blockers, radius)) return true;
  for (const b of blockers) {
    if (segmentHitsInflated(x0, y0, x1, y1, b, radius)) return true;
  }
  return false;
}

function segmentHitsInflated(x0: number, y0: number, x1: number, y1: number, r: Rect, radius: number): boolean {
  const box = inflateRect(r, radius);
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
  from: Point, to: Point, blockers: Rect[], radius = PLAYER_BODY_RADIUS,
): Point & { blocked: boolean } {
  if (!moveHitsWall(from.x, from.y, to.x, to.y, blockers, radius)) {
    return { x: to.x, y: to.y, blocked: false };
  }
  let lo = 0, hi = 1;
  let best = { x: from.x, y: from.y };
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    const x = from.x + (to.x - from.x) * mid;
    const y = from.y + (to.y - from.y) * mid;
    if (moveHitsWall(from.x, from.y, x, y, blockers, radius) || pointBlocked(x, y, blockers, radius)) {
      hi = mid;
    } else {
      best = { x, y };
      lo = mid;
    }
  }
  return { x: Math.round(best.x * 10) / 10, y: Math.round(best.y * 10) / 10, blocked: true };
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
