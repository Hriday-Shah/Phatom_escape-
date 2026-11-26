/**
 * Item catalog.
 *
 * Manifest art (all `pending review`, and the PNG files are not on disk yet):
 *   item_paper_code
 *   item_stun_gun, item_stun_gun_loaded (held state, not a separate spawn)
 *   item_bullet
 *   item_toy_car_red, item_toy_car_blue, item_toy_car_violet, item_toy_car_yellow
 *   item_wire_cutter, item_room_key, item_battery
 *
 * That is 7 kinds and 10 unique item arts (11 keys counting the loaded-gun state).
 * The repo does not define how many of each kind are hidden in a round (the
 * brief mentioned "14 items in 8 kinds"). This module does not invent extra
 * bullets, batteries or other instances to reach 14. Adding the game controller
 * makes 8 kinds; only one controller is spawned.
 */
export const ITEM_KINDS = [
  'paper_code',
  'stun_gun',
  'bullet',
  'toy_car',
  'wire_cutter',
  'room_key',
  'battery',
  'game_controller',
] as const;

export type ItemKind = (typeof ITEM_KINDS)[number];

export const TOY_CAR_COLOURS = ['red', 'blue', 'violet', 'yellow'] as const;
export type ToyCarColour = (typeof TOY_CAR_COLOURS)[number];

export interface ItemInfo {
  kind: ItemKind;
  label: string;
  /** Manifest / texture key (pending or placeholder). Swap the file to replace art. */
  artKey: string;
  /** Extra art key when a state is shown (stun gun loaded). */
  altArtKey?: string;
}

export const ITEM_INFO: Record<ItemKind, ItemInfo> = {
  paper_code: { kind: 'paper_code', label: 'Paper code', artKey: 'item_paper_code' },
  stun_gun: { kind: 'stun_gun', label: 'Stun gun', artKey: 'item_stun_gun', altArtKey: 'item_stun_gun_loaded' },
  bullet: { kind: 'bullet', label: 'Bullet', artKey: 'item_bullet' },
  toy_car: { kind: 'toy_car', label: 'Toy car', artKey: 'item_toy_car_red' },
  wire_cutter: { kind: 'wire_cutter', label: 'Wire cutter', artKey: 'item_wire_cutter' },
  room_key: { kind: 'room_key', label: 'Room key', artKey: 'item_room_key' },
  battery: { kind: 'battery', label: 'Battery', artKey: 'item_battery' },
  game_controller: { kind: 'game_controller', label: 'Game Controller', artKey: 'item_game_controller' },
};

export function toyCarArtKey(colour: ToyCarColour): string {
  return `item_toy_car_${colour}`;
}

export function artKeyFor(kind: ItemKind, variant?: string): string {
  if (kind === 'toy_car' && variant && (TOY_CAR_COLOURS as readonly string[]).includes(variant)) {
    return toyCarArtKey(variant as ToyCarColour);
  }
  return ITEM_INFO[kind].artKey;
}

/** Manifest art keys that existed before the controller was added. */
export const PREEXISTING_ITEM_ART_KEYS = [
  'item_paper_code',
  'item_stun_gun',
  'item_stun_gun_loaded',
  'item_bullet',
  'item_toy_car_red',
  'item_toy_car_blue',
  'item_toy_car_violet',
  'item_toy_car_yellow',
  'item_wire_cutter',
  'item_room_key',
  'item_battery',
] as const;

/** 7 kinds were already listed in the manifest; the controller is the 8th. */
export const PREEXISTING_KIND_COUNT = 7;
export const KIND_COUNT_WITH_CONTROLLER = ITEM_KINDS.length; // 8

/**
 * If each unique item (4 cars + 1 of every other kind, counting the loaded gun
 * as a state not a spawn) were hidden once, that would be 11, not 14. Reported
 * in tests rather than padded with invented extras.
 */
export const UNIQUE_SPAWN_KINDS_IF_ONE_EACH = 11;

export interface WorldItem {
  id: string;
  kind: ItemKind;
  variant?: string;
  /** Hiding-spot / section id when hidden; null on the floor or in a hand. */
  spotId: string | null;
  x: number;
  y: number;
  /** Building floor (0 = ground). */
  f: number;
  /** Player id holding it, or null. */
  heldBy: string | null;
}

export type PublicItem = WorldItem;

export const CONTROLLER_ID = 'item-controller-1';

export function makeController(spotId: string, x: number, y: number, f = 0): WorldItem {
  return {
    id: CONTROLLER_ID,
    kind: 'game_controller',
    spotId,
    x,
    y,
    f,
    heldBy: null,
  };
}

export function isController(item: WorldItem | null | undefined): item is WorldItem {
  return !!item && item.kind === 'game_controller';
}

export function itemLabel(item: WorldItem): string {
  if (item.kind === 'toy_car' && item.variant) return `${ITEM_INFO.toy_car.label} (${item.variant})`;
  return ITEM_INFO[item.kind].label;
}
