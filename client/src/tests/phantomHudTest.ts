/**
 * Phantom hiding menu: 13 slots, cars/batteries expanded, error strings, icons on disk.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  HIDING_MENU_SLOTS,
  hidePlacementErrorMessage,
  hideSlotTaken,
  itemIconSrc,
  remainingHideSlots,
} from '../ui/phantomHideItems';
import { BEDROOM_KEY_ERROR, BEDROOM_LIMIT_ERROR } from '../logic/bedroomHide';
import type { WorldItem } from '../logic/items';
import { cycleCodeSlot } from '../logic/escapeCode';

const t = (ok: boolean, msg: string) => { if (!ok) throw new Error(msg); };

t(HIDING_MENU_SLOTS.length === 13, '13 hideable menu slots');
t(HIDING_MENU_SLOTS.filter((s) => s.kind === 'toy_car').length === 4, 'four toy cars');
t(HIDING_MENU_SLOTS.filter((s) => s.kind === 'battery').length === 4, 'four batteries');
t(HIDING_MENU_SLOTS.some((s) => s.kind === 'game_controller'), 'controller is in the menu');
t(!HIDING_MENU_SLOTS.some((s) => s.kind === 'paper_code'), 'paper code is not hidden');

for (const slot of HIDING_MENU_SLOTS) {
  const disk = join(process.cwd(), 'public', 'assets', 'items', `${slot.artKey}.png`);
  t(existsSync(disk), `menu icon on disk for ${slot.slotId} (${slot.artKey}.png)`);
  t(itemIconSrc(slot.artKey).includes(`items/${slot.artKey}.png`), `menu icon URL for ${slot.slotId}`);
}

const placedCar: WorldItem = {
  id: 'c1', kind: 'toy_car', variant: 'red', spotId: 'sofa_d1', x: 0, y: 0, f: 0, heldBy: null,
};
t(hideSlotTaken(HIDING_MENU_SLOTS.find((s) => s.slotId === 'toy_car:red')!, [placedCar]), 'red car leaves menu');
t(!hideSlotTaken(HIDING_MENU_SLOTS.find((s) => s.slotId === 'toy_car:blue')!, [placedCar]), 'blue car still listed');
t(remainingHideSlots([placedCar]).length === 12, 'one car hidden removes one row');

t(hidePlacementErrorMessage('already-hidden').includes('already'), 'already-hidden message');
t(hidePlacementErrorMessage(BEDROOM_LIMIT_ERROR) === BEDROOM_LIMIT_ERROR, 'bedroom limit passthrough');
t(hidePlacementErrorMessage(BEDROOM_KEY_ERROR) === BEDROOM_KEY_ERROR, 'bedroom key passthrough');

const cycled = cycleCodeSlot(['red', 'blue', 'violet', 'yellow'], 0);
t(cycled[0] === 'blue' && cycled[1] === 'red', 'tap slot 0 swaps in the next colour');
t(new Set(cycled).size === 4, 'cycled code stays a permutation');

export function runPhantomHudTest(): void {
  console.log('✓ phantomHud tests passed');
}