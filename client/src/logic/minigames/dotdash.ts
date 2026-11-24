import { mulberry32, randInt } from '../seededRng';
import { generateMaze, idx, mazePath, mazePorts, mazeWalkable, punchDeadEndLoops, MAZE_H, MAZE_W } from './maze';
import { MinigameEngine, MinigameInput } from './types';

export const CHASE_W = MAZE_W;
export const CHASE_H = MAZE_H;
export const DOTDASH_W = CHASE_W;
export const DOTDASH_H = CHASE_H;
/** Player / wisp speed in cells per second. */
export const CHASE_SPEED = 4;
/** Slow enough, with loops and a start delay, that a fleeing bot survives ≥30% of seeds (R14-1). */
export const CHASE_WISP_SPEED = 1.1;
export const DOTDASH_SPEED = CHASE_SPEED;
export const DOTDASH_GHOST_SPEED = CHASE_WISP_SPEED;
export const FRIGHTENED_SECONDS = 6;
export const FRIGHTENED_FLASH_SECONDS = 2;
export const CANDLE_COUNT = 2;
export const CHASE_WISP_COUNT = 2;
/** Seconds before wisps start moving. */
export const CHASE_WISP_DELAY = 1.5;
export type WispKind = 'ember' | 'violet' | 'pale';
export const WISP_KINDS: WispKind[] = ['ember', 'violet', 'pale'];
/** Play uses two wisps and always keeps the violet one. */
export const PLAY_WISP_KINDS: WispKind[] = ['violet', 'ember'];

export interface Actor {
  x: number;
  y: number;
  /** Fractional progress toward the next cell, 0..1. */
  fx: number;
  fy: number;
  dx: number;
  dy: number;
}

export interface Wisp extends Actor {
  kind: WispKind;
  /** Seconds until this wisp respawns; 0 means active. */
  dead: number;
}

export interface ChaseState {
  grid: number[];
  w: number;
  h: number;
  dots: boolean[];
  candles: boolean[];
  dotsLeft: number;
  dotsTotal: number;
  player: Actor;
  ghosts: Wisp[];
  status: 'playing' | 'won' | 'lost';
  survived: number;
  frightened: number;
}

export type DotDashState = ChaseState;

/** Initial chase layout the server holds and the client plays (R15-2). */
export interface ChasePuzzle {
  grid: number[];
  dots: boolean[];
  candles: boolean[];
  dotsLeft: number;
  dotsTotal: number;
  player: Actor;
  ghosts: Wisp[];
  wispWait: number;
}

/** 4-bit autotile: frame = N + 2E + 4S + 8W, where a set bit means that neighbour is a wall (or off-board). */
export function wallAutotile(grid: number[], x: number, y: number, w: number, h: number): number {
  const isWall = (cx: number, cy: number) => cx < 0 || cy < 0 || cx >= w || cy >= h || grid[cy * w + cx] === 0;
  if (!isWall(x, y)) return -1;
  return (isWall(x, y - 1) ? 1 : 0) + (isWall(x + 1, y) ? 2 : 0) + (isWall(x, y + 1) ? 4 : 0) + (isWall(x - 1, y) ? 8 : 0);
}

function neighbors(grid: number[], x: number, y: number, w: number, h: number): [number, number][] {
  const out: [number, number][] = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    if (mazeWalkable(grid, x + dx, y + dy, w, h)) out.push([dx, dy]);
  }
  return out;
}

function stepToward(grid: number[], ax: number, ay: number, tx: number, ty: number, w: number, h: number, rng: () => number): [number, number] {
  const opts = neighbors(grid, ax, ay, w, h);
  if (!opts.length) return [0, 0];
  const path = mazePath(grid, ax, ay, tx, ty, w, h);
  if (path.length >= 2) {
    const [nx, ny] = path[1]!;
    return [nx - ax, ny - ay];
  }
  return opts[Math.floor(rng() * opts.length)] ?? [0, 0];
}

