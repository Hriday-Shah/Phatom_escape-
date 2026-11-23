import Phaser from 'phaser';
import { TextureKeys } from '../config/textureKeys';
import { SafeAreaManager } from '../utils/SafeAreaManager';
import { cssSize, hudScale } from '../config/display';

export class VirtualJoystick {
  private scene: Phaser.Scene;
  private base: Phaser.GameObjects.Image;
  private thumb: Phaser.GameObjects.Image;
  private pointer: Phaser.Input.Pointer | null = null;
  private basePosition: Phaser.Math.Vector2;
  private restPosition: Phaser.Math.Vector2;
  private direction: Phaser.Math.Vector2;
  private isActive: boolean = false;
  
  // UI layout specs: 100px base, 50px knob, 30px travel radius (x1.5 when short side >= 600)
  private baseSize = 100; // CSS px
  private knobSize = 50; // CSS px
  private maxDistance = 30; // CSS px
  private deadZone = 10;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.basePosition = new Phaser.Math.Vector2(0, 0);
    this.restPosition = new Phaser.Math.Vector2(0, 0);
    this.direction = new Phaser.Math.Vector2(0, 0);

    // Create joystick elements - always visible at rest
    const baseKey = scene.textures.exists('ui_joystick_base') ? 'ui_joystick_base' : 'ph_' + TextureKeys.JOYSTICK_BASE;
    const thumbKey = scene.textures.exists('ui_joystick_knob') ? 'ui_joystick_knob' : 'ph_' + TextureKeys.JOYSTICK_THUMB;
    
    this.base = scene.add.image(0, 0, baseKey)
      .setDepth(1000)
      .setAlpha(0.6)
      .setDisplaySize(this.baseSize, this.baseSize);

    this.thumb = scene.add.image(0, 0, thumbKey)
      .setDepth(1001)
      .setAlpha(0.7)
      .setDisplaySize(this.knobSize, this.knobSize);

    this.positionJoystick();
    this.setupInput();
    
    // Reposition on safe area changes
    SafeAreaManager.onInsetsChange(() => this.positionJoystick());
  }

  /** Pointer position in HUD (CSS px) coordinates; pointer.x/y are canvas (device) px. */
  private pointerPos(pointer: Phaser.Input.Pointer): Phaser.Math.Vector2 {
    return pointer.positionToCamera(this.scene.cameras.main) as Phaser.Math.Vector2;
  }

  private positionJoystick(): void {
    const insets = SafeAreaManager.getInsets();
    const s = hudScale(this.scene);
    this.baseSize = 100 * s;
    this.knobSize = 50 * s;
    this.maxDistance = 30 * s;
    this.deadZone = 10 * s;
    this.base.setDisplaySize(this.baseSize, this.baseSize);
    this.thumb.setDisplaySize(this.knobSize, this.knobSize);
    
    // 16px margin plus safe-area insets
    const margin = 16;
    const leftEdge = insets.left + margin;
    const bottomEdge = cssSize(this.scene).height - insets.bottom - margin;
    
    const x = leftEdge + this.baseSize / 2;
    const y = bottomEdge - this.baseSize / 2;
    
    this.restPosition.set(x, y);
    
    if (!this.isActive) {
      this.basePosition.set(x, y);
      this.base.setPosition(x, y);
      this.thumb.setPosition(x, y);
    }
  }

  private setupInput(): void {
    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // Activate on left half of screen
      const p = this.pointerPos(pointer);
      if (p.x < cssSize(this.scene).width / 2 && !this.pointer) {
        this.pointer = pointer;
        this.isActive = true;
        this.basePosition.set(p.x, p.y);
        
        // Use active texture if available
        if (this.scene.textures.exists('ui_joystick_base_active')) {
          this.base.setTexture('ui_joystick_base_active');
        }
        this.base.setPosition(p.x, p.y).setAlpha(0.8);
        this.thumb.setPosition(p.x, p.y).setAlpha(0.9);
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
    const p = this.pointerPos(pointer);
    const dx = p.x - this.basePosition.x;
    const dy = p.y - this.basePosition.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < this.deadZone) {
      this.direction.set(0, 0);
      this.thumb.setPosition(this.basePosition.x, this.basePosition.y);
      return;
    }

    // Clamp to 30px travel radius
    const clampedDistance = Math.min(distance, this.maxDistance);
    const angle = Math.atan2(dy, dx);
    
    const thumbX = this.basePosition.x + Math.cos(angle) * clampedDistance;
    const thumbY = this.basePosition.y + Math.sin(angle) * clampedDistance;
    
    this.thumb.setPosition(thumbX, thumbY);
    
    this.direction.set(
      dx / distance,
      dy / distance
    );
  }

  private reset(): void {
    this.pointer = null;
    this.isActive = false;
    this.direction.set(0, 0);
    
    // Return to rest position and rest texture
    if (this.scene.textures.exists('ui_joystick_base')) {
      this.base.setTexture('ui_joystick_base');
    }
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
