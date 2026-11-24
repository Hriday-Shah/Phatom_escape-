import Phaser from 'phaser';
import { ShellLayout } from '../ui/shellLayout';

/**
 * Joystick fixed in the console's well: the knob (joystick_knob, 18*s) rests at the well centre
 * and travels up to layout.knobTravel. Touch zone = a circle 1.5x the well radius (bigger than
 * the art, as the README allows).
 */
export class VirtualJoystick {
  private scene: Phaser.Scene;
  private thumb: Phaser.GameObjects.Image | Phaser.GameObjects.Arc;
  private pointer: Phaser.Input.Pointer | null = null;
  private center = new Phaser.Math.Vector2(0, 0);
  private direction = new Phaser.Math.Vector2(0, 0);
  private travel = 22;
  private zoneRadius = 60;
  private deadZone = 6;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.thumb = scene.textures.exists('joystick_knob')
      ? scene.add.image(0, 0, 'joystick_knob').setDepth(1001)
      : scene.add.circle(0, 0, 18, 0xa9b4c8).setDepth(1001);
    this.setupInput();
  }

  /** Pointer position in HUD (CSS px) coordinates; pointer.x/y are canvas (device) px. */
  private pointerPos(pointer: Phaser.Input.Pointer): Phaser.Math.Vector2 {
    return pointer.positionToCamera(this.scene.cameras.main) as Phaser.Math.Vector2;
  }

  private setupInput(): void {
    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.pointer) return;
      const p = this.pointerPos(pointer);
      if (p.distance(this.center) > this.zoneRadius) return;
      this.pointer = pointer;
      this.updateThumb(pointer);
    });
    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.pointer === pointer) this.updateThumb(pointer);
    });
    const up = (pointer: Phaser.Input.Pointer) => { if (this.pointer === pointer) this.reset(); };
    this.scene.input.on('pointerup', up);
    this.scene.input.on('pointerupoutside', up);
  }

  private updateThumb(pointer: Phaser.Input.Pointer): void {
    const p = this.pointerPos(pointer);
    const dx = p.x - this.center.x, dy = p.y - this.center.y;
    const d = Math.hypot(dx, dy);
    if (d < this.deadZone) {
      this.direction.set(0, 0);
      this.thumb.setPosition(this.center.x, this.center.y);
      return;
    }
    const k = Math.min(d, this.travel) / d;
    // Whole CSS px so the knob stays crisp.
    this.thumb.setPosition(Math.round(this.center.x + dx * k), Math.round(this.center.y + dy * k));
    this.direction.set(dx / d, dy / d);
  }

  private reset(): void {
    this.pointer = null;
    this.direction.set(0, 0);
    this.thumb.setPosition(this.center.x, this.center.y);
  }

  public getDirection(): Phaser.Math.Vector2 {
    return this.direction.clone();
  }

  /** Well centre (CSS px), for tests. */
  public getCenter(): { x: number; y: number } {
    return { x: this.center.x, y: this.center.y };
  }

  public update(): void {}

  public resize(layout: ShellLayout): void {
    const w = layout.well;
    this.center.set(w.x + w.w / 2, w.y + w.h / 2);
    this.travel = layout.knobTravel;
    this.zoneRadius = (w.w / 2) * 1.5;
    this.deadZone = 3 * layout.s;
    if (this.thumb instanceof Phaser.GameObjects.Image) this.thumb.setScale(layout.s);
    if (!this.pointer) this.reset();
  }

  public destroy(): void {
    this.thumb.destroy();
  }
}
