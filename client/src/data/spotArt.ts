/**
 * Placement of a hiding-spot's art in the world: optional clockwise rotation and a
 * sprite offset used when the layout rect is trimmed to fit (the art may extend
 * past the physics body).
 *
 * Section rects in drawerSlices.ts stay in unrotated 1x art px; this module maps
 * them to world space so targeting, highlights and open-overlays stay aligned.
 */
import { HidingSpot } from './houseLayout';

export type SpotRotation = 0 | 90 | 180 | 270;

export interface ArtRect { x: number; y: number; w: number; h: number }
export interface WorldRect { x: number; y: number; width: number; height: number }

export function spotRotation(spot: HidingSpot): SpotRotation {
  return spot.rotation ?? 0;
}

/** Unrotated art size in 1x art px. */
export function unrotatedArtSize(spot: HidingSpot): { w: number; h: number } {
  if (spot.artSize) return spot.artSize;
  return { w: spot.width / 2, h: spot.height / 2 };
}

/** World size of the (possibly rotated, untrimmed) sprite. */
export function spriteWorldSize(spot: HidingSpot): { width: number; height: number } {
  const rot = spotRotation(spot);
  const art = unrotatedArtSize(spot);
  const w = (rot === 90 || rot === 270) ? art.h : art.w;
  const h = (rot === 90 || rot === 270) ? art.w : art.h;
  return { width: w * 2, height: h * 2 };
}

/** Top-left of the untrimmed sprite in world px (layout top-left plus spriteOffset). */
export function spriteTopLeft(spot: HidingSpot): { x: number; y: number } {
  return { x: spot.x + (spot.spriteOffset?.x ?? 0), y: spot.y + (spot.spriteOffset?.y ?? 0) };
}

/** Centre of the untrimmed sprite in world px (Phaser origin 0.5, 0.5). */
export function spriteCenter(spot: HidingSpot): { x: number; y: number } {
  const o = spriteTopLeft(spot);
  const s = spriteWorldSize(spot);
  return { x: o.x + s.width / 2, y: o.y + s.height / 2 };
}

/** Map a rect in unrotated art px into rotated art-px space (clockwise). */
export function rotateArtRect(s: ArtRect, artW: number, artH: number, rot: SpotRotation): ArtRect {
  if (rot === 0) return { x: s.x, y: s.y, w: s.w, h: s.h };
  if (rot === 90) return { x: artH - s.y - s.h, y: s.x, w: s.h, h: s.w };
  if (rot === 180) return { x: artW - s.x - s.w, y: artH - s.y - s.h, w: s.w, h: s.h };
  return { x: s.y, y: artW - s.x - s.w, w: s.h, h: s.w }; // 270
}

/** World rect of section `s` of a (possibly rotated / offset) unit. */
export function sectionWorldRect(spot: HidingSpot, s: ArtRect): WorldRect {
  const rot = spotRotation(spot);
  const art = unrotatedArtSize(spot);
  const r = rotateArtRect(s, art.w, art.h, rot);
  const o = spriteTopLeft(spot);
  return { x: o.x + r.x * 2, y: o.y + r.y * 2, width: r.w * 2, height: r.h * 2 };
}
