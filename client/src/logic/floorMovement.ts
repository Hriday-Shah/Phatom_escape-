/**
 * Shared floor movement: blockers per floor and stair transitions (walk-on).
 * Client and server both call these after a slide step.
 */
import type { Rect } from '../data/colliders';
import { getStaticColliders } from '../data/colliders';
import { EXTERIOR_WALL_BODY_EXTRA } from '../config/physicsConfig';
import { houseLayout } from '../data/houseLayout';
import {
  FLOOR_GROUND,
  FLOOR_UPPER,
  type FloorId,
  STAIR_LAND_GROUND,
  STAIR_LAND_UPPER,
  STAIR_PAD_GROUND,
  STAIR_PAD_UPPER,
  normaliseFloor,
  upperFloorWalls,
} from '../data/houseFloors';

export type FloorPose = { x: number; y: number; f: FloorId };

/** Ground: step into this pad to ride up. Upper: step into this pad to ride down. */
export { STAIR_PAD_GROUND, STAIR_PAD_UPPER };

export function movementBlockersForFloor(floor: FloorId, debugUnlock = false, passBedroom = false): Rect[] {
  if (floor === FLOOR_UPPER) return [...upperFloorWalls()];
  const c = getStaticColliders(debugUnlock, EXTERIOR_WALL_BODY_EXTRA, houseLayout, passBedroom);
  return [...c.walls, ...c.furniture, ...c.spots, ...c.doors];
}

export function losBlockersForFloor(floor: FloorId, debugUnlock = false): Rect[] {
  if (floor === FLOOR_UPPER) return upperFloorWalls();
  const c = getStaticColliders(debugUnlock);
  return [...c.walls, ...c.doors];
}

/** Walls + doors that still block this body (bedroom door omitted when the Phantom may pass). */
export function wallDoorBlockersForFloor(floor: FloorId, debugUnlock = false, passBedroom = false): Rect[] {
  if (floor === FLOOR_UPPER) return upperFloorWalls();
  const c = getStaticColliders(debugUnlock, EXTERIOR_WALL_BODY_EXTRA, houseLayout, passBedroom);
  return [...c.walls, ...c.doors];
}

export function spotFloor(_spotId: string): FloorId {
  return FLOOR_GROUND;
}

export function footOnStairPad(x: number, y: number, floor: FloorId): boolean {
  const pad = floor === FLOOR_UPPER ? STAIR_PAD_UPPER : STAIR_PAD_GROUND;
  return pointInRect(x, y, pad);
}

function pointInRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
}

/** True if the segment touches or crosses the pad (so a long step cannot tunnel through it). */
export function segmentHitsRect(x0: number, y0: number, x1: number, y1: number, r: Rect): boolean {
  if (pointInRect(x0, y0, r) || pointInRect(x1, y1, r)) return true;
  const minX = r.x, maxX = r.x + r.width, minY = r.y, maxY = r.y + r.height;
  if ((x0 < minX && x1 < minX) || (x0 > maxX && x1 > maxX) || (y0 < minY && y1 < minY) || (y0 > maxY && y1 > maxY)) {
    return false;
  }
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return clip(-dx, x0 - minX) && clip(dx, maxX - x0) && clip(-dy, y0 - minY) && clip(dy, maxY - y0);
}

function stairPadFor(floor: FloorId): Rect {
  return floor === FLOOR_UPPER ? STAIR_PAD_UPPER : STAIR_PAD_GROUND;
}

export const STAIR_LANDING_SNAP = 32;

export function stairLandingPose(fromFloor: FloorId): FloorPose {
  if (fromFloor === FLOOR_GROUND) {
    return { x: STAIR_LAND_UPPER.x, y: STAIR_LAND_UPPER.y, f: FLOOR_UPPER };
  }
  return { x: STAIR_LAND_GROUND.x, y: STAIR_LAND_GROUND.y, f: FLOOR_GROUND };
}

/**
 * After a move, if the feet are on the stair pad, pop to the other floor's landing.
 * Returns null when no transition happens.
 */
export function applyStairTransition(pose: FloorPose): FloorPose | null {
  if (!footOnStairPad(pose.x, pose.y, pose.f)) return null;
  return stairLandingPose(pose.f);
}

/**
 * Walk-on pads or a client landing snap when the previous pose was on/near the pad
 * (online clients may jump to the landing in one frame without an intermediate pos).
 */
export function resolveStairAfterMove(prev: FloorPose, x: number, y: number): FloorPose {
  const pad = stairPadFor(prev.f);
  // Ending on the pad, starting on it, or a long step that tunnels through it
  // all count as taking the stairs. A client that already snapped to the landing
  // sends that point in one pos; the segment from the last upstairs pose crosses
  // the pad, so the server must follow instead of leaving them on floor 2.
  if (
    footOnStairPad(x, y, prev.f) ||
    footOnStairPad(prev.x, prev.y, prev.f) ||
    segmentHitsRect(prev.x, prev.y, x, y, pad)
  ) {
    return stairLandingPose(prev.f);
  }
  const land = stairLandingPose(prev.f);
  if (
    land.f !== prev.f &&
    Math.hypot(x - land.x, y - land.y) <= STAIR_LANDING_SNAP &&
    footOnStairPad(prev.x, prev.y, prev.f)
  ) {
    return land;
  }
  return { x, y, f: prev.f };
}

/** Reject a client pose whose floor jumped without standing on a stair pad. */
export function reconcileFloor(
  prev: FloorPose,
  requested: { x: number; y: number; f?: unknown },
): FloorPose {
  const resolved = resolveStairAfterMove(prev, requested.x, requested.y);
  if (resolved.f !== prev.f) return resolved;
  const want = normaliseFloor(requested.f);
  if (want !== prev.f) return { x: requested.x, y: requested.y, f: prev.f };
  return { x: requested.x, y: requested.y, f: prev.f };
}