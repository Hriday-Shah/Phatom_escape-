/**
 * Art rendering helpers for half-resolution art (1 art px = 2 world units)
 */

import Phaser from 'phaser';

export class ArtHelpers {
  // Check if texture exists (art or placeholder)
  static hasTexture(scene: Phaser.Scene, key: string): boolean {
    return scene.textures.exists(key);
  }

  // Get texture key with fallback
  static getTexture(scene: Phaser.Scene, artKey: string, fallbackKey: string): string {
    return this.hasTexture(scene, artKey) ? artKey : fallbackKey;
  }

  // Create tiled floor (16x16 art px tiles at 2x scale)
  static createFloor(scene: Phaser.Scene, x: number, y: number, width: number, height: number, key: string): Phaser.GameObjects.TileSprite {
    const artKey = this.getTexture(scene, key, 'floor_default');
    // Art is 16x16, world size is 32x32 (width/2, height/2 in art space, then scale 2x)
    return scene.add.tileSprite(x, y, width, height, artKey)
      .setOrigin(0, 0)
      .setDepth(-2);
  }

  // Create world sprite (furniture, doors) at 2x scale
  static createWorldSprite(scene: Phaser.Scene, x: number, y: number, key: string, fallback: string): Phaser.GameObjects.Image {
    const artKey = this.getTexture(scene, key, fallback);
    return scene.add.image(x, y, artKey)
      .setOrigin(0, 0)
      .setScale(2);
  }

  // Create wall tile sprite
  static createWallTile(scene: Phaser.Scene, x: number, y: number, width: number, height: number, horizontal: boolean): Phaser.GameObjects.TileSprite {
    const key = horizontal ? 'wall' : 'wall_v';
    const artKey = this.getTexture(scene, key, 'wall');
    return scene.add.tileSprite(x, y, width, height, artKey)
      .setOrigin(0, 0)
      .setScale(2)
      .setDepth(-1);
  }
}

// Manifest aliases
export const MANIFEST_ALIASES: Record<string, string> = {
  'floor_default': 'floor_entrance',
  'drawer': 'study_drawer',
  'drawer_open': 'study_drawer_open',
  'cabinet': 'sideboard',
  'cabinet_open': 'sideboard_open',
  'table': 'dining_table',
};

// Hiding spot ID to texture key
export const HIDING_SPOT_TEXTURES: Record<string, string> = {
  'study_drawer_1': 'study_drawer',
  'study_drawer_2': 'study_drawer',
  'study_drawer_3': 'study_drawer',
  'bed': 'bed',
  'bedside_drawer': 'bedside_drawer',
  'closet_drawers': 'closet',
  'sofa': 'sofa',
  'ottoman': 'ottoman',
  'tv_unit': 'tv_unit',
  'sideboard': 'sideboard',
  'sink_cabinet': 'sink_cabinet',
  'wall_shelf': 'wall_shelf',
  'microwave_unit': 'microwave_unit',
  'kitchen_sink_cabinet': 'kitchen_sink',
  'stove': 'stove',
  'stove_drawers': 'kitchen_drawer',
  'fridge': 'fridge',
};
