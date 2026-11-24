/**
 * Boost open/closed contrast for appliances whose approved open frame is too
 * close in luminance to the closed one (QA R12-12). Only the pixels that
 * actually change are adjusted; the source PNGs are not edited. The result is
 * a runtime canvas texture so it works in Canvas and WebGL.
 */
import Phaser from 'phaser';

type Boost = { kind: 'multiply' | 'toWhite' | 'toDark'; amount: number };

/** Keyed by the closed texture key. Amount is a multiplier or a 0–1 lerp to white/dark. */
const BOOSTS: Record<string, Boost> = {
  stove: { kind: 'multiply', amount: 2.2 },
  fridge: { kind: 'toDark', amount: 1 },
};

const PREFIX = 'lit_';

/**
 * Return a texture key to use for the open state. If this unit needs a boost,
 * a derived `lit_{openKey}` texture is created (once) from the approved frames (name still ends in `_open` so open-state checks keep working).
 */
export function boostedOpenKey(scene: Phaser.Scene, closedKey: string, openKey: string): string {
  const spec = BOOSTS[closedKey];
  if (!spec) return openKey;
  const outKey = PREFIX + openKey;
  if (scene.textures.exists(outKey)) return outKey;
  const closed = scene.textures.get(closedKey).getSourceImage() as CanvasImageSource;
  const open = scene.textures.get(openKey).getSourceImage() as CanvasImageSource;
  const w = (open as HTMLImageElement).width, h = (open as HTMLImageElement).height;
  const canvas = scene.textures.createCanvas(outKey, w, h);
  if (!canvas) return openKey;
  const ctx = canvas.getContext();
  if (!ctx) return openKey;
  ctx.drawImage(open, 0, 0);
  const src = ctx.getImageData(0, 0, w, h);
  const cbuf = document.createElement('canvas');
  cbuf.width = w; cbuf.height = h;
  const cctx = cbuf.getContext('2d');
  if (!cctx) return openKey;
  cctx.drawImage(closed, 0, 0);
  const closedData = cctx.getImageData(0, 0, w, h).data;
  const d = src.data;
  const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const lo = lum(d[i], d[i + 1], d[i + 2]);
    const lc = lum(closedData[i], closedData[i + 1], closedData[i + 2]);
    if (Math.abs(lo - lc) <= 4) continue;
    if (spec.kind === 'multiply') {
      const m = spec.amount;
      d[i] = Math.min(255, Math.round(d[i] * m));
      d[i + 1] = Math.min(255, Math.round(d[i + 1] * m));
      d[i + 2] = Math.min(255, Math.round(d[i + 2] * m));
    } else if (spec.kind === 'toWhite') {
      const t = spec.amount;
      d[i] = Math.round(d[i] * (1 - t) + 255 * t);
      d[i + 1] = Math.round(d[i + 1] * (1 - t) + 255 * t);
      d[i + 2] = Math.round(d[i + 2] * (1 - t) + 255 * t);
    } else {
      // Dark open cavity (microwave-style). Dest is a cool interior, not pure black,
      // so the unit still reads as a fridge and the 0.18 yellow highlight cannot wash it back to the closed-door luminance.
      const t = spec.amount;
      d[i] = Math.round(d[i] * (1 - t) + 22 * t);
      d[i + 1] = Math.round(d[i + 1] * (1 - t) + 18 * t);
      d[i + 2] = Math.round(d[i + 2] * (1 - t) + 26 * t);
    }
  }
  ctx.putImageData(src, 0, 0);
  canvas.refresh();
  return outKey;
}
