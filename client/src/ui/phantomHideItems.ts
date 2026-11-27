import { BEDROOM_KEY_ERROR, BEDROOM_LIMIT_ERROR } from '../logic/bedroomHide';

export {
  HIDING_MENU_SLOTS,
  hideSlotById,
  hideSlotTaken,
  remainingHideSlots,
  type HideMenuSlot,
} from './phantomHideSlots';

export function itemIconSrc(artKey: string): string {
  return `/assets/items/${artKey}.png`;
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
    'missing-variant': 'That item type needs a colour or number.',
    'already-hidden': 'That item is already hidden.',
  };
  return map[code] ?? code;
}