export const MINIGAME_IDS = ['slide', 'maze', 'lockpick', 'memory', 'chase'] as const;
export type MinigameId = (typeof MINIGAME_IDS)[number];

/** Debug / legacy aliases that resolve to a canonical id. */
export const MINIGAME_ALIASES: Record<string, MinigameId> = {
  slide: 'slide',
  maze: 'maze',
  lockpick: 'lockpick',
  lock: 'lockpick',
  memory: 'memory',
  chase: 'chase',
  dotdash: 'chase',
};

export function resolveMinigameId(name: string | null | undefined): MinigameId | null {
  if (!name) return null;
  return MINIGAME_ALIASES[name] ?? null;
}

export const MINIGAME_TITLES: Record<MinigameId, string> = {
  slide: 'Slide',
  maze: 'Maze',
  lockpick: 'Lock',
  memory: 'Memory',
  chase: 'Chase',
};

export const MINIGAME_SECONDS = 30;

export type MinigameStatus = 'playing' | 'won' | 'lost';

export type MinigameInput =
  | { type: 'move'; dx: number; dy: number }
  | { type: 'confirm' }
  | { type: 'tap'; x?: number; y?: number; col?: number; row?: number; index?: number };

export interface MinigameEngine<S = unknown> {
  readonly id: MinigameId;
  state(): S;
  status(): MinigameStatus;
  input(action: MinigameInput): void;
  /** Advance time-based games (lock pick, Chase). `dt` in seconds. */
  tick?(dt: number): void;
  /** Legal, deterministic auto-solve for tests (does not skip the win path). */
  solve(): void;
}
