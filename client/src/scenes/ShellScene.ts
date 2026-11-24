import Phaser from 'phaser';
import { SafeAreaManager } from '../utils/SafeAreaManager';
import { applyCssCamera, currentShellLayout } from '../ui/currentLayout';
import { Box, SHELL_ART, snapToDevice } from '../ui/shellLayout';

/**
 * The console body drawn UNDER the game (this scene renders before GameScene): shell_body and
 * screen_bezel 9-slices, joystick well, button sockets and labels, logo, LED and speaker grille.
 * Interactive pieces (buttons, knob) and the prompts live in UIScene, above the game.
 * Every piece is 1x art at a whole number of device px per art px (nearest-neighbour via pixelArt).
 */
export class ShellScene extends Phaser.Scene {
  private parts: Phaser.GameObjects.GameObject[] = [];
  private led: Phaser.GameObjects.Image | null = null;
  private labels = new Map<string, Phaser.GameObjects.Image>();
  private shootReady = false;

  constructor() {
    super({ key: 'ShellScene' });
  }

  create(): void {
    this.scale.on('resize', this.layout, this);
    SafeAreaManager.onInsetsChange(() => this.layout());
    this.layout();
    // The power LED blinks slowly.
    this.time.addEvent({
      delay: 900, loop: true,
      callback: () => this.led?.setTexture(this.led.texture.key === 'power_led_on' ? 'power_led' : 'power_led_on'),
    });
  }

  /** Shoot label: ready or disabled art (stage 1: always disabled). */
  public setShootReady(ready: boolean): void {
    this.shootReady = ready;
    this.labels.get('shoot')?.setTexture(ready ? 'label_shoot' : 'label_shoot_disabled');
  }

  private img(key: string, b: Box, s: number, depth = 2): Phaser.GameObjects.Image | null {
    if (!this.textures.exists(key) || b.w <= 0) return null; // zero box: piece dropped by the layout
    const i = this.add.image(b.x, b.y, key).setOrigin(0, 0).setScale(s).setDepth(depth);
    this.parts.push(i);
    return i;
  }

  private nine(key: string, b: Box, s: number, border: number, depth: number): void {
    if (this.textures.exists(key)) {
      const n = this.add.nineslice(b.x, b.y, key, undefined, b.w / s, b.h / s, border, border, border, border)
        .setOrigin(0, 0).setScale(s).setDepth(depth);
      this.parts.push(n);
    } else {
      // Missing art: plain fill (the body) / frame (the bezel) so the layout still reads.
      const g = this.add.graphics().setDepth(depth);
      if (key === 'shell_body') g.fillStyle(0x36263f, 1).fillRect(b.x, b.y, b.w, b.h);
      else g.lineStyle(border * s, 0x1c2030, 1).strokeRect(b.x + (border * s) / 2, b.y + (border * s) / 2, b.w - border * s, b.h - border * s);
      this.parts.push(g);
    }
  }

  private layout(): void {
    applyCssCamera(this);
    this.parts.forEach((p) => p.destroy());
    this.parts = [];
    this.labels.clear();
    const L = currentShellLayout(this);
    const s = L.s;
    this.nine('shell_body', L.body, s, SHELL_ART.bodyCorner, 0);
    this.nine('screen_bezel', L.bezel, s, SHELL_ART.bezelBorder, 1);
    this.img('joystick_well', L.well, s);
    this.img('logo_plate', L.logo, s);
    this.img('speaker_grille', L.grille, s);
    this.led = this.img('power_led_on', L.led, s);
    const labelKeys: Record<string, string> = {
      interact: 'label_use', drop: 'label_drop', sneak: 'label_sneak',
      shoot: this.shootReady ? 'label_shoot' : 'label_shoot_disabled',
    };
    for (const [id, b] of Object.entries(L.buttons)) {
      this.img('btn_socket', b.socket, s);
      const key = labelKeys[id];
      if (!this.textures.exists(key)) continue;
      const lbl = this.add.image(b.labelX, b.labelY, key).setOrigin(0.5, 0).setScale(s).setDepth(2);
      // Keep the label on whole device px (its width can be odd at 1x).
      lbl.setX(snapToDevice(b.labelX - lbl.displayWidth / 2, L.dpr) + lbl.displayWidth / 2);
      this.parts.push(lbl);
      this.labels.set(id, lbl);
    }
  }
}
