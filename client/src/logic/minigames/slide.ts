import { Rng, mulberry32, shuffle } from '../seededRng';
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

export function makeSolvableBoard(rng: Rng): number[] {
  let tiles = shuffle(rng, [1, 2, 3, 4, 5, 6, 7, 8, 0]);
  if (!isSolvable(tiles)) {
    // Swap two numbered tiles to flip the permutation's parity.
    const a = tiles.findIndex((t) => t === 1);
    const b = tiles.findIndex((t) => t === 2);
    [tiles[a], tiles[b]] = [tiles[b]!, tiles[a]!];
  }
  if (isSolved(tiles)) {
    // Don't start already solved: slide the blank left if possible, else right.
    const b = tiles.indexOf(0);
    const swap = b % 3 === 0 ? b + 1 : b - 1;
    [tiles[b], tiles[swap]] = [tiles[swap]!, tiles[b]!];
  }
  return tiles;
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

/** Move the blank in direction (dx, dy); dx/dy in -1..1. */
export function slideDir(tiles: number[], dx: number, dy: number): number[] | null {
  const blank = tiles.indexOf(0);
  const c = blank % 3 + Math.sign(dx);
  const r = Math.floor(blank / 3) + Math.sign(dy);
  if (c < 0 || c > 2 || r < 0 || r > 2) return null;
  if (Math.sign(dx) && Math.sign(dy)) return null; // no diagonals
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
