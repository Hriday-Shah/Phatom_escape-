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
  }

  private static generatePlayer(scene: Phaser.Scene): void {
    const size = 32;
    const graphics = scene.add.graphics();
    
    // Player as a circle
    graphics.fillStyle(0x4A90E2, 1);
    graphics.fillCircle(size / 2, size / 2, size / 2);
    graphics.lineStyle(2, 0x2E5C8A, 1);
    graphics.strokeCircle(size / 2, size / 2, size / 2);
    
    // Direction indicator
    graphics.fillStyle(0xFFFFFF, 1);
    graphics.fillCircle(size / 2, size / 4, 4);
    
    graphics.generateTexture(TextureKeys.PLAYER, size, size);
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
      graphics.generateTexture(key, 64, 64);
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
    graphics.generateTexture(TextureKeys.WALL, 32, 32);
    graphics.clear();
    
    // Locked door
    graphics.fillStyle(0x8B4513, 1);
    graphics.fillRect(0, 0, 32, 32);
    graphics.lineStyle(2, 0x654321, 1);
    graphics.strokeRect(1, 1, 30, 30);
    graphics.fillStyle(0xFFD700, 1);
    graphics.fillCircle(24, 16, 3);
    graphics.generateTexture(TextureKeys.DOOR_LOCKED, 32, 32);
    graphics.clear();
    
    // Open door
    graphics.fillStyle(0x8B4513, 0.5);
    graphics.fillRect(0, 0, 32, 32);
    graphics.lineStyle(2, 0x654321, 0.7);
    graphics.strokeRect(1, 1, 30, 30);
    graphics.generateTexture(TextureKeys.DOOR_OPEN, 32, 32);
    
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
      
      graphics.generateTexture(key, 32, 32);
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
    graphics.generateTexture(TextureKeys.JOYSTICK_BASE, baseSize, baseSize);
    graphics.destroy();
    
    // Joystick thumb
    const thumbSize = 50;
    graphics = scene.add.graphics();
    graphics.fillStyle(0xFFFFFF, 0.6);
    graphics.fillCircle(thumbSize / 2, thumbSize / 2, thumbSize / 2);
    graphics.lineStyle(2, 0xCCCCCC, 0.8);
    graphics.strokeCircle(thumbSize / 2, thumbSize / 2, thumbSize / 2);
    graphics.generateTexture(TextureKeys.JOYSTICK_THUMB, thumbSize, thumbSize);
    graphics.destroy();
    
    // Button
    const buttonSize = 60;
    graphics = scene.add.graphics();
    graphics.fillStyle(0x4A90E2, 0.8);
    graphics.fillCircle(buttonSize / 2, buttonSize / 2, buttonSize / 2);
    graphics.lineStyle(3, 0x2E5C8A, 1);
    graphics.strokeCircle(buttonSize / 2, buttonSize / 2, buttonSize / 2);
    graphics.generateTexture(TextureKeys.BUTTON, buttonSize, buttonSize);
    graphics.destroy();
    
    // Disabled button
    graphics = scene.add.graphics();
    graphics.fillStyle(0x666666, 0.4);
    graphics.fillCircle(buttonSize / 2, buttonSize / 2, buttonSize / 2);
    graphics.lineStyle(3, 0x444444, 0.6);
    graphics.strokeCircle(buttonSize / 2, buttonSize / 2, buttonSize / 2);
    graphics.generateTexture(TextureKeys.BUTTON_DISABLED, buttonSize, buttonSize);
    graphics.destroy();
  }
}
