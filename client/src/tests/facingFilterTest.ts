/**
 * Facing filter (QA R10 M-D): a new direction only counts on its 3rd frame, so releasing a
 * diagonal's two keys a frame or two apart keeps the diagonal. The expected frame counts are
 * literals on purpose: changing HOLD_FRAMES must fail this test.
 */
import { FacingFilter } from '../logic/facingFilter';

export function runFacingFilterTest(): void {
  console.log('\n=== FACING FILTER TEST ===');
  const errors: string[] = [];
  const D = Math.SQRT1_2;
  const is = (f: FacingFilter, x: number, y: number) => Math.abs(f.facing.x - x) < 1e-9 && Math.abs(f.facing.y - y) < 1e-9;
  // Down -> right: unchanged on frames 1 and 2, right on frame 3.
  const f = new FacingFilter(); f.set(0, 1);
  for (let frame = 1; frame <= 4; frame++) {
    f.update({ x: 1, y: 0 });
    const want = frame >= 3;
    if (is(f, 1, 0) !== want) errors.push(`down->right: frame ${frame} facing (${f.facing.x},${f.facing.y}), want ${want ? 'right' : 'down'}`);
  }
  // Releasing a diagonal's keys 2 frames apart keeps the diagonal; 3 frames apart gives the axis.
  for (const [gap, keepsDiagonal] of [[1, true], [2, true], [3, false]] as const) {
    const g = new FacingFilter(); g.set(D, D);
    for (let i = 0; i < gap; i++) g.update({ x: 1, y: 0 }); // one key released, the other still held
    if (is(g, D, D) !== keepsDiagonal) errors.push(`diagonal release ${gap} frame(s) apart: ${keepsDiagonal ? 'lost' : 'kept'} the diagonal`);
  }
  // An interrupted change restarts the count.
  const h = new FacingFilter(); h.set(0, 1);
  h.update({ x: 1, y: 0 }); h.update({ x: 1, y: 0 }); h.update({ x: 0, y: -1 }); h.update({ x: 1, y: 0 }); h.update({ x: 1, y: 0 });
  if (!is(h, 0, 1)) errors.push('interrupted change counted early');
  h.update({ x: 1, y: 0 }); if (!is(h, 1, 0)) errors.push('restarted change not applied on its 3rd frame');
  if (FacingFilter.HOLD_FRAMES !== 3) errors.push(`HOLD_FRAMES is ${FacingFilter.HOLD_FRAMES}, the settle is 3 frames`);
  if (errors.length) { errors.forEach((e) => console.log('✗ ' + e)); throw new Error(`Facing filter test failed with ${errors.length} problem(s)`); }
  console.log('✓ new facing on the 3rd frame (not 1st/2nd); diagonal kept when keys release 1-2 frames apart, lost at 3; interrupted change restarts');
  console.log('✅ FACING FILTER TEST PASSED');
}