export class ChaseGame implements MinigameEngine<ChaseState> {
  readonly id = 'chase' as const;
  readonly w = CHASE_W;
  readonly h = CHASE_H;
  private grid: number[];
  private dots: boolean[];
  private candles: boolean[];
  private dotsLeft: number;
  readonly dotsTotal!: number;
  private player: Actor;
  private ghosts: Wisp[];
  private queued: { dx: number; dy: number } = { dx: 0, dy: 0 };
  private result: 'playing' | 'won' | 'lost' = 'playing';
  private survived = 0;
  private frightened = 0;
  private rng: () => number;
  private ghostThink = 0;

  private wispWait = CHASE_WISP_DELAY;
  private initial!: ChasePuzzle;

  constructor(seed = 1, ghostCount = CHASE_WISP_COUNT, puzzle?: ChasePuzzle) {
    if (puzzle) {
      this.rng = mulberry32(1);
      this.grid = puzzle.grid.slice();
      this.dots = puzzle.dots.slice();
      this.candles = puzzle.candles.slice();
      this.dotsLeft = puzzle.dotsLeft;
      (this as { dotsTotal: number }).dotsTotal = puzzle.dotsTotal;
      this.player = { ...puzzle.player };
      this.ghosts = puzzle.ghosts.map((g) => ({ ...g }));
      this.wispWait = puzzle.wispWait;
      this.initial = this.capture();
      return;
    }
    this.rng = mulberry32(seed >>> 0);
    this.grid = punchDeadEndLoops(generateMaze(this.rng, this.w, this.h), this.rng, this.w, this.h);
    const { sx, sy, ex, ey } = mazePorts(this.w, this.h);
    this.grid[idx(sx, sy, this.w)] = 1;
    this.grid[idx(ex, ey, this.w)] = 1;
    if (!mazePath(this.grid, sx, sy, ex, ey, this.w, this.h).length) {
      for (let x = sx; x <= ex; x++) this.grid[idx(x, sy, this.w)] = 1;
      for (let y = sy; y <= ey; y++) this.grid[idx(ex, y, this.w)] = 1;
    }
    this.dots = this.grid.map((cell, i) => cell === 1 && i !== idx(sx, sy, this.w));
    this.candles = new Array(this.w * this.h).fill(false);
    this.player = { x: sx, y: sy, fx: 0, fy: 0, dx: 0, dy: 0 };
    const n = Math.max(1, Math.min(CHASE_WISP_COUNT, ghostCount));
    this.ghosts = [];
    const opens: { x: number; y: number; d: number }[] = [];
    let maxD = 0;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (!mazeWalkable(this.grid, x, y, this.w, this.h) || (x === sx && y === sy)) continue;
      const path = mazePath(this.grid, sx, sy, x, y, this.w, this.h);
      const d = path.length ? path.length - 1 : 0;
      opens.push({ x, y, d });
      if (d > maxD) maxD = d;
    }
    const half = Math.max(1, Math.ceil(maxD / 2));
    const farEnough = opens.filter((c) => c.d >= half).sort((a, b) => b.d - a.d);
    const pool = farEnough.length >= n ? farEnough : opens.slice().sort((a, b) => b.d - a.d);
    const kinds = n === 1 ? (['violet'] as WispKind[]) : PLAY_WISP_KINDS;
    const used = new Set<string>();
    for (let i = 0; i < n; i++) {
      const cell = pool.find((c) => !used.has(`${c.x},${c.y}`)) ?? { x: ex, y: ey, d: maxD };
      used.add(`${cell.x},${cell.y}`);
      this.dots[idx(cell.x, cell.y, this.w)] = false;
      this.ghosts.push({ x: cell.x, y: cell.y, fx: 0, fy: 0, dx: 0, dy: 0, kind: kinds[i % kinds.length]!, dead: 0 });
    }
    // Candles: prefer mid-distance open cells (not next to a wisp spawn).
    const mid = opens.slice().sort((a, b) => Math.abs(a.d - half) - Math.abs(b.d - half));
    let placed = 0;
    for (const c of mid) {
      if (placed >= CANDLE_COUNT) break;
      const i = idx(c.x, c.y, this.w);
      if (!this.dots[i]) continue;
      if (this.ghosts.some((g) => g.x === c.x && g.y === c.y)) continue;
      this.candles[i] = true;
      this.dots[i] = false;
      placed += 1;
    }
    this.dotsLeft = this.dots.filter(Boolean).length + this.candles.filter(Boolean).length;
    this.dotsTotal = this.dotsLeft;
    this.wispWait = CHASE_WISP_DELAY;
    this.initial = this.capture();
  }

  private capture(): ChasePuzzle {
    return {
      grid: this.grid.slice(),
      dots: this.dots.slice(),
      candles: this.candles.slice(),
      dotsLeft: this.dotsLeft,
      dotsTotal: this.dotsTotal,
      player: { ...this.player },
      ghosts: this.ghosts.map((g) => ({ ...g })),
      wispWait: this.wispWait,
    };
  }

  static fromPuzzle(p: ChasePuzzle): ChaseGame { return new ChaseGame(1, p.ghosts.length, p); }
  puzzle(): ChasePuzzle {
    const p = this.initial;
    return {
      grid: p.grid.slice(),
      dots: p.dots.slice(),
      candles: p.candles.slice(),
      dotsLeft: p.dotsTotal,
      dotsTotal: p.dotsTotal,
      player: { ...p.player },
      ghosts: p.ghosts.map((g) => ({ ...g })),
      wispWait: p.wispWait,
    };
  }

  state(): ChaseState {
    return {
      grid: this.grid.slice(),
      w: this.w,
      h: this.h,
      dots: this.dots.slice(),
      candles: this.candles.slice(),
      dotsLeft: this.dotsLeft,
      dotsTotal: this.dotsTotal,
      player: { ...this.player },
      ghosts: this.ghosts.map((g) => ({ ...g })),
      status: this.result,
      survived: this.survived,
      frightened: this.frightened,
    };
  }
  status(): 'playing' | 'won' | 'lost' { return this.result; }

  input(action: MinigameInput): void {
    if (this.result !== 'playing') return;
    if (action.type === 'move') {
      const dx = Math.sign(action.dx), dy = Math.sign(action.dy);
      if (dx && dy) this.queued = { dx, dy: 0 };
      else if (dx || dy) this.queued = { dx, dy };
    } else if (action.type === 'tap' && action.col != null && action.row != null) {
      const dx = Math.sign(action.col - this.player.x);
      const dy = Math.sign(action.row - this.player.y);
      if (dx && !dy) this.queued = { dx, dy: 0 };
      else if (dy && !dx) this.queued = { dx: 0, dy };
      else if (dx && dy) this.queued = { dx, dy: 0 };
    }
  }

  tick(dt: number): void {
    if (this.result !== 'playing') return;
    this.survived += dt;
    if (this.frightened > 0) this.frightened = Math.max(0, this.frightened - dt);
    this.advance(this.player, CHASE_SPEED, dt, true);
    if (this.wispWait > 0) this.wispWait = Math.max(0, this.wispWait - dt);
    for (const g of this.ghosts) {
      if (g.dead > 0) {
        g.dead = Math.max(0, g.dead - dt);
        if (g.dead === 0) this.respawn(g);
      }
    }
    if (this.wispWait > 0) {
      this.eat();
      this.resolveTouches();
      if (this.dotsLeft <= 0 && this.result === 'playing') this.result = 'won';
      return;
    }
    this.ghostThink -= dt;
    if (this.ghostThink <= 0) {
      this.ghostThink = 0.35;
      const { ex, ey, sx, sy } = mazePorts(this.w, this.h);
      for (const g of this.ghosts) {
        if (g.dead > 0) continue;
        if (this.frightened > 0) {
          const [dx, dy] = stepToward(this.grid, g.x, g.y, ex, ey, this.w, this.h, this.rng);
          // If already at the far corner, wander.
          g.dx = dx; g.dy = dy;
          if (!dx && !dy) {
            const opts = neighbors(this.grid, g.x, g.y, this.w, this.h);
            const pick = opts[randInt(this.rng, 0, Math.max(0, opts.length - 1))] ?? [0, 0];
            g.dx = pick[0]; g.dy = pick[1];
          }
        } else {
          const chase = this.rng() > 0.25;
          const [dx, dy] = chase
            ? stepToward(this.grid, g.x, g.y, this.player.x, this.player.y, this.w, this.h, this.rng)
            : (neighbors(this.grid, g.x, g.y, this.w, this.h)[randInt(this.rng, 0, Math.max(0, neighbors(this.grid, g.x, g.y, this.w, this.h).length - 1))] ?? [0, 0]);
          g.dx = dx;
          g.dy = dy;
        }
        void sx; void sy;
      }
    }
    for (const g of this.ghosts) {
      if (g.dead > 0) continue;
      this.advance(g, this.frightened > 0 ? CHASE_WISP_SPEED * 0.7 : CHASE_WISP_SPEED, dt, false);
    }
    this.eat();
    this.resolveTouches();
    if (this.dotsLeft <= 0 && this.result === 'playing') this.result = 'won';
  }

  /** Survive-the-timer win (the overlay calls this when the 30 s clock hits 0 and the player is alive). */
  surviveWin(): void {
    if (this.result === 'playing') this.result = 'won';
  }

  private advance(a: Actor, speed: number, dt: number, isPlayer: boolean): void {
    if (!a.dx && !a.dy) {
      const q = isPlayer ? this.queued : { dx: a.dx, dy: a.dy };
      if (q.dx || q.dy) {
        if (mazeWalkable(this.grid, a.x + q.dx, a.y + q.dy, this.w, this.h)) {
          a.dx = q.dx; a.dy = q.dy;
        }
      }
    }
    if (isPlayer && (this.queued.dx || this.queued.dy)) {
      if (a.fx === 0 && a.fy === 0 && mazeWalkable(this.grid, a.x + this.queued.dx, a.y + this.queued.dy, this.w, this.h)) {
        a.dx = this.queued.dx;
        a.dy = this.queued.dy;
      }
    }
    if (!a.dx && !a.dy) return;
    const step = speed * dt;
    a.fx += a.dx * step;
    a.fy += a.dy * step;
    while (Math.abs(a.fx) >= 1 || Math.abs(a.fy) >= 1) {
      const sx = Math.sign(a.fx), sy = Math.sign(a.fy);
      const nx = a.x + (Math.abs(a.fx) >= 1 ? sx : 0);
      const ny = a.y + (Math.abs(a.fy) >= 1 ? sy : 0);
      if (!mazeWalkable(this.grid, nx, ny, this.w, this.h)) {
        a.fx = 0; a.fy = 0; a.dx = 0; a.dy = 0;
        break;
      }
      if (Math.abs(a.fx) >= 1) { a.x = nx; a.fx -= sx; }
      if (Math.abs(a.fy) >= 1) { a.y = ny; a.fy -= sy; }
      if (isPlayer) this.eatAt(a.x, a.y);
      if (isPlayer && (this.queued.dx || this.queued.dy) && mazeWalkable(this.grid, a.x + this.queued.dx, a.y + this.queued.dy, this.w, this.h)) {
        a.dx = this.queued.dx;
        a.dy = this.queued.dy;
      } else if (!mazeWalkable(this.grid, a.x + a.dx, a.y + a.dy, this.w, this.h)) {
        a.dx = 0; a.dy = 0; a.fx = 0; a.fy = 0;
      }
    }
  }

  private eatAt(x: number, y: number): void {
    const i = idx(x, y, this.w);
    if (this.dots[i]) { this.dots[i] = false; this.dotsLeft -= 1; }
    if (this.candles[i]) {
      this.candles[i] = false;
      this.dotsLeft -= 1;
      this.frightened = FRIGHTENED_SECONDS;
    }
  }
  private eat(): void { this.eatAt(this.player.x, this.player.y); }

  private resolveTouches(): void {
    const px = this.player.x + this.player.fx, py = this.player.y + this.player.fy;
    for (const g of this.ghosts) {
      if (g.dead > 0) continue;
      const gx = g.x + g.fx, gy = g.y + g.fy;
      if (Math.hypot(px - gx, py - gy) >= 0.55) continue;
      if (this.frightened > 0) {
        g.dead = 4;
        g.fx = 0; g.fy = 0; g.dx = 0; g.dy = 0;
      } else {
        this.result = 'lost';
        return;
      }
    }
  }

  private respawn(g: Wisp): void {
    const { ex, ey } = mazePorts(this.w, this.h);
    g.x = ex; g.y = ey; g.fx = 0; g.fy = 0; g.dx = 0; g.dy = 0;
  }

  /** Eat every remaining spark and candle via a walk (tests). Wisps are ignored. */
  solve(): void {
    const leftover: [number, number][] = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const i = idx(x, y, this.w);
      if (this.dots[i] || this.candles[i]) leftover.push([x, y]);
    }
    for (const [tx, ty] of leftover) {
      const path = mazePath(this.grid, this.player.x, this.player.y, tx, ty, this.w, this.h);
      for (let i = 1; i < path.length; i++) {
        const [x, y] = path[i]!;
        this.player.x = x;
        this.player.y = y;
        this.player.fx = 0;
        this.player.fy = 0;
        this.eatAt(x, y);
      }
    }
    this.player.dx = 0;
    this.player.dy = 0;
    if (this.dotsLeft <= 0 && this.result === 'playing') this.result = 'won';
  }
}

