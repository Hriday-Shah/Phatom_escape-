import { mulberry32 } from '../seededRng';
import { MinigameEngine, MinigameInput, MinigameStatus } from './types';

export const LOCK_HITS_NEEDED = 3;
/** Target window length in seconds; zone width is derived from pick speed (R15-7). */
export const HIT_WINDOW_S = 0.2;
/** After a miss, further presses are ignored for this long so mashing fails. */
export const LOCK_MISS_COOLDOWN_S = 0.45;
/** @deprecated default visual width at 0.65 turns/s; prefer zoneWidthDeg(speed). */
export const ZONE_DEG = HIT_WINDOW_S * 0.65 * 360;
export const LOCK_ZONE_PRESETS = 32;

/** Zone half-angle in degrees so the full window lasts HIT_WINDOW_S at `speed` turns/s. */
export function zoneWidthDeg(speed: number, windowS = HIT_WINDOW_S): number {
  return windowS * speed * 360;
}

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

export interface LockPuzzle {
  speed: number;
  zones: number[];
}

export class LockPickGame implements MinigameEngine<LockPickState> {
  readonly id = 'lockpick' as const;
  private t = 0;
  private speed: number;
  private zones: number[];
  private zoneIndex = 0;
  private zone = 0;
  private hits = 0;
  private lastHit: boolean | null = null;
  private flash: 'success' | 'fail' | null = null;
  private won = false;
  private cooldown = 0;
  private rng: () => number;

  constructor(seed = 1, puzzle?: LockPuzzle) {
    this.rng = mulberry32(seed >>> 0);
    if (puzzle) {
      this.speed = puzzle.speed;
      this.zones = puzzle.zones.slice();
    } else {
      this.speed = 0.55 + this.rng() * 0.25;
      this.zones = Array.from({ length: LOCK_ZONE_PRESETS }, () => this.rng());
    }
    this.placeZone();
  }

  static fromPuzzle(p: LockPuzzle): LockPickGame {
    return new LockPickGame(1, p);
  }

  puzzle(): LockPuzzle { return { speed: this.speed, zones: this.zones.slice() }; }

  widthDeg(): number { return zoneWidthDeg(this.speed); }

  private placeZone(): void {
    this.zone = this.zones[this.zoneIndex % this.zones.length] ?? this.rng();
    this.zoneIndex += 1;
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
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
  }

  input(action: MinigameInput): void {
    if (this.status() !== 'playing') return;
    if (action.type !== 'confirm' && action.type !== 'tap') return;
    if (this.cooldown > 0) return;
    const hit = inZone(this.pick(), this.zone, this.widthDeg());
    this.lastHit = hit;
    this.flash = hit ? 'success' : 'fail';
    if (hit) {
      this.hits += 1;
      if (this.hits >= LOCK_HITS_NEEDED) this.won = true;
      else this.placeZone();
    } else {
      // A miss costs one hit, then a cooldown so mashing still fails (R15-7).
      this.hits = Math.max(0, this.hits - 1);
      this.cooldown = LOCK_MISS_COOLDOWN_S;
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
