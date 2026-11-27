/**
 * Small circular minimap in the game screen. The disc is this player's light
 * on the current floor (kept for the round). Other players, when this phone is
 * a player, are arrows on a ring — a bearing, not a sprite at their coordinates.
 * A Phantom gets the same fog and no arrows.
 */
import Phaser from 'phaser';
import { FLOOR_GROUND, floorBounds, type FloorId } from '../data/houseFloors';
import { BEARING_SECTORS } from '../logic/interest';
import {
  floorToMinimap, minimapFit, pushReveal, type MinimapFrame, type RevealStamp,
} from '../logic/minimap';
import { currentShellLayout } from './currentLayout';
import { minimapBox } from './shellLayout';

const TEX = 'pe-minimap-fog';
const PX = 160;

export class MinimapView {
  private image: Phaser.GameObjects.Image | null = null;
  private rim: Phaser.GameObjects.Graphics;
  private arrows: Phaser.GameObjects.Graphics;
  private selfDot: Phaser.GameObjects.Graphics;
  private stamps: RevealStamp[] = [];
  private floor: FloorId = FLOOR_GROUND;
  private dirty = true;
  private shown = false;
  private arrowKey = '';

  constructor(private scene: Phaser.Scene) {
    this.rim = scene.add.graphics().setDepth(851);
    this.arrows = scene.add.graphics().setDepth(852);
    this.selfDot = scene.add.graphics().setDepth(853);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    scene.events.once(Phaser.Scenes.Events.DESTROY, () => this.destroy());
  }

  layout(): void {
    this.dirty = true;
  }

  setFrame(frame: MinimapFrame): void {
    const show = frame.show;
    if (!show) {
      this.setShown(false);
      return;
    }
    this.setShown(true);
    if (frame.fullReveal) {
      const b = floorBounds(frame.floor);
      const next = pushReveal(this.stamps, frame.floor, b.x + b.width / 2, b.y + b.height / 2, Math.hypot(b.width, b.height));
      if (next !== this.stamps) { this.stamps = next; this.dirty = true; }
    } else if (frame.radius > 0) {
      const next = pushReveal(this.stamps, frame.floor, frame.x, frame.y, frame.radius);
      if (next !== this.stamps) { this.stamps = next; this.dirty = true; }
    }
    if (this.floor !== frame.floor) { this.floor = frame.floor; this.dirty = true; }
    const bearings = frame.role === 'phantom' ? [] : frame.bearings;
    const key = bearings.map((b) => `${b.id}:${b.sector}:${b.tint}`).join('|');
    if (this.dirty || key !== this.arrowKey) this.redraw(frame, bearings);
    else this.placeSelf(frame);
    this.arrowKey = key;
  }

  private setShown(on: boolean): void {
    if (this.shown === on) return;
    this.shown = on;
    this.image?.setVisible(on);
    this.rim.setVisible(on);
    this.arrows.setVisible(on);
    this.selfDot.setVisible(on);
    if (!on) {
      this.arrows.clear();
      this.selfDot.clear();
    }
  }

  private texture(): Phaser.Textures.CanvasTexture | null {
    if (!this.scene.textures.exists(TEX)) {
      const created = this.scene.textures.createCanvas(TEX, PX, PX);
      if (!created) return null;
    }
    const tex = this.scene.textures.get(TEX);
    return tex instanceof Phaser.Textures.CanvasTexture ? tex : null;
  }

  private redraw(frame: MinimapFrame, bearings: MinimapFrame['bearings']): void {
    const box = minimapBox(currentShellLayout(this.scene));
    const tex = this.texture();
    if (!tex) return;
    const ctx = tex.getContext();
    const fit = minimapFit(frame.floor, { x: 0, y: 0, w: PX, h: PX });
    const b = floorBounds(frame.floor);
    ctx.clearRect(0, 0, PX, PX);
    ctx.save();
    ctx.beginPath();
    ctx.arc(PX / 2, PX / 2, PX / 2 - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#07060a';
    ctx.fillRect(0, 0, PX, PX);
    ctx.fillStyle = '#4a3f34';
    for (const s of this.stamps) {
      if (s.floor !== frame.floor) continue;
      const cx = fit.ox + (s.x - b.x) * fit.scale;
      const cy = fit.oy + (s.y - b.y) * fit.scale;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1, s.r * fit.scale), 0, Math.PI * 2);
      ctx.fill();
    }
    if (!frame.fullReveal && frame.radius > 0) {
      const cx = fit.ox + (frame.x - b.x) * fit.scale;
      const cy = fit.oy + (frame.y - b.y) * fit.scale;
      ctx.fillStyle = 'rgba(196, 168, 120, 0.35)';
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1, frame.radius * fit.scale), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    tex.refresh();
    if (!this.image) {
      this.image = this.scene.add.image(box.x, box.y, TEX).setOrigin(0, 0).setDepth(850);
    }
    this.image.setPosition(box.x, box.y).setDisplaySize(box.w, box.h).setVisible(true);

    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const radius = box.w / 2;
    this.rim.clear();
    this.rim.lineStyle(Math.max(2, box.w * 0.035), 0x8a7560, 1);
    this.rim.strokeCircle(cx, cy, radius - 1);

    this.arrows.clear();
    const used = new Map<number, number>();
    for (const arrow of bearings) {
      if (!Number.isInteger(arrow.sector) || arrow.sector < 0 || arrow.sector >= BEARING_SECTORS) continue;
      const n = used.get(arrow.sector) ?? 0;
      used.set(arrow.sector, n + 1);
      const ang = ((arrow.sector + n * 0.22) / BEARING_SECTORS) * Math.PI * 2;
      const r2 = radius * 0.78;
      const r1 = radius * 0.52;
      const spread = 0.42;
      this.arrows.fillStyle(arrow.tint, 1);
      this.arrows.fillTriangle(
        cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2,
        cx + Math.cos(ang + spread) * r1, cy + Math.sin(ang + spread) * r1,
        cx + Math.cos(ang - spread) * r1, cy + Math.sin(ang - spread) * r1,
      );
    }
    this.placeSelf(frame);
    this.dirty = false;
  }

  private placeSelf(frame: MinimapFrame): void {
    const box = minimapBox(currentShellLayout(this.scene));
    const here = floorToMinimap(frame.floor, frame.x, frame.y, box);
    this.selfDot.clear();
    this.selfDot.fillStyle(0xf2efe6, 1);
    this.selfDot.fillCircle(here.x, here.y, Math.max(2, box.w * 0.035));
  }

  destroy(): void {
    this.image?.destroy();
    this.image = null;
    this.rim.destroy();
    this.arrows.destroy();
    this.selfDot.destroy();
    if (this.scene.textures.exists(TEX)) this.scene.textures.remove(TEX);
  }
}
