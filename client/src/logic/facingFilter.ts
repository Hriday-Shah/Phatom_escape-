/**
 * The player's facing (unit vector) from the movement input, pure so tests can drive it.
 *
 * A new direction only counts once held for HOLD_FRAMES, so letting go of two keys a frame
 * apart keeps the diagonal. Small changes (under SAME_DIR, ~11.5 deg) count as the same
 * direction for the hold, but the pending direction now TRACKS them (QA R9-2): before, it
 * kept the first one, so re-aiming the joystick in small steps never updated the facing and a
 * corner pick stuck well past its keep window. The facing is never shown directly (the sprite
 * picks its walk row from the move vector), so tracking small changes can't make it jitter.
 */
export class FacingFilter {
  static readonly HOLD_FRAMES = 3;
  static readonly SAME_DIR = 0.2;
  readonly facing = { x: 0, y: 1 };
  private pending = { x: 0, y: 1 };
  private frames = 0;

  /** Feed one frame's normalised movement direction (call only while moving). */
  update(dir: { x: number; y: number }): void {
    if (Math.hypot(this.pending.x - dir.x, this.pending.y - dir.y) < FacingFilter.SAME_DIR) this.frames++;
    else this.frames = 1;
    this.pending.x = dir.x; this.pending.y = dir.y;
    if (this.frames >= FacingFilter.HOLD_FRAMES) { this.facing.x = this.pending.x; this.facing.y = this.pending.y; }
  }

  /** Force a facing (spawn, tests). */
  set(x: number, y: number): void {
    this.facing.x = this.pending.x = x; this.facing.y = this.pending.y = y; this.frames = FacingFilter.HOLD_FRAMES;
  }
}
