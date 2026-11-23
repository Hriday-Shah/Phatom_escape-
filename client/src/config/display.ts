import Phaser from 'phaser';

/** Highest devicePixelRatio we render at (keeps fill-rate sane on 4x screens). */
export const MAX_RENDER_DPR = 3;

/** DPR to render at right now: window.devicePixelRatio, clamped to [1, MAX_RENDER_DPR]. */
export function currentRenderDpr(): number {
  const dpr = window.devicePixelRatio || 1;
  return Math.min(MAX_RENDER_DPR, Math.max(1, dpr));
}

/**
 * The DPR the game is currently rendering at. The canvas backing store is
 * (CSS size x dpr) and the ScaleManager zoom is 1/dpr, so dpr = 1 / zoom.
 */
export function gameDpr(scene: Phaser.Scene): number {
  const zoom = scene.scale.zoom || 1;
  return 1 / zoom;
}

/** Viewport size in CSS px (what layout specs are written in). */
export function cssSize(scene: Phaser.Scene): { width: number; height: number } {
  const dpr = gameDpr(scene);
  return { width: scene.scale.width / dpr, height: scene.scale.height / dpr };
}

/** HUD scale per ui-layout.md: art x2 on phones, art x3 when the short side is >= 600 CSS px. */
export function hudScale(scene: Phaser.Scene): number {
  const { width, height } = cssSize(scene);
  return Math.min(width, height) >= 600 ? 1.5 : 1;
}

/** Dev-only logging (stripped from production behaviour). */
export function devLog(...args: unknown[]): void {
  if (import.meta.env.DEV) console.log(...args);
}
