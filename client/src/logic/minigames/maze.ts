import { Rng, mulberry32, randInt, shuffle } from '../seededRng';
import { MinigameEngine, MinigameInput, MinigameStatus } from './types';

/** Odd width/height so corridors and walls alternate. 0 wall, 1 floor. */
/** 12×10 tile board fills the 96×80 art screen at 8 px/tile. Corridors sit on odd cells. */
export const MAZE_W = 12;
export const MAZE_H = 10;

/** Start and exit on the last odd cells inside the border (9,7 on the default 12×10). */
export function mazePorts(w = MAZE_W, h = MAZE_H): { sx: number; sy: number; ex: number; ey: number } {
  const lastOdd = (n: number) => {
    let x = n - 2;
    if ((x & 1) === 0) x -= 1;
    return Math.max(1, x);
  };
  return { sx: 1, sy: 1, ex: lastOdd(w), ey: lastOdd(h) };
}

export interface MazeState {
  grid: number[]; // row-major, W*H, 1 = open
  w: number;
  h: number;
  px: number;
  py: number;
  ex: number;
  ey: number;
}

export function idx(x: number, y: number, w = MAZE_W): number { return y * w + x; }

export function generateMaze(rng: Rng, w = MAZE_W, h = MAZE_H): number[] {
  const grid = new Array(w * h).fill(0);
  const stack: [number, number][] = [];
  const sx = 1, sy = 1;
  grid[idx(sx, sy, w)] = 1;
  stack.push([sx, sy]);
  const dirs = [[2, 0], [-2, 0], [0, 2], [0, -2]] as const;
  while (stack.length) {
    const [x, y] = stack[stack.length - 1]!;
    const opts = shuffle(rng, [...dirs]).filter(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      return nx > 0 && ny > 0 && nx < w - 1 && ny < h - 1 && grid[idx(nx, ny, w)] === 0;
    });
    if (!opts.length) { stack.pop(); continue; }
    const [dx, dy] = opts[0]!;
    const nx = x + dx, ny = y + dy;
    grid[idx(x + dx / 2, y + dy / 2, w)] = 1;
    grid[idx(nx, ny, w)] = 1;
    stack.push([nx, ny]);
  }
  // Guarantee start and exit cells (last odd corridor, not w-2 when w is even).
  const ports = mazePorts(w, h);
  grid[idx(ports.sx, ports.sy, w)] = 1;
  grid[idx(ports.ex, ports.ey, w)] = 1;
  return grid;
}

/** Open cells with exactly one open neighbour (a corridor dead end). */
export function mazeDeadEnds(grid: number[], w = MAZE_W, h = MAZE_H): [number, number][] {
  const out: [number, number][] = [];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (grid[idx(x, y, w)] !== 1) continue;
    let n = 0;
    for (const [dx, dy] of dirs) if (mazeWalkable(grid, x + dx, y + dy, w, h)) n++;
    if (n === 1) out.push([x, y]);
  }
  return out;
}

/**
 * Knock out 15–25% of the walls that close a dead end, creating loops.
 * Only interior walls that already touch another open cell are removed, so the
 * border stays solid. Used by Chase; the Maze dash stays a perfect tree.
 */
export function punchDeadEndLoops(grid: number[], rng: Rng, w = MAZE_W, h = MAZE_H, fraction?: number): number[] {
  const next = grid.slice();
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  const ends = mazeDeadEnds(next, w, h);
  const walls: number[] = [];
  const seen = new Set<number>();
  for (const [x, y] of ends) {
    for (const [dx, dy] of dirs) {
      const wx = x + dx, wy = y + dy;
      if (wx <= 0 || wy <= 0 || wx >= w - 1 || wy >= h - 1) continue;
      const wi = idx(wx, wy, w);
      if (next[wi] !== 0 || seen.has(wi)) continue;
      // The wall must open onto another corridor (not just the dead end itself).
      const opens = dirs.some(([ox, oy]) => !(ox === -dx && oy === -dy) && mazeWalkable(next, wx + ox, wy + oy, w, h));
      if (!opens) continue;
      seen.add(wi);
      walls.push(wi);
    }
  }
  const frac = fraction ?? (0.15 + rng() * 0.10);
  const n = Math.max(1, Math.round(walls.length * frac));
  for (const wi of shuffle(rng, walls).slice(0, Math.min(n, walls.length))) next[wi] = 1;
  return next;
}

