import { mulberry32 } from '../seededRng';
import { MinigameEngine, MinigameInput, MinigameStatus } from './types';

export const LOCK_HITS_NEEDED = 3;
/** Target zone is a 30° arc centred on `zone` (0 = up). */
export const ZONE_DEG = 30;

export interface LockPickState {
  /** Pick angle in turns, 0 = up, increasing clockwise. */
  pick: number;
  /** Zone centre in turns, 0 = up. */
  zone: number;
  hits: number;
  needed: number;
  lastHit: boolean | null;
  flash: 'success' | 'fail' | null;
}

/** Continuous clockwise spin, 0..1 turns. `speed` is turns per second. */
export function pickAt(tSec: number, speed = 0.65): number {
  const v = tSec * speed;
  return v - Math.floor(v);
}

/** @deprecated alias of pickAt (kept so older tests can be updated in one pass). */
export const markerAt = pickAt;

/** Shortest circular distance in turns, 0..0.5. */
export function turnDelta(a: number, b: number): number {
  let d = Math.abs(a - b) % 1;
  if (d > 0.5) d = 1 - d;
  return d;
}

export function inZone(pick: number, zone: number, widthDeg = ZONE_DEG): boolean {
  return turnDelta(pick, zone) <= widthDeg / 720;
}

export class LockPickGame implements MinigameEngine<LockPickState> {
  readonly id = 'lockpick' as const;
  private t = 0;
  private speed: number;
  private zone = 0;
  private hits = 0;
  private lastHit: boolean | null = null;
  private flash: 'success' | 'fail' | null = null;
  private won = false;
  private rng: () => number;

  constructor(seed = 1) {
    this.rng = mulberry32(seed >>> 0);
    this.speed = 0.55 + this.rng() * 0.25;
    this.placeZone();
  }

  private placeZone(): void {
    this.zone = this.rng();
  }

  private pick(): number { return pickAt(this.t, this.speed); }

  state(): LockPickState {
    return {
      pick: this.pick(),
      zone: this.zone,
      hits: this.hits,
      needed: LOCK_HITS_NEEDED,
      lastHit: this.lastHit,
      flash: this.flash,
    };
  }
  status(): MinigameStatus { return this.won || this.hits >= LOCK_HITS_NEEDED ? 'won' : 'playing'; }

  tick(dt: number): void {
    if (this.status() !== 'playing') return;
    this.t += dt;
  }

  input(action: MinigameInput): void {
    if (this.status() !== 'playing') return;
    if (action.type !== 'confirm' && action.type !== 'tap') return;
    const hit = inZone(this.pick(), this.zone);
    this.lastHit = hit;
    this.flash = hit ? 'success' : 'fail';
    if (hit) {
      this.hits += 1;
      if (this.hits >= LOCK_HITS_NEEDED) this.won = true;
      else this.placeZone();
    } else {
      // A miss resets progress so the lock cannot be won by blind mashing (R14-7).
      this.hits = 0;
    }
  }

  clearFlash(): void { this.flash = null; }

  /** For tests: park the pick on the zone centre, then confirm. */
  forceInZone(): void {
    this.t = this.zone / this.speed;
  }

  solve(): void {
    while (this.status() === 'playing') {
      this.forceInZone();
      this.input({ type: 'confirm' });
    }
  }
}
