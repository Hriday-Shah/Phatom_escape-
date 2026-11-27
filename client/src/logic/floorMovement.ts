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
  normaliseFloor,
  upperFloorWalls,
} from '../data/houseFloors';

export type FloorPose = { x: number; y: number; f: FloorId };

/** Ground: step into this pad to ride up. Upper: step into this pad to ride down. */
export const STAIR_PAD_GROUND: Rect = { x: 565, y: 118, width: 110, height: 28 };
export const STAIR_PAD_UPPER: Rect = { x: 565, y: -28, width: 110, height: 36 };

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
  return x >= pad.x && x <= pad.x + pad.width && y >= pad.y && y <= pad.y + pad.height;
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
  const stepped = applyStairTransition({ x, y, f: prev.f });
  if (stepped) return stepped;
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