import Phaser from 'phaser';
import { gameDpr } from '../config/display';
import { ButtonId, ShellLayout } from '../ui/shellLayout';

const ICONS: Record<ButtonId, string> = {
  interact: 'icon_interact', drop: 'icon_drop', sneak: 'icon_sneak', shoot: 'icon_shoot',
};

/**
 * The console's four round buttons (btn_round + 12x12 icon at +6,+5; pressed: btn_round_pressed,
 * icon at +6,+6) and the item slot, which sits inside the game screen (top-right).
 * Hit area = the whole 28*s socket (>= 56 CSS px; the button art itself is >= 48).
 */
export class UIControls {
  private scene: Phaser.Scene;
  private buttons = new Map<ButtonId, { face: Phaser.GameObjects.Image; icon: Phaser.GameObjects.Image; zone: Phaser.GameObjects.Zone; enabled: boolean }>();
  private itemSlot: Phaser.GameObjects.Container;
  private layout: ShellLayout | null = null;
  /** Stage 1: Shoot exists but is disabled (no stun gun yet). */
  private enabled: Record<ButtonId, boolean> = { interact: true, drop: true, sneak: true, shoot: false };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    (['drop', 'shoot', 'sneak', 'interact'] as ButtonId[]).forEach((id) => this.createButton(id));
    this.itemSlot = scene.add.container(0, 0).setDepth(1000);
    if (scene.textures.exists('ui_item_slot')) {
      this.itemSlot.add(scene.add.image(0, 0, 'ui_item_slot').setOrigin(0, 0));
    } else {
      this.itemSlot.add([
        scene.add.rectangle(0, 0, 60, 60, 0x333333, 0.5).setOrigin(0, 0),
        scene.add.rectangle(0, 0, 60, 60).setOrigin(0, 0).setStrokeStyle(2, 0x666666, 0.8),
      ]);
    }
  }

  private createButton(id: ButtonId): void {
    const s = this.scene;
    const enabled = this.enabled[id];
    const face = s.add.image(0, 0, enabled ? 'btn_round' : 'btn_round_disabled').setOrigin(0, 0).setDepth(1000);
    const icon = s.add.image(0, 0, id === 'shoot' && !enabled ? 'icon_shoot_disabled' : ICONS[id]).setOrigin(0, 0).setDepth(1001);
    const zone = s.add.zone(0, 0, 1, 1).setOrigin(0, 0).setDepth(1002);
    const entry = { face, icon, zone, enabled };
    this.buttons.set(id, entry);
    zone.setInteractive();
    zone.on('pointerdown', () => {
      if (!entry.enabled) return;
      this.setPressed(id, true);
      s.events.emit(id);
    });
    const release = () => this.setPressed(id, false);
    zone.on('pointerup', release);
    zone.on('pointerout', release);
  }

  private setPressed(id: ButtonId, pressed: boolean): void {
    const b = this.buttons.get(id);
    if (!b || !this.layout) return;
    const L = this.layout, s = L.s, box = L.buttons[id].button;
    if (b.enabled) b.face.setTexture(pressed ? 'btn_round_pressed' : 'btn_round');
    b.icon.setPosition(box.x + 6 * s, box.y + (pressed ? 6 : 5) * s);
  }

  /** Centre of a button in CSS px (tests derive tap positions from this). */
  public getButtonCenter(id: ButtonId): { x: number; y: number } | null {
    const b = this.layout?.buttons[id].button;
    return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : null;
  }

  public resize(layout: ShellLayout): void {
    this.layout = layout;
    const s = layout.s;
    for (const [id, b] of this.buttons) {
      const r = layout.buttons[id];
      b.face.setScale(s).setPosition(r.button.x, r.button.y);
      b.icon.setScale(s);
      b.zone.setPosition(r.socket.x, r.socket.y).setSize(r.socket.w, r.socket.h);
      b.zone.input?.hitArea.setTo(0, 0, r.socket.w, r.socket.h);
      this.setPressed(id, false);
    }
    // Item slot: inside the screen, top-right (ui_item_slot is 120 px = 4x art; 2 CSS per art px).
    const scr = layout.screen;
    const size = Math.min(60, Math.floor(scr.w * 0.2), Math.floor(scr.h * 0.2));
    const m = 2 * s;
    this.itemSlot.setPosition(scr.x + scr.w - m - size, scr.y + m);
    const first = this.itemSlot.list[0] as any;
    if (first instanceof Phaser.GameObjects.Image) first.setDisplaySize(size, size);
    else this.itemSlot.setScale(size / 60);
    this.itemSlot.list.forEach((c: any) => c instanceof Phaser.GameObjects.Text && c.setResolution(gameDpr(this.scene)));
  }

  /** Item slot bounds (CSS px), so the prompt can keep clear of it. */
  public getItemSlotBounds(): Phaser.Geom.Rectangle {
    return this.itemSlot.getBounds();
  }

  public destroy(): void {
    this.buttons.forEach((b) => { b.face.destroy(); b.icon.destroy(); b.zone.destroy(); });
    this.buttons.clear();
    this.itemSlot.destroy();
  }
}

