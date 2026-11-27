/**
 * Phantom hiding menu: item list, selection flow, error strings.
 */
import assert from 'node:assert/strict';
import { hidePlacementErrorMessage, HIDING_MENU_KINDS } from '../ui/phantomHideItems';
import { BEDROOM_KEY_ERROR, BEDROOM_LIMIT_ERROR } from '../logic/bedroomHide';
import { ITEM_INFO } from '../logic/items';

const t = (ok: boolean, msg: string) => { if (!ok) throw new Error(msg); };

t(HIDING_MENU_KINDS.includes('game_controller') === false, 'menu omits the pre-hidden controller');
t(HIDING_MENU_KINDS.includes('battery'), 'menu includes hideable items');

for (const kind of HIDING_MENU_KINDS) {
  const info = ITEM_INFO[kind];
  t(!!info.label && !!info.artKey, `icon metadata for ${kind}`);
}

t(hidePlacementErrorMessage('spot-taken').includes('already'), 'spot-taken message');
t(hidePlacementErrorMessage(BEDROOM_LIMIT_ERROR) === BEDROOM_LIMIT_ERROR, 'bedroom limit passthrough');
t(hidePlacementErrorMessage(BEDROOM_KEY_ERROR) === BEDROOM_KEY_ERROR, 'bedroom key passthrough');

export function runPhantomHudTest(): void {
  console.log('✓ phantomHud tests passed');
}