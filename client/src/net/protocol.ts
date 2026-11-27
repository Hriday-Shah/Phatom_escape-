/**
 * Messages between the client and the game server (server/src/HouseRoom.ts). JSON payloads.
 * Pose tuple: [playerId, x, y, dir 0..3 (down, left, right, up), moving 0/1, floor 0/1].
 * A `poses` message is the full set this phone may know, plus `drop` (ids only)
 * for bodies that left that set. Hidden x,y are not included.
 * `map` is bearings only: [playerId, sector 0..7]. No distance and no coordinates.
 */
export type PoseTuple = [string, number, number, number, number, number?];
/** Teammate bearing. Sector 0 is east. Never a coordinate. */
export type BearingTuple = [string, number];
export interface MapPayload { b: BearingTuple[] }
export interface PoseMessage { p: PoseTuple[]; drop?: string[] }
export const DIRS = ['down', 'left', 'right', 'up'] as const;
export type Dir = (typeof DIRS)[number];
export const dirIndex = (d: string): number => Math.max(0, DIRS.indexOf(d as Dir));

/** How often this client sends its position (the server broadcasts at 12 Hz too). */
export const SEND_HZ = 12;
/**
 * Remote players are drawn at the newest server pose. A delay here used to show them
 * a body-width behind, on a straight lerp that cut corners the walker had slid around.
 * PoseBuffer still interpolates when a caller passes a delay (the unit tests do).
 */
export const INTERP_DELAY_MS = 0;

/** Close / error codes from the server (4000 = closed by the server, e.g. shutdown). */
export const CLOSE_CONSENTED = 4000;
export const CLOSE_KICKED = 4001;
export const CLOSE_FLOOD = 4002;

/** The server holds a dropped player's seat this long (server RECONNECT_SECONDS default). */
export const RECONNECT_WINDOW_MS = 32_000; // the server keeps the seat 30 s (RECONNECT_SECONDS), plus a little slack
/** Time between reconnection attempts. */
export const RECONNECT_RETRY_MS = 2_000;

export type JoinFailure = 'not-found' | 'full' | 'started' | 'unreachable' | 'unknown';
export const JOIN_FAILURE_TEXT: Record<JoinFailure, string> = {
  'not-found': 'No room with that code. Check the code, or ask the host for a new link.',
  full: 'That room is full (8 players).',
  started: 'That game has already started. Ask the host to start a new room.',
  unreachable: "Can't reach the game server. Check your connection or ask the host for a fresh link.",
  unknown: "Couldn't join the room. Please try again.",
};

/** Client heartbeat ('hb', answered by the server) and the silence after which the link counts as dropped. */
export const HEARTBEAT_MS = 3000;
export const SILENCE_DROP_MS = 10000;
/** How long Create / Join wait for a sleeping free-tier server to wake (Render free: about a minute). */
export const WAKE_MAX_MS = 75000;
/** Shown while waiting for it. */
export const WAKING_TEXT = 'Waking up the game server… free hosting can take up to a minute.';

import type { RoundPhase, RoundRole } from '../logic/roundPhase';

/** Server phase clock. `endsAt` and `serverNow` are server epoch milliseconds. */
export interface PhasePayload {
  phase: RoundPhase;
  endsAt: number;
  serverNow: number;
  roles: { id: string; role: RoundRole }[];
  result?: 'phantom-wins';
  entries?: { id: string; x: number; y: number; f: number }[];
}

/** Drawer opened in search or chase. Phones that are not Phantoms never receive this. */
export interface NoisePayload {
  id: string;
  x: number;
  y: number;
  level: 'quiet' | 'normal' | 'loud';
}

/** Server-chosen mini-game and public item list for this round (no paper code). */
export type ItemPayload = {
  id: string; kind: string; variant?: string;
  spotId: string | null; x: number; y: number; f?: number; heldBy: string | null;
};
export type RoundPayload = { minigame: string; gameSeed: number; items: ItemPayload[] };