/** Neighbour that maximises the minimum path-distance to every living wisp, never stepping closer if a safer step exists. */
export function fleeChaseStep(
  grid: number[], px: number, py: number, wisps: { x: number; y: number }[], w: number, h: number,
): [number, number] {
  const opts = neighbors(grid, px, py, w, h);
  if (!opts.length) return [0, 0];
  const minDist = (x: number, y: number): number => {
    if (!wisps.length) return 99;
    let best = 99;
    for (const g of wisps) {
      const path = mazePath(grid, x, y, g.x, g.y, w, h);
      const d = path.length ? path.length - 1 : 99;
      if (d < best) best = d;
    }
    return best;
  };
  const here = minDist(px, py);
  const scored = opts.map(([dx, dy]) => ({ dx, dy, d: minDist(px + dx, py + dy) }));
  const safe = scored.filter((s) => s.d >= here);
  const pool = (safe.length ? safe : scored).slice().sort((a, b) => b.d - a.d);
  return [pool[0]!.dx, pool[0]!.dy];
}

/** Run a flee-only bot for `seconds`. Returns whether it survived (or ate every spark). */
export function runFleeChase(seed: number, seconds = 30, dt = 1 / 30): { won: boolean; survived: number; status: 'playing' | 'won' | 'lost' } {
  const game = new ChaseGame(seed);
  const steps = Math.ceil(seconds / dt);
  for (let i = 0; i < steps; i++) {
    if (game.status() !== 'playing') break;
    const st = game.state();
    const wisps = st.ghosts.filter((g) => g.dead <= 0);
    const [dx, dy] = fleeChaseStep(st.grid, st.player.x, st.player.y, wisps, st.w, st.h);
    if (dx || dy) game.input({ type: 'move', dx, dy });
    game.tick(dt);
  }
  if (game.status() === 'playing') game.surviveWin();
  const st = game.state();
  return { won: st.status === 'won', survived: st.survived, status: st.status };
}

/** @deprecated name; Chase is the canonical class. */
export { ChaseGame as DotDashGame };
