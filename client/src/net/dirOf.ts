import { dirIndex } from './protocol';

/** Direction 0..3 like Player's animation (horizontal wins), from velocity or else facing. */
export function dirOf(vx: number, vy: number, fallback: { x: number; y: number }): number {
  const [x, y] = vx || vy ? [vx, vy] : [fallback.x, fallback.y];
  if (Math.abs(x) > Math.abs(y)) return dirIndex(x > 0 ? 'right' : 'left');
  return dirIndex(y < 0 ? 'up' : 'down');
}
