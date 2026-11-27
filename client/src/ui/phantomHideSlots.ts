import {
  ITEM_INFO,
  TOY_CAR_COLOURS,
  toyCarArtKey,
  type ItemKind,
  type WorldItem,
} from '../logic/items';

/** One row in the Phantom hiding menu (13 hideable items per stage 3 plan). */
export interface HideMenuSlot {
  /** Stable id for DOM and selection state. */
  slotId: string;
  kind: ItemKind;
  /** Distinguishes the four cars (colour) and four batteries (1–4). */
  variant?: string;
  label: string;
  artKey: string;
}

const BATTERY_VARIANTS = ['1', '2', '3', '4'] as const;

function singleSlot(kind: ItemKind): HideMenuSlot {
  const info = ITEM_INFO[kind];
  return { slotId: kind, kind, label: info.label, artKey: info.artKey };
}

/** Menu order: singles, four cars, four batteries. Controller is not listed. */
export const HIDING_MENU_SLOTS: readonly HideMenuSlot[] = [
  singleSlot('paper_code'),
  singleSlot('stun_gun'),
  singleSlot('bullet'),
  ...TOY_CAR_COLOURS.map((colour) => ({
    slotId: `toy_car:${colour}`,
    kind: 'toy_car' as const,
    variant: colour,
    label: `Toy car (${colour})`,
    artKey: toyCarArtKey(colour),
  })),
  singleSlot('wire_cutter'),
  singleSlot('room_key'),
  ...BATTERY_VARIANTS.map((n) => ({
    slotId: `battery:${n}`,
    kind: 'battery' as const,
    variant: n,
    label: `Battery ${n}`,
    artKey: ITEM_INFO.battery.artKey,
  })),
];

export function hideSlotTaken(slot: HideMenuSlot, items: readonly WorldItem[]): boolean {
  const placed = items.filter((i) => i.spotId && i.kind !== 'game_controller');
  if (slot.kind === 'toy_car' || slot.kind === 'battery') {
    return placed.some((i) => i.kind === slot.kind && i.variant === slot.variant);
  }
  return placed.some((i) => i.kind === slot.kind);
}

export function remainingHideSlots(items: readonly WorldItem[]): HideMenuSlot[] {
  return HIDING_MENU_SLOTS.filter((s) => !hideSlotTaken(s, items));
}

export function hideSlotById(slotId: string): HideMenuSlot | undefined {
  return HIDING_MENU_SLOTS.find((s) => s.slotId === slotId);
}