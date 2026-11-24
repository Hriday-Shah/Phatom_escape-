import { Rng, mulberry32 } from '../seededRng';
import { MinigameEngine, MinigameInput, MinigameStatus } from './types';

/** 3x3 sliding puzzle. `tiles[i]` is 1..8, or 0 for the blank. Always solvable. */
export interface SlideState {
  tiles: number[];
  blank: number;
}

export function inversions(tiles: number[]): number {
  let n = 0;
  const vals = tiles.filter((t) => t !== 0);
  for (let i = 0; i < vals.length; i++) {
    for (let j = i + 1; j < vals.length; j++) if (vals[i]! > vals[j]!) n++;
  }
  return n;
}

export function isSolved(tiles: number[]): boolean {
  for (let i = 0; i < 8; i++) if (tiles[i] !== i + 1) return false;
  return tiles[8] === 0;
}

/** Even permutations are solvable on a 3x3 (blank ignored in the inversion count). */
export function isSolvable(tiles: number[]): boolean {
  return inversions(tiles) % 2 === 0;
}

/** Inclusive range of optimal (shortest) moves used when shuffling a start board. */
export const SLIDE_SHUFFLE_MIN = 10;
export const SLIDE_SHUFFLE_MAX = 14;

let boardsAtDepth: number[][][] | null = null;

/** BFS from the solved board; `at[d]` is every position whose shortest path is d moves. */
function boardsByDepth(maxMoves: number): number[][][] {
  if (boardsAtDepth && boardsAtDepth.length > maxMoves) return boardsAtDepth;
  const solved = [1, 2, 3, 4, 5, 6, 7, 8, 0];
  const at: number[][][] = Array.from({ length: maxMoves + 1 }, () => []);
  const seen = new Set<string>([solved.join(',')]);
  const q: { t: number[]; d: number }[] = [{ t: solved, d: 0 }];
  at[0]!.push(solved);
  for (let i = 0; i < q.length; i++) {
    const { t, d } = q[i]!;
    if (d >= maxMoves) continue;
    const blank = t.indexOf(0);
    for (const n of neighbors(blank)) {
      const next = t.slice();
      [next[blank], next[n]] = [next[n]!, next[blank]!];
      const k = next.join(',');
      if (seen.has(k)) continue;
      seen.add(k);
      at[d + 1]!.push(next);
      q.push({ t: next, d: d + 1 });
    }
  }
  boardsAtDepth = at;
  return at;
}

/**
 * A 3×3 8-puzzle shuffled so the shortest solution is 10–14 moves.
 * Picks uniformly from the exact-depth BFS layer, so every length in range appears.
 */
export function makeSolvableBoard(rng: Rng, minMoves = SLIDE_SHUFFLE_MIN, maxMoves = SLIDE_SHUFFLE_MAX): number[] {
  const at = boardsByDepth(maxMoves);
  const depth = minMoves + Math.floor(rng() * (maxMoves - minMoves + 1));
  const pool = at[depth] ?? [];
  if (!pool.length) return [2, 3, 6, 1, 5, 8, 4, 7, 0];
  return pool[Math.floor(rng() * pool.length)]!.slice();
}

function neighbors(blank: number): number[] {
  const c = blank % 3, r = Math.floor(blank / 3);
  const out: number[] = [];
  if (c > 0) out.push(blank - 1);
  if (c < 2) out.push(blank + 1);
  if (r > 0) out.push(blank - 3);
  if (r < 2) out.push(blank + 3);
  return out;
}

/** Slide the numbered tile at `index` into the blank if they are neighbours. */
export function slideAt(tiles: number[], index: number): number[] | null {
  const blank = tiles.indexOf(0);
  if (!neighbors(blank).includes(index)) return null;
  const next = tiles.slice();
  [next[blank], next[index]] = [next[index]!, next[blank]!];
  return next;
}

/**
 * Move the numbered TILE in direction (dx, dy) into the gap.
 * ArrowRight slides the tile to the left of the gap to the right (the blank
 * moves left). This is the reverse of the earlier "move the blank" controls.
 */
export function slideDir(tiles: number[], dx: number, dy: number): number[] | null {
  const sx = Math.sign(dx), sy = Math.sign(dy);
  if ((sx && sy) || (!sx && !sy)) return null; // no diagonals / no-ops
  // The tile that will move into the gap sits opposite the intended direction.
  return slideDirBlank(tiles, -sx, -sy);
}

/** Move the blank in direction (dx, dy). Used internally and by tests that want the blank. */
export function slideDirBlank(tiles: number[], dx: number, dy: number): number[] | null {
  const blank = tiles.indexOf(0);
  const c = blank % 3 + Math.sign(dx);
  const r = Math.floor(blank / 3) + Math.sign(dy);
  if (c < 0 || c > 2 || r < 0 || r > 2) return null;
  if (Math.sign(dx) && Math.sign(dy)) return null;
  if (!dx && !dy) return null;
  return slideAt(tiles, r * 3 + c);
}

/** Shortest path of tile indices to slide, from this board to solved (BFS). */
export function solvingMoves(tiles: number[]): number[] {
  const start = tiles.join(',');
  const goal = '1,2,3,4,5,6,7,8,0';
  if (start === goal) return [];
  const q: number[][] = [tiles.slice()];
  // key -> [parentKey, tileIndex slid]
  const prev = new Map<string, [string, number]>();
  prev.set(start, [start, -1]);
  for (let qi = 0; qi < q.length; qi++) {
    const t = q[qi]!;
    const key = t.join(',');
    const blank = t.indexOf(0);
    for (const i of neighbors(blank)) {
      const n = t.slice();
      [n[blank], n[i]] = [n[i]!, n[blank]!];
      const nk = n.join(',');
      if (prev.has(nk)) continue;
      prev.set(nk, [key, i]);
      if (nk === goal) {
        const path: number[] = [];
        let c = nk;
        while (c !== start) {
          const [p, slide] = prev.get(c)!;
          path.push(slide);
          c = p;
        }
        path.reverse();
        return path;
      }
      q.push(n);
    }
  }
  return [];
}

export class SlideGame implements MinigameEngine<SlideState> {
  readonly id = 'slide' as const;
  private tiles: number[];
  private won = false;

  constructor(seed = 1) {
    this.tiles = makeSolvableBoard(mulberry32(seed >>> 0));
  }

  state(): SlideState { return { tiles: this.tiles.slice(), blank: this.tiles.indexOf(0) }; }
  status(): MinigameStatus { return this.won || isSolved(this.tiles) ? 'won' : 'playing'; }

  input(action: MinigameInput): void {
    if (this.status() !== 'playing') return;
    let next: number[] | null = null;
    if (action.type === 'tap' && action.index != null) next = slideAt(this.tiles, action.index);
    else if (action.type === 'tap' && action.col != null && action.row != null) {
      next = slideAt(this.tiles, action.row * 3 + action.col);
    } else if (action.type === 'move') next = slideDir(this.tiles, action.dx, action.dy);
    if (next) {
      this.tiles = next;
      if (isSolved(this.tiles)) this.won = true;
    }
  }

  solve(): void {
    for (const i of solvingMoves(this.tiles)) this.input({ type: 'tap', index: i });
  }
}
