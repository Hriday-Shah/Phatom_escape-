/**
 * UI deadlines on REAL elapsed time (QA R8 timers).
 *
 * Phaser's clock (scene.time / delayedCall) advances by the game loop's smoothed delta, which
 * undercounts badly when the browser is starved of CPU: a 2000 ms delayedCall had run only
 * ~770 ms after 3 s of wall time on a busy box, so 'Empty' stayed up far too long. Timed HUD
 * messages therefore use performance.now() and are polled once per frame.
 */
export type Clock = () => number;

export const realNow: Clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class RealDeadline {
  private at: number | null = null;

  constructor(private readonly clock: Clock = realNow) {}

  /** Arm (or re-arm, replacing any pending deadline) `ms` from now. */
  set(ms: number): void {
    this.at = this.clock() + ms;
  }

  clear(): void {
    this.at = null;
  }

  get pending(): boolean {
    return this.at !== null;
  }

  /** Remaining ms, or null when not armed. */
  remaining(): number | null {
    return this.at === null ? null : Math.max(0, this.at - this.clock());
  }

  /** True exactly once, on the first poll at or after the deadline (then disarms). */
  due(): boolean {
    if (this.at === null || this.clock() < this.at) return false;
    this.at = null;
    return true;
  }
}
