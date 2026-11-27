/**
 * Circular minimap geometry. Fog is this player's own light (seen this round or
 * lit now). Other people are a bearing on the rim, never a dot at their x,y.
 */
import type { FloorId } from '../data/houseFloors';
import { floorBounds } from '../data/houseFloors';
import type { Box } from '../ui/shellLayout';
import { BEARING_SECTORS } from './interest';
import type { RoundRole } from './roundPhase';

export interface RevealStamp { floor: FloorId; x: number; y: number; r: number }

export interface MinimapBearing { id: string; sector: number; tint: number }

export interface MinimapFrame {
  show: boolean;
  floor: FloorId;
  x: number;
  y: number;
  radius: number;
  role: RoundRole | null;
  bearings: MinimapBearing[];
  /** Offline ?debug=nolight may light the whole floor. Online play leaves this false. */
  fullReveal: boolean;
}

export interface MinimapFit { ox: number; oy: number; scale: number }

/** Fit the current floor inside the circle's inscribed square. */
export function minimapFit(floor: FloorId, box: Box): MinimapFit {
  const b = floorBounds(floor);
  const side = box.w * Math.SQRT1_2;
  const margin = (box.w - side) / 2;
  const scale = side / Math.max(b.width, b.height);
  const drawnW = b.width * scale;
  const drawnH = b.height * scale;
  return {
    ox: box.x + margin + (side - drawnW) / 2,
    oy: box.y + margin + (side - drawnH) / 2,
    scale,
  };
}

export function floorToMinimap(floor: FloorId, x: number, y: number, box: Box): { x: number; y: number } {
  const b = floorBounds(floor);
  const fit = minimapFit(floor, box);
  return { x: fit.ox + (x - b.x) * fit.scale, y: fit.oy + (y - b.y) * fit.scale };
}

/** Arrow tip sits on a ring around the centre. Distance does not move it. */
export function arrowAnchor(cx: number, cy: number, radius: number, sector: number, sectors = BEARING_SECTORS): { x: number; y: number } {
  const ang = (sector / sectors) * Math.PI * 2;
  const d = radius * 0.72;
  return { x: cx + Math.cos(ang) * d, y: cy + Math.sin(ang) * d };
}

export function revealCovers(stamps: readonly RevealStamp[], floor: FloorId, x: number, y: number): boolean {
  return stamps.some((s) => s.floor === floor && Math.hypot(s.x - x, s.y - y) <= s.r + 1e-6);
}

/** Append a light circle unless the last stamp on this floor already covers the step. */
export function pushReveal(stamps: readonly RevealStamp[], floor: FloorId, x: number, y: number, r: number): RevealStamp[] {
  if (!(r > 0)) return stamps as RevealStamp[];
  const last = [...stamps].reverse().find((s) => s.floor === floor);
  if (last && Math.hypot(last.x - x, last.y - y) < Math.max(8, r * 0.2) && Math.abs(last.r - r) < 1) return stamps as RevealStamp[];
  return [...stamps, { floor, x, y, r }];
}
