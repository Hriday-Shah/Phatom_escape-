import Phaser from 'phaser';
import { Rect } from '../logic/spotTargeting';

/**
 * What casts shadows: 'furniture' (default) = walls, locked doors, hiding spots and
 * blocking furniture, with furniture art punched back out of the mask so it stays lit
 * where the light can see it; 'walls' = walls and locked doors only (no furniture floor
 * shadows).
 */
export const LIGHT_OCCLUDERS: 'furniture' | 'walls' = 'furniture';

/**
 * Player's limited vision: darkness everywhere except a soft circle of light around the player,
 * with walls, locked doors, and (when LIGHT_OCCLUDERS is 'furniture') hiding spots and
 * blocking furniture casting hard shadows onto the floor behind them. Furniture art and
 * searchable spots are punched back out of the furniture-shadow mask so they never
 * self-shadow or shadow neighbouring furniture, then walls-only shadow quads are drawn
 * on top so furniture behind a wall stays as dark as the rest of the unlit house.
 *
 * Cheap by design: the light brush is the approved fx_light_mask texture (no per-frame drawing
 * of the gradient). The darkness is one half-resolution
 * RenderTexture the size of the camera view plus a margin; it is only redrawn (fill, erase the
 * brush, draw the shadow quads of the few walls in range) when the player has moved
 * REDRAW_STEP world px or the camera view (now, or where the camera follow is heading this
 * frame) would leave the texture. Standing still costs nothing.
 *
 * Shadows (QA R7-2/R7-3): every occluder is its full rectangle. Each edge that faces away from
 * the player casts a quad, so the shadow starts at the rect's far silhouette (the wall itself
 * stays lit) and touching rects (door + adjoining walls, jambs) leave no seams. Rects are
 * grown by SEAM px so rasterised edges of neighbours overlap.
 */
export class LightLayer {
  /** World px per RenderTexture texel (1 art px): soft gradient, pixel-art shadow edges. */
  static readonly RES = 2;
  static readonly REDRAW_STEP = 2;
  /**
   * Extra world px on each side of the view, so small camera moves need no redraw, and the
   * view the camera follow reaches this frame is always covered (QA R7-4: >= 32).
   */
  static readonly MARGIN = 48;
  /** World px each occluder rect is grown by, so neighbouring rects' shadows overlap. */
  static readonly SEAM = 0.75;
  /** Opacity of the darkness (1 = pitch black). */
  static readonly DARKNESS = 0.97;
  /**
   * Light brush: the approved fx_light_mask (208x208 art px, alpha 1 = light at the centre to 0
   * at radius 104 art px). Swap the art by replacing that PNG / manifest entry.
   */
  static readonly MASK_KEY = 'fx_light_mask';

  private scene: Phaser.Scene;
  private radius: number;
  /** Walls and locked doors (grown by SEAM). Drawn last so they hide punched furniture. */
  private wallRects: Rect[];
  /**
   * Furniture / hiding-spot rects (grown by SEAM): they cast floor shadows, then are
   * punched out of that shadow so their art stays lit — but only where a wall is not
   * in the way (wall shadows are applied after the punch).
   */
  private furnRects: Rect[];
  private rt!: Phaser.GameObjects.RenderTexture;
  /** Inverse of the light brush: opaque darkness outside the light, transparent inside. */
  private outside!: Phaser.GameObjects.RenderTexture;
  private brush: Phaser.GameObjects.Image;
  private shadows: Phaser.GameObjects.Graphics;
  private punch: Phaser.GameObjects.Graphics;
  private lastX = NaN;
  private lastY = NaN;
  /** Redraw count (QA / perf scripts). */
  public redraws = 0;

  constructor(scene: Phaser.Scene, radius: number, wallOccluders: Rect[], furnitureOccluders: Rect[] = []) {
    this.scene = scene;
    this.radius = radius;
    const e = LightLayer.SEAM;
    const grow = (r: Rect): Rect => ({ x: r.x - e, y: r.y - e, width: r.width + 2 * e, height: r.height + 2 * e });
    this.wallRects = wallOccluders.map(grow);
    this.furnRects = furnitureOccluders.map(grow);
    const d = (radius * 2) / LightLayer.RES;
    // Erase brush at the mask's worldSize (416 world px = radius 208) in texel units.
    this.brush = scene.make.image({ key: LightLayer.MASK_KEY, add: false })
      .setOrigin(0.5).setDisplaySize(d, d);
    this.shadows = scene.make.graphics({}, false);
    this.punch = scene.make.graphics({}, false);
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
    this.outside?.destroy();
    this.rt = this.scene.add.renderTexture(0, 0, w, h)
      .setOrigin(0, 0).setScale(LightLayer.RES).setDepth(50).setAlpha(LightLayer.DARKNESS);
    this.outside = this.scene.make.renderTexture({ x: 0, y: 0, width: w, height: h }, false);
    this.outside.setOrigin(0, 0);
    this.lastX = NaN;
  }

