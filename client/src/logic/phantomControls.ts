import type { RoundPhase } from './roundPhase';

/** Phantom HUD: Place, Drop, Catch — enabled by phase. */
export function phantomButtonState(phase: RoundPhase | null): { place: boolean; drop: boolean; catch: boolean } {
  if (phase === 'hiding') return { place: true, drop: true, catch: false };
  if (phase === 'search') return { place: true, drop: true, catch: false };
  if (phase === 'chase') return { place: false, drop: false, catch: true };
  return { place: false, drop: false, catch: false };
}
