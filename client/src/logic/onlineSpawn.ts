/**
 * Online start positions: a walkable grid around the entrance spawn, spaced far enough
 * that 16-grapheme name labels at 9px do not overlap (R13-2).
 */
import { houseLayout } from '../data/houseLayout';
import { PLAYER_BODY_RADIUS } from '../config/playerConfig';

/** Centre-to-centre gap: wider than a max-length name label (~86 px at 9px). */
export const SPAWN_SPACING = 88;
/** Vertical gap between the two rows; keeps bodies off the entrance's south wall. */
export const SPAWN_ROW = 32;
export const SPAWN_SLOTS = 8;

type Pt = { x: number; y: number };

const solids: { x: number; y: number; width: number; height: number }[] = [
  ...houseLayout.walls,
  ...houseLayout.doors,
  ...houseLayout.hidingSpots,
  ...houseLayout.furniture.filter((f) => f.blocking),
];

function overlaps(px: number, py: number, r: number, b: { x: number; y: number; width: number; height: number }): boolean {
  const dx = Math.max(b.x - px, 0, px - (b.x + b.width));
  const dy = Math.max(b.y - py, 0, py - (b.y + b.height));
  return Math.hypot(dx, dy) < r - 0.5;
}

/** True when a 16 px player body at (x, y) is free of walls, doors and furniture. */
export function spawnWalkable(x: number, y: number, r = PLAYER_BODY_RADIUS): boolean {
  if (x - r < 0 || y - r < 0 || x + r > houseLayout.width || y + r > houseLayout.height) return false;
  return solids.every((s) => !overlaps(x, y, r, s));
}

function slotAt(origin: Pt, i: number): Pt {
  // Four columns centred a little east of the default spawn so column 0 clears the
  // entrance's left wall; a second row south, still above the main-door wall.
  return {
    x: origin.x + ((i % 4) - 1) * SPAWN_SPACING + 16,
    y: origin.y + (i < 4 ? 0 : SPAWN_ROW),
  };
}

function nudge(p: Pt): Pt | null {
  if (spawnWalkable(p.x, p.y)) return p;
  for (const d of [8, 16, 24, 32]) {
    for (const [dx, dy] of [[d, 0], [-d, 0], [0, -d], [0, d], [d, d], [d, -d], [-d, d], [-d, -d]]) {
      const q = { x: p.x + dx, y: p.y + dy };
      if (spawnWalkable(q.x, q.y)) return q;
    }
  }
  return null;
}

/** Eight walkable start points around `origin`, index-stable. */
export function onlineSpawnSlots(origin: Pt, count = SPAWN_SLOTS): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < count; i++) {
    const s = nudge(slotAt(origin, i));
    if (!s) throw new Error(`online spawn slot ${i} around (${origin.x},${origin.y}) is blocked`);
    out.push(s);
  }
  return out;
}

export function onlineSpawnPoint(origin: Pt, index: number): Pt {
  const slots = onlineSpawnSlots(origin);
  return slots[Math.max(0, index) % slots.length];
}
