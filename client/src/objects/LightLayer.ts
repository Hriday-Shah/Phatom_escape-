import Phaser from 'phaser';
import { Rect } from '../logic/spotTargeting';

/**
 * Player's limited vision: darkness everywhere except a soft circle of light around the player,
 * with walls (and locked doors) casting hard shadows.
 *
 * Cheap by design: the light brush is the approved fx_light_mask texture (no per-frame drawing
 * of the gradient). The darkness is one half-resolution
 * RenderTexture the size of the camera view plus a margin; it is only redrawn (fill, erase the
 * brush, draw the shadow quads of the few walls in range) when the player has moved
 * REDRAW_STEP world px or the camera has scrolled past the margin. Standing still costs nothing.
 */
export class LightLayer {
  /** World px per RenderTexture texel (1 art px): soft gradient, pixel-art shadow edges. */
  static readonly RES = 2;
  static readonly REDRAW_STEP = 2;
  /** Extra world px on each side of the view, so small camera moves need no redraw. */
  static readonly MARGIN = 24;
  /** Opacity of the darkness (1 = pitch black). */
  static readonly DARKNESS = 0.97;
  /**
   * Light brush: the approved fx_light_mask (208x208 art px, alpha 1 = light at the centre to 0
   * at radius 104 art px). Swap the art by replacing that PNG / manifest entry.
   */
  static readonly MASK_KEY = 'fx_light_mask';

  private scene: Phaser.Scene;
  private radius: number;
  /** Occluders as segments (wall centre lines): the near half of a wall stays lit. */
  private segments: { x1: number; y1: number; x2: number; y2: number }[];
  private rt!: Phaser.GameObjects.RenderTexture;
  private brush: Phaser.GameObjects.Image;
  private shadows: Phaser.GameObjects.Graphics;
  private lastX = NaN;
  private lastY = NaN;
  /** Redraw count (QA / perf scripts). */
  public redraws = 0;

  constructor(scene: Phaser.Scene, radius: number, occluders: Rect[]) {
    this.scene = scene;
    this.radius = radius;
    this.segments = occluders.map((r) => (r.width >= r.height
      ? { x1: r.x, y1: r.y + r.height / 2, x2: r.x + r.width, y2: r.y + r.height / 2 }
      : { x1: r.x + r.width / 2, y1: r.y, x2: r.x + r.width / 2, y2: r.y + r.height }));
    const d = (radius * 2) / LightLayer.RES;
    // Erase brush at the mask's worldSize (416 world px = radius 208) in texel units.
    this.brush = scene.make.image({ key: LightLayer.MASK_KEY, add: false })
      .setOrigin(0.5).setDisplaySize(d, d);
    this.shadows = scene.make.graphics({}, false);
    this.createTexture();
  }

  /** True when the approved light mask art is loaded (the layer is skipped otherwise). */
  static available(scene: Phaser.Scene): boolean {
    return scene.textures.exists(LightLayer.MASK_KEY);
  }

  /** (Re)build the darkness texture for the current camera view; call on resize. */
  public createTexture(): void {
    const cam = this.scene.cameras.main;
    const w = Math.ceil((cam.width / cam.zoom + LightLayer.MARGIN * 2) / LightLayer.RES) + 2;
    const h = Math.ceil((cam.height / cam.zoom + LightLayer.MARGIN * 2) / LightLayer.RES) + 2;
    if (this.rt && this.rt.width === w && this.rt.height === h) return;
    this.rt?.destroy();
    this.rt = this.scene.add.renderTexture(0, 0, w, h)
      .setOrigin(0, 0).setScale(LightLayer.RES).setDepth(50).setAlpha(LightLayer.DARKNESS);
    this.lastX = NaN;
  }

  public update(px: number, py: number, force = false): void {
    const res = LightLayer.RES;
    const rt = this.rt;
    const view = this.scene.cameras.main.worldView;
    const covered = view.x >= rt.x && view.y >= rt.y
      && view.right <= rt.x + rt.width * res && view.bottom <= rt.y + rt.height * res;
    if (!force && covered && Math.abs(px - this.lastX) < LightLayer.REDRAW_STEP
      && Math.abs(py - this.lastY) < LightLayer.REDRAW_STEP) return;
    const t0 = performance.now();
    this.lastX = px;
    this.lastY = py;
    this.redraws++;

    // Cover the view plus the margin; snapped to whole art px so the light doesn't shimmer.
    const ox = Math.floor((view.centerX - (rt.width * res) / 2) / res) * res;
    const oy = Math.floor((view.centerY - (rt.height * res) / 2) / res) * res;
    rt.setPosition(ox, oy);
    const lx = (px - ox) / res, ly = (py - oy) / res;

    rt.clear();
    rt.fill(0x000000, 1);
    rt.erase(this.brush, lx, ly);

    // Shadow quads: each wall segment in range projected away from the player.
    const g = this.shadows;
    g.clear();
    g.fillStyle(0x000000, 1);
    const far = this.radius * 3;
    for (const s of this.segments) {
      if (distToSegment(px, py, s) > this.radius) continue;
      const p1 = { x: s.x1, y: s.y1 }, p2 = { x: s.x2, y: s.y2 };
      const p3 = project(px, py, p2, far), p4 = project(px, py, p1, far);
      g.fillPoints([p1, p2, p3, p4].map((p) => ({ x: (p.x - ox) / res, y: (p.y - oy) / res })), true);
    }
    rt.draw(g);
    this.cpuMs += performance.now() - t0;
  }

  /** Total JS time spent redrawing (QA / perf scripts). */
  public cpuMs = 0;

  public setVisible(v: boolean): void {
    this.rt.setVisible(v);
  }

  public destroy(): void {
    this.rt.destroy();
    this.brush.destroy();
    this.shadows.destroy();
  }
}

function project(px: number, py: number, p: { x: number; y: number }, far: number): { x: number; y: number } {
  const dx = p.x - px, dy = p.y - py;
  const len = Math.hypot(dx, dy) || 1;
  return { x: p.x + (dx / len) * far, y: p.y + (dy / len) * far };
}

function distToSegment(px: number, py: number, s: { x1: number; y1: number; x2: number; y2: number }): number {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
  const t = Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy));
}