export function mazeWalkable(grid: number[], x: number, y: number, w = MAZE_W, h = MAZE_H): boolean {
  return x >= 0 && y >= 0 && x < w && y < h && grid[idx(x, y, w)] === 1;
}

/** BFS path from start to exit (list of [x,y] including start). Empty if disconnected. */
export function mazePath(grid: number[], sx: number, sy: number, ex: number, ey: number, w = MAZE_W, h = MAZE_H): [number, number][] {
  const start = idx(sx, sy, w);
  const goal = idx(ex, ey, w);
  if (!mazeWalkable(grid, sx, sy, w, h) || !mazeWalkable(grid, ex, ey, w, h)) return [];
  const q = [start];
  const prev = new Map<number, number>();
  prev.set(start, start);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let i = 0; i < q.length; i++) {
    const cur = q[i]!;
    if (cur === goal) break;
    const x = cur % w, y = Math.floor(cur / w);
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy, ni = idx(nx, ny, w);
      if (!mazeWalkable(grid, nx, ny, w, h) || prev.has(ni)) continue;
      prev.set(ni, cur);
      q.push(ni);
    }
  }
  if (!prev.has(goal)) return [];
  const path: [number, number][] = [];
  let c = goal;
  while (true) {
    path.push([c % w, Math.floor(c / w)]);
    const p = prev.get(c)!;
    if (p === c) break;
    c = p;
  }
  path.reverse();
  return path;
}

export class MazeGame implements MinigameEngine<MazeState> {
  readonly id = 'maze' as const;
  readonly w = MAZE_W;
  readonly h = MAZE_H;
  private grid: number[];
  private px: number;
  private py: number;
  readonly ex: number;
  readonly ey: number;
  private won = false;

  constructor(seed = 1) {
    const rng = mulberry32(seed >>> 0);
    this.grid = generateMaze(rng, this.w, this.h);
    const ports = mazePorts(this.w, this.h);
    this.px = ports.sx;
    this.py = ports.sy;
    this.ex = ports.ex;
    this.ey = ports.ey;
    // If a freak generation left them disconnected, punch a straight tunnel.
    if (!mazePath(this.grid, this.px, this.py, this.ex, this.ey, this.w, this.h).length) {
      for (let x = 1; x <= this.ex; x++) this.grid[idx(x, 1, this.w)] = 1;
      for (let y = 1; y <= this.ey; y++) this.grid[idx(this.ex, y, this.w)] = 1;
    }
  }

  state(): MazeState {
    return { grid: this.grid.slice(), w: this.w, h: this.h, px: this.px, py: this.py, ex: this.ex, ey: this.ey };
  }
  status(): MinigameStatus { return this.won || (this.px === this.ex && this.py === this.ey) ? 'won' : 'playing'; }

  input(action: MinigameInput): void {
    if (this.status() !== 'playing') return;
    let dx = 0, dy = 0;
    if (action.type === 'move') { dx = Math.sign(action.dx); dy = Math.sign(action.dy); }
    else if (action.type === 'tap' && action.col != null && action.row != null) {
      dx = Math.sign(action.col - this.px);
      dy = Math.sign(action.row - this.py);
      if (dx && dy) dy = 0; // one axis per tap-step
    }
    if (!dx && !dy) return;
    if (dx && dy) dy = 0;
    const nx = this.px + dx, ny = this.py + dy;
    if (!mazeWalkable(this.grid, nx, ny, this.w, this.h)) return;
    this.px = nx;
    this.py = ny;
    if (this.px === this.ex && this.py === this.ey) this.won = true;
  }

  solve(): void {
    const path = mazePath(this.grid, this.px, this.py, this.ex, this.ey, this.w, this.h);
    for (let i = 1; i < path.length; i++) {
      const [x, y] = path[i]!;
      this.input({ type: 'move', dx: x - this.px, dy: y - this.py });
    }
  }
}

/** Unused helper kept for tests that want a slightly irregular exit. */
export function randomOpenCell(rng: Rng, grid: number[], w = MAZE_W, h = MAZE_H): [number, number] {
  for (let n = 0; n < 80; n++) {
    const x = randInt(rng, 1, w - 2), y = randInt(rng, 1, h - 2);
    if (mazeWalkable(grid, x, y, w, h)) return [x, y];
  }
  return [1, 1];
}
