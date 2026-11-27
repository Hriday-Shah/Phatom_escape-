/**
 * Remote pose buffer: poses arrive ~12 times a second. The player is drawn at
 * `now - delay`. The game passes delay 0 so both phones show the newest server pose.
 * A positive delay still interpolates between two close samples. A hole longer than
 * GAP_MS holds the last real pose until the next one arrives: it does not invent a
 * straight slide across the missing path. Pure, unit-tested.
 */
/** Longer than this between poses = a hole, not a step to lerp across. */
export const GAP_MS = 300;

export interface Sample { t: number; x: number; y: number; d: number; m: number; f: number }

export class PoseBuffer {
  private s: Sample[] = [];
  constructor(private delayMs: number, private max = 30) {}

  push(sample: Sample): void {
    const last = this.s[this.s.length - 1];
    if (last && sample.t < last.t) return;
    // A burst handled in one turn shares one clock reading. The socket is ordered,
    // so this arrival is the newer pose. Keeping the oldest froze the body on the
    // first sample of the burst (still standing by the foyer).
    if (last && sample.t === last.t) this.s.pop();
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
    if (!b || t <= a.t) return { ...a, t, f: a.f ?? 0 };
    if (t >= b.t) return { ...b, t, f: b.f ?? 0 };
    // The missing samples are gone. Holding beats crawling a chord through the house.
    if (b.t - a.t > GAP_MS) return { ...a, t, f: a.f ?? 0 };
    const k = (t - a.t) / (b.t - a.t);
    return {
      t,
      x: a.x + (b.x - a.x) * k,
      y: a.y + (b.y - a.y) * k,
      d: k < 0.5 ? a.d : b.d,
      m: a.m || b.m,
      f: k < 0.5 ? a.f : b.f,
    };
  }
}
