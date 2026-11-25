import { dirIndex } from './protocol';

/** Direction 0..3 like Player's animation (horizontal wins), from velocity or else facing. */
export function dirOf(vx: number, vy: number, fallback: { x: number; y: number }): number {
  const [x, y] = vx || vy ? [vx, vy] : [fallback.x, fallback.y];
  if (Math.abs(x) > Math.abs(y)) return dirIndex(x > 0 ? 'right' : 'left');
  return dirIndex(y < 0 ? 'up' : 'down');
}

/**
 * Facing and walking flag both phones should show. Taken from the stick, not from
 * the body's velocity: held into the car table the sprite still walks, and a slide
 * along the edge keeps the stick's facing rather than the free axis.
 * Idle keeps `lastDir`.
 */
export function poseIntent(moveX: number, moveY: number, lastDir: number): { d: number; m: 0 | 1 } {
  if (moveX || moveY) return { d: dirOf(moveX, moveY, { x: moveX, y: moveY }), m: 1 };
  return { d: lastDir, m: 0 };
}
