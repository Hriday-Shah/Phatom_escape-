export { MINIGAME_IDS, MINIGAME_TITLES, MINIGAME_SECONDS, MINIGAME_ALIASES, resolveMinigameId } from './types';
export type { MinigameId, MinigameStatus, MinigameInput, MinigameEngine } from './types';
export { selectMinigame, minigameSeed } from './select';
export { SlideGame, isSolvable, isSolved, inversions, makeSolvableBoard, solvingMoves, slideAt, slideDir, slideDirBlank, SLIDE_SHUFFLE_MIN, SLIDE_SHUFFLE_MAX } from './slide';
export type { SlideState } from './slide';
export { MazeGame, generateMaze, mazePath, mazeWalkable, mazePorts, mazeDeadEnds, punchDeadEndLoops, MAZE_W, MAZE_H } from './maze';
export type { MazeState } from './maze';
export { LockPickGame, pickAt, markerAt, inZone, turnDelta, LOCK_HITS_NEEDED, ZONE_DEG } from './lockpick';
export type { LockPickState } from './lockpick';
export { MemoryGame, MEMORY_PAIRS, MEMORY_CARDS, MEMORY_FACES } from './memory';
export type { MemoryState } from './memory';
export { ChaseGame, ChaseGame as DotDashGame, DOTDASH_W, DOTDASH_H, CHASE_W, CHASE_H, wallAutotile, fleeChaseStep, runFleeChase, CHASE_WISP_COUNT, CHASE_WISP_DELAY, CHASE_WISP_SPEED, PLAY_WISP_KINDS } from './dotdash';
export type { DotDashState, ChaseState } from './dotdash';

import { ChaseGame } from './dotdash';
import { LockPickGame } from './lockpick';
import { MazeGame } from './maze';
import { MemoryGame } from './memory';
import { SlideGame } from './slide';
import { MinigameEngine, resolveMinigameId } from './types';

export function createMinigame(id: string, seed: number): MinigameEngine {
  const resolved = resolveMinigameId(id) ?? 'slide';
  switch (resolved) {
    case 'slide': return new SlideGame(seed);
    case 'maze': return new MazeGame(seed);
    case 'lockpick': return new LockPickGame(seed);
    case 'memory': return new MemoryGame(seed);
    case 'chase': return new ChaseGame(seed);
  }
}
