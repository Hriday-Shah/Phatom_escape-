/**
 * Composes the house walls from the approved wall/window tiles into one texture.
 *
 * Wall rects are rasterised onto an art-pixel grid (1 art px = 2 world units), merged,
 * and every wall pixel is painted from the approved tiles:
 *  - thin horizontal runs use the `wall` strip rows (top highlight ... bottom outline),
 *  - thin vertical runs use the `wall_v` strip columns,
 *  - thick areas and junctions use `wall_fill` with the strip's highlight/outline on the edges,
 *  - window rects use `window` / `window_v`.
 * Merging first means no joints inside straight walls and no double outlines where two rooms
 * share a wall. Physics bodies are NOT created here (GameScene keeps one per layout rect).
 */
import Phaser from 'phaser';
import type { Wall, WindowRect } from '../data/houseLayout';

export const WALL_TEXTURE_KEY = 'walls_composed';
const REQUIRED = ['wall', 'wall_v', 'wall_fill', 'window', 'window_v'];
const ART_SCALE = 2;

type Px = [number, number, number, number];

class TilePixels {
  readonly w: number;
  readonly h: number;
  private data: Uint8ClampedArray;

  constructor(scene: Phaser.Scene, key: string) {
    const src = scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    this.w = src.width;
    this.h = src.height;
    const c = document.createElement('canvas');
    c.width = this.w;
    c.height = this.h;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(src, 0, 0);
    this.data = ctx.getImageData(0, 0, this.w, this.h).data;
  }

  get(x: number, y: number): Px {
    const xi = ((x % this.w) + this.w) % this.w;
    const yi = ((y % this.h) + this.h) % this.h;
    const i = (yi * this.w + xi) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }
}

export function canComposeWalls(scene: Phaser.Scene): boolean {
  return REQUIRED.every((k) => scene.textures.exists(k));
}

/** Builds the composed wall texture and adds it to the scene. Returns the image, or null if art is missing. */
export function createComposedWalls(
  scene: Phaser.Scene,
  worldWidth: number,
  worldHeight: number,
  walls: Wall[],
  windows: WindowRect[],
): Phaser.GameObjects.Image | null {
  if (!canComposeWalls(scene)) return null;

  const gw = Math.ceil(worldWidth / ART_SCALE);
  const gh = Math.ceil(worldHeight / ART_SCALE);
  const solid = new Uint8Array(gw * gh);
  const win = new Int16Array(gw * gh).fill(-1); // index into windows[]

  const rasterise = (r: { x: number; y: number; width: number; height: number }, fn: (i: number) => void) => {
    const x0 = Math.floor(r.x / ART_SCALE);
    const y0 = Math.floor(r.y / ART_SCALE);
    const x1 = Math.ceil((r.x + r.width) / ART_SCALE);
    const y1 = Math.ceil((r.y + r.height) / ART_SCALE);
    for (let y = Math.max(0, y0); y < Math.min(gh, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(gw, x1); x++) fn(y * gw + x);
    }
  };
  walls.forEach((w) => rasterise(w, (i) => (solid[i] = 1)));
  windows.forEach((w, wi) => rasterise(w, (i) => { if (solid[i]) win[i] = wi; }));

  const isSolid = (x: number, y: number) => x >= 0 && y >= 0 && x < gw && y < gh && solid[y * gw + x] === 1;
  const run = (x: number, y: number, dx: number, dy: number) => {
    let n = 0;
    while (isSolid(x + dx * (n + 1), y + dy * (n + 1))) n++;
    return n;
  };

  const wallH = new TilePixels(scene, 'wall');
  const wallV = new TilePixels(scene, 'wall_v');
  const fill = new TilePixels(scene, 'wall_fill');
  const winH = new TilePixels(scene, 'window');
  const winV = new TilePixels(scene, 'window_v');
  const HIGHLIGHT = wallH.get(0, 0);
  const OUTLINE = wallH.get(0, wallH.h - 1);

  const canvas = document.createElement('canvas');
  canvas.width = gw;
  canvas.height = gh;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(gw, gh);

  // Map a depth into a strip of `thickness` px onto a tile axis of `size` px:
  // first px = tile 0 (highlight), last px = tile size-1 (outline), interior = tile 1..size-2.
  const stripIndex = (fromStart: number, fromEnd: number, size: number) => {
    if (fromStart === 0) return 0;
    if (fromEnd === 0) return size - 1;
    return Math.min(fromStart, size - 2);
  };

  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const i = y * gw + x;
      if (!solid[i]) continue;
      const up = run(x, y, 0, -1);
      const down = run(x, y, 0, 1);
      const left = run(x, y, -1, 0);
      const right = run(x, y, 1, 0);
      const tv = up + down + 1; // vertical thickness through this px
      const th = left + right + 1; // horizontal thickness through this px
      const thin = 6;
      let px: Px;

      if (win[i] >= 0) {
        const w = windows[win[i]];
        const wx0 = Math.floor(w.x / ART_SCALE);
        const wy0 = Math.floor(w.y / ART_SCALE);
        const wx1 = Math.ceil((w.x + w.width) / ART_SCALE) - 1;
        const wy1 = Math.ceil((w.y + w.height) / ART_SCALE) - 1;
        if (w.width >= w.height) {
          // Window strip has no highlight row of its own beyond row 0; skip it so the frame is symmetric.
          const row = down === 0 ? winH.h - 1 : Math.min(up + 1, winH.h - 2);
          const col = x === wx1 ? 0 : (x - wx0) % winH.w; // close the last pane with a mullion
          px = winH.get(col, row);
        } else {
          const col = right === 0 ? winV.w - 1 : Math.min(left + 1, winV.w - 2);
          const row = y === wy1 ? winV.h - 1 : (y - wy0) % winV.h;
          px = winV.get(col, row);
        }
      } else if (tv <= thin && th > tv) {
        px = wallH.get(x, stripIndex(up, down, wallH.h));
      } else if (th <= thin && tv > th) {
        px = wallV.get(stripIndex(left, right, wallV.w), y);
      } else if (up === 0 || left === 0) {
        px = HIGHLIGHT;
      } else if (down === 0 || right === 0) {
        px = OUTLINE;
      } else {
        px = fill.get(x, y);
      }

      img.data[i * 4] = px[0];
      img.data[i * 4 + 1] = px[1];
      img.data[i * 4 + 2] = px[2];
      img.data[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  if (scene.textures.exists(WALL_TEXTURE_KEY)) scene.textures.remove(WALL_TEXTURE_KEY);
  scene.textures.addCanvas(WALL_TEXTURE_KEY, canvas);
  return scene.add.image(0, 0, WALL_TEXTURE_KEY).setOrigin(0, 0).setScale(ART_SCALE).setDepth(-1);
}
