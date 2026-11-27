/**
 * Hiding, search, and chase. The server owns the clock and the roles; phones only
 * display the phase name and the time left from a server timestamp (performance.now,
 * not frame counts).
 */
import type { DrawerNoise } from '../lobby/lobby';

export type RoundPhase = 'hiding' | 'search' | 'chase' | 'ended';
export type RoundRole = 'phantom' | 'player';

export const PHASE_LABEL: Record<RoundPhase, string> = {
  hiding: 'Hiding',
  search: 'Search',
  chase: 'Chase',
  ended: 'Time is up — the Phantom wins.',
};

export function minutesToMs(minutes: number): number {
  return minutes * 60 * 1000;
}

/** Phantoms move while they hide and once they are let in. Players move from search on. */
export function canMove(role: RoundRole, phase: RoundPhase): boolean {
  if (phase === 'hiding') return role === 'phantom';
  if (phase === 'search') return role === 'player';
  if (phase === 'chase') return true;
  return false;
}

/** Players open spots while they search. The Phantom may open spots only while hiding. */
export function canOpenSpot(role: RoundRole, phase: RoundPhase): boolean {
  if (phase === 'hiding') return role === 'phantom';
  if (phase === 'search' || phase === 'chase') return role === 'player';
  return false;
}

/** Search: the Phantom is outside and must not see the house. */
export function canSeeInside(role: RoundRole, phase: RoundPhase): boolean {
  if (phase === 'hiding') return role === 'phantom';
  if (phase === 'search') return role === 'player';
  return true; // chase, and the time-up screen, keep the house on screen
}

/** Non-Phantoms sit in the waiting room until hiding ends. */
export function isWaiting(role: RoundRole, phase: RoundPhase): boolean {
  return phase === 'hiding' && role === 'player';
}

export function bodyTextureKey(role: RoundRole): 'player' | 'phantom' {
  return role === 'phantom' ? 'phantom' : 'player';
}

export function walkAnimKey(role: RoundRole, dir: string): string {
  return role === 'phantom' ? `phantom_walk_${dir}` : `walk_${dir}`;
}

/**
 * Pick `count` ids without replacement. `rng` returns a number in [0, 1).
 * A rng that always returns 0 keeps join order (the first ids).
 */
export function pickPhantoms(ids: readonly string[], count: number, rng: () => number): string[] {
  const pool = [...ids];
  const n = Math.max(0, Math.min(Math.floor(count), pool.length));
  const picked: string[] = [];
  for (let i = 0; i < n; i++) {
    const span = pool.length - i;
    const roll = rng();
    const offset = Number.isFinite(roll) ? Math.floor(Math.min(0.999999, Math.max(0, roll)) * span) : 0;
    const j = i + offset;
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
    picked.push(pool[i]!);
  }
  return picked;
}

/** How big a drawer ripple is on a Phantom phone. `off` has no ripple. */
export interface RippleSpec { radius: number; alpha: number; ms: number }

export function rippleFor(level: Exclude<DrawerNoise, 'off'>): RippleSpec {
  if (level === 'quiet') return { radius: 72, alpha: 0.55, ms: 800 };
  if (level === 'loud') return { radius: 220, alpha: 0.92, ms: 1600 };
  return { radius: 130, alpha: 0.75, ms: 1100 };
}

/**
 * Milliseconds left. `endsAt` and `serverNow` are server epoch ms. `receivedAt` and
 * `now` are the same clock (performance.now on a phone).
 */
export function phaseRemainingMs(endsAt: number, serverNow: number, receivedAt: number, now: number): number {
  const serverTime = serverNow + (now - receivedAt);
  return Math.max(0, endsAt - serverTime);
}

/** `m:ss` from milliseconds left. A fresh minute still reads as that minute. */
export function formatPhaseClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000 - 1e-9));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
