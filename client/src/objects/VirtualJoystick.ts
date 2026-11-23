import Phaser from 'phaser';
import { TextureKeys } from '../config/textureKeys';
import { SafeAreaManager } from '../utils/SafeAreaManager';

export class VirtualJoystick {
  private scene: Phaser.Scene;
  private base: Phaser.GameObjects.Image;
  private thumb: Phaser.GameObjects.Image;
  private pointer: Phaser.Input.Pointer | null = null;
  private basePosition: Phaser.Math.Vector2;
  private restPosition: Phaser.Math.Vector2;
  private radius: number = 50;
  private direction: Phaser.Math.Vector2;
  private isActive: boolean = false;
  private joystickSize: number = 120; // CSS px

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.basePosition = new Phaser.Math.Vector2(0, 0);
    this.restPosition = new Phaser.Math.Vector2(0, 0);
    this.direction = new Phaser.Math.Vector2(0, 0);

    // Create joystick elements - always visible at rest
    this.base = scene.add.image(0, 0, TextureKeys.JOYSTICK_BASE)
      .setScrollFactor(0)
      .setDepth(1000)
      .setAlpha(0.6)
      .setDisplaySize(this.joystickSize, this.joystickSize);

    this.thumb = scene.add.image(0, 0, TextureKeys.JOYSTICK_THUMB)
      .setScrollFactor(0)
      .setDepth(1001)
      .setAlpha(0.7)
      .setDisplaySize(this.joystickSize * 0.5, this.joystickSize * 0.5);

    this.positionJoystick();
    this.setupInput();
    
    // Reposition on safe area changes
    SafeAreaManager.onInsetsChange(() => this.positionJoystick());
  }

  private positionJoystick(): void {
    const insets = SafeAreaManager.getInsets();
    const margin = 30;
    
    // Position in bottom-left with safe area offset
    const x = margin + insets.left + this.joystickSize / 2;
    const y = this.scene.scale.height - margin - insets.bottom - this.joystickSize / 2;
    
    this.restPosition.set(x, y);
    this.basePosition.set(x, y);
    this.base.setPosition(x, y);
    this.thumb.setPosition(x, y);
  }

  private setupInput(): void {
    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // Activate on left half of screen
      if (pointer.x < this.scene.scale.width / 2 && !this.pointer) {
        this.pointer = pointer;
        this.isActive = true;
        this.basePosition.set(pointer.x, pointer.y);
        this.base.setPosition(pointer.x, pointer.y).setAlpha(0.8);
        this.thumb.setPosition(pointer.x, pointer.y).setAlpha(0.9);
      }
    });

    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.pointer === pointer && this.isActive) {
        this.updateThumb(pointer);
      }
    });

    this.scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.pointer === pointer) {
        this.reset();
      }
    });
  }

  private updateThumb(pointer: Phaser.Input.Pointer): void {
    const dx = pointer.x - this.basePosition.x;
    const dy = pointer.y - this.basePosition.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > this.radius) {
      const angle = Math.atan2(dy, dx);
      this.thumb.setPosition(
        this.basePosition.x + Math.cos(angle) * this.radius,
        this.basePosition.y + Math.sin(angle) * this.radius
      );
      this.direction.set(Math.cos(angle), Math.sin(angle));
    } else {
      this.thumb.setPosition(pointer.x, pointer.y);
      if (distance > 5) {
        this.direction.set(dx / distance, dy / distance);
      } else {
        this.direction.set(0, 0);
      }
    }
  }

  private reset(): void {
    this.pointer = null;
    this.isActive = false;
    this.direction.set(0, 0);
    
    // Return to rest position
    this.basePosition.set(this.restPosition.x, this.restPosition.y);
    this.base.setPosition(this.restPosition.x, this.restPosition.y).setAlpha(0.6);
    this.thumb.setPosition(this.restPosition.x, this.restPosition.y).setAlpha(0.7);
  }

  public getDirection(): Phaser.Math.Vector2 {
    return this.direction.clone();
  }

  public update(): void {
    // Joystick is always visible, no updates needed
  }

  public resize(): void {
    this.positionJoystick();
  }

  public destroy(): void {
    this.base.destroy();
    this.thumb.destroy();
  }
}
