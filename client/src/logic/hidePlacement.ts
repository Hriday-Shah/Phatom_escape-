import type { ItemKind } from './items';

type PlacedLike = { kind: string; variant?: string; spotId?: string | null };

/** True when this menu instance is already hidden (controller ignored). */
export function hideInstanceAlreadyPlaced(
  kind: ItemKind,
  variant: string | undefined,
  items: readonly PlacedLike[],
): boolean {
  const placed = items.filter((i) => i.spotId && i.kind !== 'game_controller');
  if (kind === 'toy_car' || kind === 'battery') {
    return placed.some((i) => i.kind === kind && i.variant === variant);
  }
  return placed.some((i) => i.kind === kind);
}

export function hideVariantRequired(kind: ItemKind): boolean {
  return kind === 'toy_car' || kind === 'battery';
}