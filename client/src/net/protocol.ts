/**
 * Messages between the client and the game server (server/src/HouseRoom.ts). JSON payloads.
 * Pose tuple: [playerId, x, y, dir 0..3 (down, left, right, up), moving 0/1].
 */
export type PoseTuple = [string, number, number, number, number];
export const DIRS = ['down', 'left', 'right', 'up'] as const;
export type Dir = (typeof DIRS)[number];
export const dirIndex = (d: string): number => Math.max(0, DIRS.indexOf(d as Dir));

/** How often this client sends its position (the server broadcasts at 12 Hz too). */
export const SEND_HZ = 12;
/** Remote players are drawn this far in the past, interpolating between received poses. */
export const INTERP_DELAY_MS = 150;

/** Close / error codes from the server. */
export const CLOSE_KICKED = 4001;

export type JoinFailure = 'not-found' | 'full' | 'started' | 'unreachable' | 'unknown';
export const JOIN_FAILURE_TEXT: Record<JoinFailure, string> = {
  'not-found': 'No room with that code. Check the code, or ask the host for a new link.',
  full: 'That room is full (8 players).',
  started: 'That game has already started. Ask the host to start a new room.',
  unreachable: "Can't reach the game server. Check your connection or ask the host for a fresh link.",
  unknown: "Couldn't join the room. Please try again.",
};
