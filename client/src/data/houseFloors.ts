/**
 * Stage 3-A: two-floor architecture. The ground floor is the existing houseLayout.
 * The upper floor is a single placeholder deck above the living-room window — no
 * upstairs rooms, furniture, or hiding spots yet.
 */
import type { Rect } from './colliders';
import { houseLayout } from './houseLayout';

export const FLOOR_GROUND = 0;
export const FLOOR_UPPER = 1;
export type FloorId = typeof FLOOR_GROUND | typeof FLOOR_UPPER;

/** Former living-room window opening (now stairs art, not a window tile). */
export const LIVING_STAIR_OPENING = { x: 540, y: 100, width: 160, height: 10 };

/**
 * Placeholder upper deck centred on the window. Sits in negative Y above the house
 * (no new art — GameScene draws a flat colour rect).
 */
export const UPPER_DECK: Rect = {
  x: 500,
  y: -130,
  width: 240,
  height: 110,
};

/** World bounds that include the upper deck and the full ground house. */
export function worldPixelBounds(): Rect {
  const minY = UPPER_DECK.y - 20;
  return {
    x: 0,
    y: minY,
    width: houseLayout.width,
    height: houseLayout.height - minY,
  };
}

/** Axis-aligned bounds used to validate poses on each floor. */
export function floorBounds(floor: FloorId): Rect {
  if (floor === FLOOR_UPPER) return { ...UPPER_DECK };
  return { x: 0, y: 0, width: houseLayout.width, height: houseLayout.height };
}

/** Landings after a stair transition (see logic/floorMovement.ts stair pads). */
/** South of the ground stair pad so a landing does not immediately re-trigger going up. */
export const STAIR_LAND_GROUND = { x: 620, y: 158 };
export const STAIR_LAND_UPPER = { x: 620, y: -68 };

export function normaliseFloor(f: unknown): FloorId {
  return f === FLOOR_UPPER ? FLOOR_UPPER : FLOOR_GROUND;
}

/** Collision bodies for the upper placeholder (not the ground-floor house). */
export function upperFloorWalls(): Rect[] {
  const d = UPPER_DECK;
  const thick = 10;
  const gap = { x: 557, width: 126 };
  const leftW = gap.x - d.x;
  const rightX = gap.x + gap.width;
  const rightW = d.x + d.width - rightX;
  return [
    { x: d.x, y: d.y, width: d.width, height: thick },
    { x: d.x, y: d.y, width: thick, height: d.height },
    { x: d.x + d.width - thick, y: d.y, width: thick, height: d.height },
    { x: d.x, y: d.y + d.height - thick, width: leftW, height: thick },
    { x: rightX, y: d.y + d.height - thick, width: rightW, height: thick },
  ];
}

export function poseInsideFloor(x: number, y: number, floor: FloorId, radius: number): boolean {
  const b = floorBounds(floor);
  return (
    x >= b.x + radius &&
    y >= b.y + radius &&
    x <= b.x + b.width - radius &&
    y <= b.y + b.height - radius
  );
}