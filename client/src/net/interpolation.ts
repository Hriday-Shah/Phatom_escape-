/**
 * Remote pose buffer: poses arrive ~12 times a second. The player is drawn at
 * `now - delay`. The game passes delay 0 so both phones show the newest server pose.
 * A positive delay still interpolates between the two samples around that time. Pure, unit-tested.
 */
/** Longer than this between poses = a pause. */
export const GAP_MS = 300;
const STEP_MS = 1000 / 12;

export interface Sample { t: number; x: number; y: number; d: number; m: number }

export class PoseBuffer {
  private s: Sample[] = [];
  constructor(private delayMs: number, private max = 30) {}

  push(sample: Sample): void {
    // Out-of-order / duplicate times are dropped.
    const last = this.s[this.s.length - 1];
    if (last && sample.t <= last.t) return;
    // After a pause (nothing sent while standing still) start the move from where it stood
    // one step ago, not from the old pose's time (that would crawl across the whole gap).
    if (last && sample.t - last.t > GAP_MS) this.s.push({ ...last, t: sample.t - STEP_MS, m: 0 });
    this.s.push(sample);
    if (this.s.length > this.max) this.s.shift();
  }

  get size(): number { return this.s.length; }
  latest(): Sample | undefined { return this.s[this.s.length - 1]; }

  /** The pose at render time `now - delay` (clamped to the oldest / newest sample). */
  sample(now: number): Sample | null {
    if (!this.s.length) return null;
    const t = now - this.delayMs;
    while (this.s.length > 2 && this.s[1].t <= t) this.s.shift();
    const a = this.s[0], b = this.s[1];
    if (!b || t <= a.t) return { ...a, t };
    if (t >= b.t) return { ...b, t };
    const k = (t - a.t) / (b.t - a.t);
    return { t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, d: k < 0.5 ? a.d : b.d, m: a.m || b.m };
  }
}
