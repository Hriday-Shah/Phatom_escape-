import Phaser from 'phaser';
import { TextureKeys } from '../config/textureKeys';
import { SafeAreaManager } from '../utils/SafeAreaManager';

export class VirtualJoystick {
  private scene: Phaser.Scene;
  private base: Phaser.GameObjects.Image;
  private thumb: Phaser.GameObjects.Image;
  private pointer: Phaser.Input.Pointer | null = null;
  private basePosition: Phaser.Math.Vector2;
  private radius: number = 40;
  private direction: Phaser.Math.Vector2;
  private visible: boolean = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.basePosition = new Phaser.Math.Vector2(0, 0);
    this.direction = new Phaser.Math.Vector2(0, 0);

    // Create joystick elements
    this.base = scene.add.image(0, 0, TextureKeys.JOYSTICK_BASE)
      .setScrollFactor(0)
      .setDepth(1000)
      .setAlpha(0.7)
      .setVisible(false);

    this.thumb = scene.add.image(0, 0, TextureKeys.JOYSTICK_THUMB)
      .setScrollFactor(0)
      .setDepth(1001)
      .setAlpha(0.8)
      .setVisible(false);

    this.setupInput();
  }

  private setupInput(): void {
    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // Only activate on left half of screen AND in bottom-left thumb area
      const insets = SafeAreaManager.getInsets();
      const minX = insets.left + 20;
      const minY = insets.top + 100;
      const maxX = this.scene.scale.width / 2;
      const maxY = this.scene.scale.height - insets.bottom - 20;
      
      if (pointer.x >= minX && pointer.x < maxX && 
          pointer.y >= minY && pointer.y < maxY && 
          !this.pointer) {
        this.pointer = pointer;
        this.visible = true;
        this.basePosition.set(pointer.x, pointer.y);
        this.base.setPosition(pointer.x, pointer.y).setVisible(true);
        this.thumb.setPosition(pointer.x, pointer.y).setVisible(true);
      }
    });

    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.pointer === pointer && this.visible) {
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
    this.visible = false;
    this.base.setVisible(false);
    this.thumb.setVisible(false);
    this.direction.set(0, 0);
  }

  public getDirection(): Phaser.Math.Vector2 {
    return this.direction.clone();
  }

  public update(): void {
    // Update positions on screen resize
    if (this.visible && this.pointer) {
      this.base.setPosition(this.basePosition.x, this.basePosition.y);
    }
  }

  public destroy(): void {
    this.base.destroy();
    this.thumb.destroy();
  }
}
