import Phaser from 'phaser';
import { TextureKeys } from './textureKeys';

/**
 * Generates all placeholder textures for the game.
 * This makes it easy to replace with real assets later by using the same texture keys.
 */
export class TextureGenerator {
  static generateAll(scene: Phaser.Scene): void {
    this.generatePlayer(scene);
    this.generateFloors(scene);
    this.generateWalls(scene);
    this.generateFurniture(scene);
    this.generateUI(scene);
    // Item textures come from the manifest (loadArtAssets). Placeholders are generated only
    // when the manifest did not load (see PreloadScene).
  }

  private static generatePlayer(scene: Phaser.Scene): void {
    const size = 32;
    const graphics = scene.add.graphics();
    
    // Player as a circle (placeholder with ph_ prefix to avoid collision with art)
    graphics.fillStyle(0x4A90E2, 1);
    graphics.fillCircle(size / 2, size / 2, size / 2);
    graphics.lineStyle(2, 0x2E5C8A, 1);
    graphics.strokeCircle(size / 2, size / 2, size / 2);
    
    // Direction indicator
    graphics.fillStyle(0xFFFFFF, 1);
    graphics.fillCircle(size / 2, size / 4, 4);
    
    graphics.generateTexture('ph_' + TextureKeys.PLAYER, size, size);
    graphics.destroy();
  }

  private static generateFloors(scene: Phaser.Scene): void {
    const floors = [
      { key: TextureKeys.FLOOR_DEFAULT, color: 0x9B8B7E },
      { key: TextureKeys.FLOOR_BEDROOM, color: 0x8B7355 },
      { key: TextureKeys.FLOOR_ENTRANCE, color: 0x9B8B7E },
      { key: TextureKeys.FLOOR_LIVING, color: 0xA0826D },
      { key: TextureKeys.FLOOR_BATHROOM, color: 0xC0C0C0 },
      { key: TextureKeys.FLOOR_KITCHEN, color: 0xB8B8B8 },
    ];

    floors.forEach(({ key, color }) => {
      const graphics = scene.add.graphics();
      graphics.fillStyle(color, 1);
      graphics.fillRect(0, 0, 64, 64);
      graphics.lineStyle(1, color - 0x101010, 0.3);
      graphics.strokeRect(0, 0, 64, 64);
      graphics.generateTexture('ph_' + key, 64, 64);
      graphics.destroy();
    });
  }

  private static generateWalls(scene: Phaser.Scene): void {
    const graphics = scene.add.graphics();
    
    // Wall
    graphics.fillStyle(0x3A3A3A, 1);
    graphics.fillRect(0, 0, 32, 32);
    graphics.lineStyle(1, 0x2A2A2A, 1);
    graphics.strokeRect(0, 0, 32, 32);
    graphics.generateTexture('ph_' + TextureKeys.WALL, 32, 32);
    graphics.clear();
    
    // Locked door
    graphics.fillStyle(0x8B4513, 1);
    graphics.fillRect(0, 0, 32, 32);
    graphics.lineStyle(2, 0x654321, 1);
    graphics.strokeRect(1, 1, 30, 30);
    graphics.fillStyle(0xFFD700, 1);
    graphics.fillCircle(24, 16, 3);
    graphics.generateTexture('ph_' + TextureKeys.DOOR_LOCKED, 32, 32);
    graphics.clear();
    
    // Open door
    graphics.fillStyle(0x8B4513, 0.5);
    graphics.fillRect(0, 0, 32, 32);
    graphics.lineStyle(2, 0x654321, 0.7);
    graphics.strokeRect(1, 1, 30, 30);
    graphics.generateTexture('ph_' + TextureKeys.DOOR_OPEN, 32, 32);
    
    graphics.destroy();
  }

  private static generateFurniture(scene: Phaser.Scene): void {
    const items = [
      { key: TextureKeys.DRAWER, color: 0x8B7355, hasHandle: true },
      { key: TextureKeys.DRAWER_OPEN, color: 0x7A6344, hasHandle: true, open: true },
      { key: TextureKeys.CLOSET, color: 0x654321, hasHandle: true },
      { key: TextureKeys.CLOSET_OPEN, color: 0x543210, hasHandle: true, open: true },
      { key: TextureKeys.CABINET, color: 0xA0826D, hasHandle: true },
      { key: TextureKeys.CABINET_OPEN, color: 0x8F7256, hasHandle: true, open: true },
      { key: TextureKeys.BED, color: 0x9B59B6, hasHandle: false },
      { key: TextureKeys.SOFA, color: 0x34495E, hasHandle: false },
      { key: TextureKeys.FRIDGE, color: 0xECF0F1, hasHandle: true },
      { key: TextureKeys.FRIDGE_OPEN, color: 0xBDC3C7, hasHandle: true, open: true },
      { key: TextureKeys.STOVE, color: 0x2C3E50, hasHandle: false },
      { key: TextureKeys.TABLE, color: 0x795548, hasHandle: false },
    ];

    items.forEach(({ key, color, hasHandle, open }) => {
      const graphics = scene.add.graphics();
      graphics.fillStyle(color, 1);
      graphics.fillRect(0, 0, 32, 32);
      graphics.lineStyle(2, color - 0x202020, 1);
      graphics.strokeRect(1, 1, 30, 30);
      
      if (hasHandle) {
        graphics.fillStyle(0x000000, 1);
        if (open) {
          graphics.fillRect(2, 14, 8, 4);
        } else {
          graphics.fillCircle(26, 16, 3);
        }
      }
      
      graphics.generateTexture('ph_' + key, 32, 32);
      graphics.destroy();
    });
  }

