/**
 * Shared floor movement: blockers per floor and stair transitions (walk-on).
 * Client and server both call these after a slide step.
 */
import type { Rect } from '../data/colliders';
import { getStaticColliders } from '../data/colliders';
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

export function movementBlockersForFloor(floor: FloorId, debugUnlock = false): Rect[] {
  if (floor === FLOOR_UPPER) return [...upperFloorWalls()];
  const c = getStaticColliders(debugUnlock);
  return [...c.walls, ...c.furniture, ...c.spots, ...c.doors];
}

export function losBlockersForFloor(floor: FloorId, debugUnlock = false): Rect[] {
  if (floor === FLOOR_UPPER) return upperFloorWalls();
  const c = getStaticColliders(debugUnlock);
  return [...c.walls, ...c.doors];
}

export function spotFloor(_spotId: string): FloorId {
  return FLOOR_GROUND;
}

export function footOnStairPad(x: number, y: number, floor: FloorId): boolean {
  const pad = floor === FLOOR_UPPER ? STAIR_PAD_UPPER : STAIR_PAD_GROUND;
  return x >= pad.x && x <= pad.x + pad.width && y >= pad.y && y <= pad.y + pad.height;
}

/**
 * After a move, if the feet are on the stair pad, pop to the other floor's landing.
 * Returns null when no transition happens.
 */
export function applyStairTransition(pose: FloorPose): FloorPose | null {
  if (!footOnStairPad(pose.x, pose.y, pose.f)) return null;
  if (pose.f === FLOOR_GROUND) {
    return { x: STAIR_LAND_UPPER.x, y: STAIR_LAND_UPPER.y, f: FLOOR_UPPER };
  }
  return { x: STAIR_LAND_GROUND.x, y: STAIR_LAND_GROUND.y, f: FLOOR_GROUND };
}

/** Reject a client pose whose floor jumped without standing on a stair pad. */
export function reconcileFloor(
  prev: FloorPose,
  requested: { x: number; y: number; f?: unknown },
): FloorPose {
  const afterMove: FloorPose = { x: requested.x, y: requested.y, f: prev.f };
  const stair = applyStairTransition(afterMove);
  if (stair) return stair;
  const want = normaliseFloor(requested.f);
  if (want !== prev.f) return { x: requested.x, y: requested.y, f: prev.f };
  return { x: requested.x, y: requested.y, f: prev.f };
}