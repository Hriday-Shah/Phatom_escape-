import { ITEM_INFO, ITEM_KINDS, type ItemKind } from '../logic/items';
import { BEDROOM_KEY_ERROR, BEDROOM_LIMIT_ERROR } from '../logic/bedroomHide';

/** Kinds the Phantom can place during hiding (the controller is pre-hidden). */
export const HIDING_MENU_KINDS: readonly ItemKind[] = ITEM_KINDS.filter((k) => k !== 'game_controller');

export function itemIconSrc(artKey: string): string {
  return `/assets/items/${artKey}.png`;
}

export function itemMenuLabel(kind: ItemKind): string {
  return ITEM_INFO[kind].label;
}

/** Map server hideItem rejection codes to short UI text. */
export function hidePlacementErrorMessage(code: string | undefined): string {
  if (!code) return 'Could not hide the item here.';
  if (code === BEDROOM_LIMIT_ERROR || code === BEDROOM_KEY_ERROR) return code;
  const map: Record<string, string> = {
    'spot-taken': 'This spot already holds an item.',
    'no-spot': 'That hiding spot is not valid.',
    'no-item': 'Unknown item.',
    'not-allowed': 'You cannot hide items right now.',
    'not-started': 'The game has not started.',
  };
  return map[code] ?? code;
}