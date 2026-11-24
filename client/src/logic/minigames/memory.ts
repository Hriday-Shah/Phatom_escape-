import { mulberry32, shuffle } from '../seededRng';
import { MinigameEngine, MinigameInput, MinigameStatus } from './types';

export const MEMORY_PAIRS = 4;
export const MEMORY_CARDS = MEMORY_PAIRS * 2;
export const MEMORY_FACES = ['stun_gun', 'wire_cutter', 'room_key', 'battery'] as const;


export interface MemoryState {
  /** Pair id 0..3 for each of the 8 cards. */
  cards: number[];
  faceUp: boolean[];
  matched: boolean[];
  selected: number | null;
  locked: boolean;
  matches: number;
}

export class MemoryGame implements MinigameEngine<MemoryState> {
  readonly id = 'memory' as const;
  private cards: number[];
  private faceUp: boolean[];
  private matched: boolean[];
  private selected: number | null = null;
  /** When two unmatched cards are up, ignore input until flipBack() is called. */
  private pending: [number, number] | null = null;
  private won = false;
  /** Cursor for keyboard selection. */
  cursor = 0;

  constructor(seed = 1) {
    const rng = mulberry32(seed >>> 0);
    const ids: number[] = [];
    for (let i = 0; i < MEMORY_PAIRS; i++) ids.push(i, i);
    this.cards = shuffle(rng, ids);
    this.faceUp = Array(MEMORY_CARDS).fill(false);
    this.matched = Array(MEMORY_CARDS).fill(false);
  }

  state(): MemoryState {
    return {
      cards: this.cards.slice(),
      faceUp: this.faceUp.slice(),
      matched: this.matched.slice(),
      selected: this.selected,
      locked: !!this.pending,
      matches: this.matched.filter(Boolean).length / 2,
    };
  }
  status(): MinigameStatus {
    return this.won || this.matched.every(Boolean) ? 'won' : 'playing';
  }

  /** Call after a short delay when two unmatched cards are showing. */
  flipBack(): void {
    if (!this.pending) return;
    const [a, b] = this.pending;
    this.faceUp[a] = false;
    this.faceUp[b] = false;
    this.pending = null;
    this.selected = null;
  }

  private flip(i: number): void {
    if (i < 0 || i >= MEMORY_CARDS) return;
    if (this.pending || this.matched[i] || this.faceUp[i]) return;
    this.faceUp[i] = true;
    this.cursor = i;
    if (this.selected == null) { this.selected = i; return; }
    const a = this.selected;
    if (this.cards[a] === this.cards[i]) {
      this.matched[a] = this.matched[i] = true;
      this.selected = null;
      if (this.matched.every(Boolean)) this.won = true;
    } else {
      this.pending = [a, i];
      this.selected = null;
    }
  }

  input(action: MinigameInput): void {
    if (this.status() !== 'playing') return;
    if (action.type === 'tap' && action.index != null) this.flip(action.index);
    else if (action.type === 'move') {
      const col = this.cursor % 4, row = Math.floor(this.cursor / 4);
      const c = Math.max(0, Math.min(3, col + Math.sign(action.dx)));
      const r = Math.max(0, Math.min(1, row + Math.sign(action.dy)));
      this.cursor = r * 4 + c;
    } else if (action.type === 'confirm') this.flip(this.cursor);
  }

  solve(): void {
    this.flipBack();
    const first = new Map<number, number>();
    for (let i = 0; i < MEMORY_CARDS; i++) {
      if (this.matched[i]) continue;
      const id = this.cards[i]!;
      const a = first.get(id);
      if (a == null) { first.set(id, i); continue; }
      this.flip(a);
      this.flip(i);
    }
  }
}
