/**
 * QA R8 timers: timed HUD messages expire on real elapsed time, not the Phaser clock.
 */
import { RealDeadline } from '../logic/realTimer';

export function runRealTimerTest(): void {
  console.log('\n=== REAL TIMER TEST (R8) ===');
  let t = 1000;
  const d = new RealDeadline(() => t);
  const errors: string[] = [];
  if (d.due() || d.pending) errors.push('unarmed deadline fired');
  d.set(2000);
  t += 1999;
  if (d.due()) errors.push('fired early');
  t += 1;
  if (!d.due()) errors.push('did not fire at 2000 ms');
  if (d.due()) errors.push('fired twice');
  // Re-arming replaces the old deadline (a newer message is never blanked by an older one).
  d.set(2000); t += 1500; d.set(2000); t += 1000;
  if (d.due()) errors.push('stale deadline fired after re-arm');
  t += 1000;
  if (!d.due()) errors.push('re-armed deadline did not fire');
  d.set(2000); d.clear(); t += 5000;
  if (d.due()) errors.push('cleared deadline fired');
  // A starved frame loop (one poll after 3 s) still fires on that first poll.
  d.set(2000); t += 3000;
  if (!d.due()) errors.push('did not fire on the first poll after a long stall');
  if (errors.length) { errors.forEach((e) => console.log('✗ ' + e)); throw new Error('Real timer test failed'); }
  console.log('✓ fires once at the deadline, never early; re-arm/clear cancel the old one; fires on the first poll after a stall');
  console.log('✅ REAL TIMER TEST PASSED');
}
