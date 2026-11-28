/**
 * Stage 3-A: two-floor architecture. The ground floor is the existing houseLayout.
 * The upper floor is a single placeholder deck above the living-room window — no
 * upstairs rooms, furniture, or hiding spots yet.
 */
import type { Rect } from './colliders';
import { houseLayout, type WindowRect } from './houseLayout';

export const FLOOR_GROUND = 0;
export const FLOOR_UPPER = 1;
export type FloorId = typeof FLOOR_GROUND | typeof FLOOR_UPPER;

/** Former living-room window opening (now stairs art, not a window tile). */
export const LIVING_STAIR_OPENING = { x: 540, y: 100, width: 160, height: 10 };

/** Keep living-room stairs out of composed window tiles (even if windows[] was stale). */
export function composeWindowRects(windows: readonly WindowRect[]): WindowRect[] {
  const o = LIVING_STAIR_OPENING;
  return windows.filter((w) => !(w.x < o.x + o.width && w.x + w.width > o.x && w.y < o.y + o.height && w.y + w.height > o.y));
}

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
  if (floor === FLOOR_UPPER) {
    // The visual deck ends at y=-20, but a 16px body would stop 8px short of the
    // down-stair pad (y=-28). Extend the walkable bounds to include the pad;
    // upper walls stay on UPPER_DECK (with a gap at the stairs).
    const padBottom = STAIR_PAD_UPPER.y + STAIR_PAD_UPPER.height;
    return { x: UPPER_DECK.x, y: UPPER_DECK.y, width: UPPER_DECK.width, height: Math.max(UPPER_DECK.height, padBottom - UPPER_DECK.y) };
  }
  return { x: 0, y: 0, width: houseLayout.width, height: houseLayout.height };
}

/** Walk-on pads: ground to go up, upper to go down (see logic/floorMovement.ts). */
export const STAIR_PAD_GROUND: Rect = { x: 565, y: 118, width: 110, height: 28 };
export const STAIR_PAD_UPPER: Rect = { x: 565, y: -28, width: 110, height: 36 };

/** Landings after a stair transition (see logic/floorMovement.ts stair pads). */
/** South of the ground stair pad so a landing does not immediately re-trigger going up. */
/** 40px south of the ground pad (which ends at y=146) so descent does not instantly re-ride up. */
export const STAIR_LAND_GROUND = { x: 620, y: 186 };
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