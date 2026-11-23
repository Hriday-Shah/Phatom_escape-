/**
 * Texture keys used in the game.
 * All textures are generated as placeholders and can be replaced with actual assets.
 */

export const TextureKeys = {
  // Player
  PLAYER: 'player',
  
  // Floors
  FLOOR_DEFAULT: 'floor_default',
  FLOOR_BEDROOM: 'floor_bedroom',
  FLOOR_ENTRANCE: 'floor_entrance',
  FLOOR_LIVING: 'floor_living',
  FLOOR_BATHROOM: 'floor_bathroom',
  FLOOR_KITCHEN: 'floor_kitchen',
  
  // Walls and doors
  WALL: 'wall',
  DOOR_LOCKED: 'door_locked',
  DOOR_OPEN: 'door_open',
  
  // Furniture - hiding spots
  DRAWER: 'drawer',
  DRAWER_OPEN: 'drawer_open',
  CLOSET: 'closet',
  CLOSET_OPEN: 'closet_open',
  CABINET: 'cabinet',
  CABINET_OPEN: 'cabinet_open',
  BED: 'bed',
  SOFA: 'sofa',
  FRIDGE: 'fridge',
  FRIDGE_OPEN: 'fridge_open',
  STOVE: 'stove',
  
  // Furniture - blocking
  TABLE: 'table',
  
  // UI
  JOYSTICK_BASE: 'joystick_base',
  JOYSTICK_THUMB: 'joystick_thumb',
  BUTTON: 'button',
  BUTTON_DISABLED: 'button_disabled',
} as const;

export type TextureKey = typeof TextureKeys[keyof typeof TextureKeys];