  private static generateUI(scene: Phaser.Scene): void {
    // Joystick base
    const baseSize = 100;
    let graphics = scene.add.graphics();
    graphics.fillStyle(0x000000, 0.3);
    graphics.fillCircle(baseSize / 2, baseSize / 2, baseSize / 2);
    graphics.lineStyle(2, 0xFFFFFF, 0.5);
    graphics.strokeCircle(baseSize / 2, baseSize / 2, baseSize / 2);
    graphics.generateTexture('ph_' + TextureKeys.JOYSTICK_BASE, baseSize, baseSize);
    graphics.destroy();
    
    // Joystick thumb
    const thumbSize = 50;
    graphics = scene.add.graphics();
    graphics.fillStyle(0xFFFFFF, 0.6);
    graphics.fillCircle(thumbSize / 2, thumbSize / 2, thumbSize / 2);
    graphics.lineStyle(2, 0xCCCCCC, 0.8);
    graphics.strokeCircle(thumbSize / 2, thumbSize / 2, thumbSize / 2);
    graphics.generateTexture('ph_' + TextureKeys.JOYSTICK_THUMB, thumbSize, thumbSize);
    graphics.destroy();
    
    // Button
    const buttonSize = 60;
    graphics = scene.add.graphics();
    graphics.fillStyle(0x4A90E2, 0.8);
    graphics.fillCircle(buttonSize / 2, buttonSize / 2, buttonSize / 2);
    graphics.lineStyle(3, 0x2E5C8A, 1);
    graphics.strokeCircle(buttonSize / 2, buttonSize / 2, buttonSize / 2);
    graphics.generateTexture('ph_' + TextureKeys.BUTTON, buttonSize, buttonSize);
    graphics.destroy();
    
    // Disabled button
    graphics = scene.add.graphics();
    graphics.fillStyle(0x666666, 0.4);
    graphics.fillCircle(buttonSize / 2, buttonSize / 2, buttonSize / 2);
    graphics.lineStyle(3, 0x444444, 0.6);
    graphics.strokeCircle(buttonSize / 2, buttonSize / 2, buttonSize / 2);
    graphics.generateTexture('ph_' + TextureKeys.BUTTON_DISABLED, buttonSize, buttonSize);
    graphics.destroy();
  }

  /**
   * Placeholder item art (16x16, shown at 32 world px). Only used when the
   * approved file is missing; swap the pending manifest PNG to replace it.
   */
  /** Fallback when manifest art is unavailable (same keys as approved item PNGs). */
  static generateItemPlaceholders(scene: Phaser.Scene): void {
    const draw = (key: string, fn: (g: Phaser.GameObjects.Graphics) => void) => {
      if (scene.textures.exists(key)) return;
      const g = scene.add.graphics();
      fn(g);
      g.generateTexture(key, 16, 16);
      g.destroy();
    };
    // Game Controller: dark pad, two cyan buttons, a d-pad. Easy to replace.
    draw('item_game_controller', (g) => {
      g.fillStyle(0x2a3042, 1); g.fillRoundedRect(1, 5, 14, 8, 3);
      g.fillStyle(0x1c2030, 1); g.fillRect(3, 7, 4, 4);
      g.fillStyle(0x5fd3e6, 1); g.fillCircle(11, 8, 1.4); g.fillCircle(13, 10, 1.4);
      g.fillStyle(0xf4f1ea, 1); g.fillRect(4, 8, 2, 2);
    });
    // Other pending items: simple colour tiles so a later pickup can show something.
    const others: [string, number][] = [
      ['item_paper_code', 0xf4f1ea],
      ['item_stun_gun', 0x3a7bf2],
      ['item_stun_gun_loaded', 0x3a7bf2],
      ['item_bullet', 0xf2d13a],
      ['item_toy_car_red', 0xc13a3a],
      ['item_toy_car_blue', 0x3a7bf2],
      ['item_toy_car_violet', 0x9b6bff],
      ['item_toy_car_yellow', 0xf2d13a],
      ['item_wire_cutter', 0xb03a5b],
      ['item_room_key', 0xf2d13a],
      ['item_battery', 0x5fd3e6],
    ];
    for (const [key, color] of others) {
      draw(key, (g) => { g.fillStyle(color, 1); g.fillRoundedRect(2, 2, 12, 12, 2); });
    }
  }
}