  public update(px: number, py: number, force = false): void {
    const res = LightLayer.RES;
    const rt = this.rt;
    const cam = this.scene.cameras.main;
    const view = cam.worldView;
    // The camera follow runs after this (in the render step) and moves the view lerp of the
    // way toward its target: the texture must cover both the current and that next view.
    const fv = followTargetView(cam);
    const tgt = { x: view.x + (fv.x - view.x) * cam.lerp.x, y: view.y + (fv.y - view.y) * cam.lerp.y };
    const need = {
      x: Math.min(view.x, tgt.x) - 1, y: Math.min(view.y, tgt.y) - 1,
      right: Math.max(view.right, tgt.x + view.width) + 1, bottom: Math.max(view.bottom, tgt.y + view.height) + 1,
    };
    const covered = need.x >= rt.x && need.y >= rt.y
      && need.right <= rt.x + rt.width * res && need.bottom <= rt.y + rt.height * res;
    if (!force && covered && Math.abs(px - this.lastX) < LightLayer.REDRAW_STEP
      && Math.abs(py - this.lastY) < LightLayer.REDRAW_STEP) return;
    const t0 = performance.now();
    this.lastX = px;
    this.lastY = py;
    this.redraws++;

    // Cover the view plus the margin; snapped to whole art px so the light doesn't shimmer.
    const cx = (need.x + need.right) / 2, cy = (need.y + need.bottom) / 2;
    const ox = Math.floor((cx - (rt.width * res) / 2) / res) * res;
    const oy = Math.floor((cy - (rt.height * res) / 2) / res) * res;
    rt.setPosition(ox, oy);
    const lx = (px - ox) / res, ly = (py - oy) / res;

    rt.clear();
    rt.fill(0x000000, 1);
    rt.erase(this.brush, lx, ly);

    // Shadow quads: every edge of an occluder rect in range that faces away from the player,
    // projected away from the player (together: the rect's whole shadow beyond it).
    const g = this.shadows;
    const far = this.radius * 3;
    const quad = (x1: number, y1: number, x2: number, y2: number) => {
      const p1 = { x: x1, y: y1 }, p2 = { x: x2, y: y2 };
      const p3 = project(px, py, p2, far), p4 = project(px, py, p1, far);
      g.fillPoints([p1, p2, p3, p4].map((p) => ({ x: (p.x - ox) / res, y: (p.y - oy) / res })), true);
    };
    const drawShadows = (rects: Rect[]) => {
      g.clear();
      g.fillStyle(0x000000, 1);
      for (const r of rects) {
        if (distToRect(px, py, r) > this.radius) continue;
        const x0 = r.x, y0 = r.y, x1 = r.x + r.width, y1 = r.y + r.height;
        if (py > y0) quad(x0, y0, x1, y0); // top edge (player below it)
        if (py < y1) quad(x0, y1, x1, y1); // bottom edge
        if (px > x0) quad(x0, y0, x0, y1); // left edge
        if (px < x1) quad(x1, y0, x1, y1); // right edge
      }
      rt.draw(g);
    };

    // Furniture floor shadows first (LIGHT_OCCLUDERS === 'furniture'), then punch the
    // furniture art back out so it does not self-shadow. Restore darkness outside the
    // light so unlit furniture does not show. Wall / locked-door shadows are drawn
    // last: they re-darken any punched furniture the light cannot actually reach.
    if (this.furnRects.length) {
      drawShadows(this.furnRects);
      const gPunch = this.punch;
      gPunch.clear();
      gPunch.fillStyle(0xffffff, 1);
      const reach = this.radius + LightLayer.SEAM * 2;
      for (const r of this.furnRects) {
        if (distToRect(px, py, r) > reach) continue;
        gPunch.fillRect((r.x - ox) / res, (r.y - oy) / res, r.width / res, r.height / res);
      }
      rt.erase(gPunch);
      const inv = this.outside;
      inv.clear();
      inv.fill(0x000000, 1);
      inv.erase(this.brush, lx, ly);
      rt.draw(inv, 0, 0);
    }
    drawShadows(this.wallRects);

    this.cpuMs += performance.now() - t0;
  }

  /** Total JS time spent redrawing (QA / perf scripts). */
  public cpuMs = 0;

  public setVisible(v: boolean): void {
    this.rt.setVisible(v);
  }

  public destroy(): void {
    this.rt.destroy();
    this.outside?.destroy();
    this.brush.destroy();
    this.shadows.destroy();
    this.punch.destroy();
  }
}

function project(px: number, py: number, p: { x: number; y: number }, far: number): { x: number; y: number } {
  const dx = p.x - px, dy = p.y - py;
  const len = Math.hypot(dx, dy) || 1;
  return { x: p.x + (dx / len) * far, y: p.y + (dy / len) * far };
}

function distToRect(px: number, py: number, r: Rect): number {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.width));
  const dy = Math.max(r.y - py, 0, py - (r.y + r.height));
  return Math.hypot(dx, dy);
}

/** Top-left of the view the camera follow is heading to (follow target, offset, bounds). */
function followTargetView(cam: Phaser.Cameras.Scene2D.Camera): { x: number; y: number } {
  const view = cam.worldView;
  const f = (cam as any)._follow as { x: number; y: number } | null;
  if (!f) return { x: view.x, y: view.y };
  let x = f.x - cam.followOffset.x - view.width / 2;
  let y = f.y - cam.followOffset.y - view.height / 2;
  if (cam.useBounds) {
    const b = cam.getBounds();
    x = b.width <= view.width ? b.centerX - view.width / 2 : Phaser.Math.Clamp(x, b.x, b.right - view.width);
    y = b.height <= view.height ? b.centerY - view.height / 2 : Phaser.Math.Clamp(y, b.y, b.bottom - view.height);
  }
  return { x, y };
}
