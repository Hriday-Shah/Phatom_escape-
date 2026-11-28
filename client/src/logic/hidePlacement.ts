import type { ItemKind } from './items';

type WorldLike = { kind: string; variant?: string; spotId?: string | null; heldBy?: string | null; x?: number; y?: number };

/** True when this menu instance already exists in the world (spot, floor, or held). Paper code is not a hidden item. */
export function hideInstanceAlreadyPlaced(
  kind: ItemKind,
  variant: string | undefined,
  items: readonly WorldLike[],
): boolean {
  return hideInstances(kind, variant, items).length > 0;
}

export function hideInstances(
  kind: ItemKind,
  variant: string | undefined,
  items: readonly WorldLike[],
): WorldLike[] {
  if (kind === 'paper_code') return [];
  const existing = items.filter((i) => i.kind !== 'paper_code');
  if (kind === 'toy_car' || kind === 'battery') {
    return existing.filter((i) => i.kind === kind && i.variant === variant);
  }
  return existing.filter((i) => i.kind === kind);
}

/** A hidden placement: in a spot or on the floor, not held. Origin (0,0) leftovers are not hidden yet. */
export function isHiddenPlacement(item: { heldBy?: string | null; spotId?: string | null; x?: number; y?: number; kind?: string }): boolean {
  if (item.kind === 'paper_code' || item.heldBy) return false;
  if (item.spotId) return true;
  return (item.x ?? 0) !== 0 || (item.y ?? 0) !== 0;
}

export function hideVariantRequired(kind: ItemKind): boolean {
  return kind === 'toy_car' || kind === 'battery';
}
