// Placeholder for shared types between client and server
// Will be used in Stage 2 for networking

export interface PlayerState {
  id: string;
  x: number;
  y: number;
  rotation: number;
}

export interface GameState {
  players: Map<string, PlayerState>;
}
