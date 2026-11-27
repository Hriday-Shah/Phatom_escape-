/**
 * Hiding rules for the locked bedroom: at most three items, and never the room key.
 * Shared by the server (placement + auto-place) and the Phantom item menu.
 */
import { houseLayout } from '../data/houseLayout';
import type { ItemKind, WorldItem } from './items';
import { hidingSpotList } from './itemRound';
import { spotFloor } from './floorMovement';

export const BEDROOM_HIDE_LIMIT = 3;
export const BEDROOM_LIMIT_ERROR = 'At most 3 items can be hidden in the locked bedroom.';
export const BEDROOM_KEY_ERROR = 'The room key cannot be hidden in the locked bedroom.';

export function bedroomRoom() {
  return houseLayout.rooms.find((r) => r.id === 'bedroom') ?? { x: 70, y: 140, width: 360, height: 240 };
}

export function isBedroomPoint(x: number, y: number): boolean {
  const room = bedroomRoom();
  return x >= room.x && x < room.x + room.width && y >= room.y && y < room.y + room.height;
}

export function isBedroomSpot(spotId: string): boolean {
  const spot = hidingSpotList().find((s) => s.id === spotId) ?? houseLayout.hidingSpots.find((s) => s.id === spotId);
  if (!spot) return false;
  return isBedroomPoint(spot.x + spot.width / 2, spot.y + spot.height / 2);
}

export function bedroomItemCount(items: readonly { spotId?: string | null }[]): number {
  return items.reduce((n, i) => n + (i.spotId && isBedroomSpot(i.spotId) ? 1 : 0), 0);
}

/** Reason a placement is illegal, or null if it is allowed. */
export function bedroomHideError(
  kind: string,
  spotId: string | null | undefined,
  itemsAlreadyPlaced: readonly { spotId?: string | null; kind?: string; x?: number; y?: number }[],
  at?: { x: number; y: number } | null,
): string | null {
  const inBedroom = (spotId && isBedroomSpot(spotId)) || (!spotId && at && isBedroomPoint(at.x, at.y));
  if (!inBedroom) return null;
  if (kind === 'room_key') return BEDROOM_KEY_ERROR;
  if (bedroomItemCount(itemsAlreadyPlaced) >= BEDROOM_HIDE_LIMIT) return BEDROOM_LIMIT_ERROR;
  return null;
}

/** Fill empty spots for items that have no spot, honouring the bedroom rules. Mutates `items`. */
export function autoPlaceHiddenItems(
  items: WorldItem[],
  rng: () => number = Math.random,
): WorldItem[] {
  const spots = hidingSpotList();
  const taken = new Set(items.filter((i) => i.spotId).map((i) => i.spotId as string));
  const free = spots.filter((s) => !taken.has(s.id));
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.min(free.length - 1, Math.floor(Math.max(0, rng()) * (i + 1)));
    const tmp = free[i]!;
    free[i] = free[j]!;
    free[j] = tmp;
  }
  for (const item of items) {
    // Floor drops already have a pose (spotId null, x/y set). Only leftovers still at the origin need a spot.
    if (item.spotId || item.heldBy) continue;
    if (item.x !== 0 || item.y !== 0) continue;
    const idx = free.findIndex((s) => !bedroomHideError(item.kind, s.id, items));
    if (idx < 0) continue;
    const spot = free.splice(idx, 1)[0]!;
    item.spotId = spot.id;
    item.x = spot.x + spot.width / 2;
    item.y = spot.y + spot.height / 2;
    item.heldBy = null;
    item.f = spotFloor(spot.id);
  }
  return items;
}

export type { ItemKind };
