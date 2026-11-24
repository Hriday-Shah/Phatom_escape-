import { hashSeed, mulberry32 } from '../seededRng';
import { MINIGAME_IDS, MinigameId } from './types';

/** Same seed (room code + round) always picks the same mini-game. */
export function selectMinigame(seed: string | number, round = 1): MinigameId {
  const n = typeof seed === 'number' ? (seed >>> 0) : hashSeed(`${seed}#${round}`);
  const rng = mulberry32(n ^ Math.imul(round, 0x9E3779B9));
  return MINIGAME_IDS[Math.floor(rng() * MINIGAME_IDS.length)]!;
}

export function minigameSeed(seed: string | number, round = 1): number {
  const n = typeof seed === 'number' ? (seed >>> 0) : hashSeed(`${seed}#${round}`);
  return (n ^ Math.imul(round + 1, 0x85EBCA6B)) >>> 0;
}
