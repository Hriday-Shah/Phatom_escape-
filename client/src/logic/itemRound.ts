/**
 * Authoritative (and offline) state for this round's hidden items, the chosen
 * mini-game and the paper code. The Colyseus room runs the same class.
 */
import { houseLayout } from '../data/houseLayout';
import { buildInteractables } from './spotTargeting';
import { EscapeCode, makeEscapeCode } from './escapeCode';
import {
  CONTROLLER_ID, PublicItem, WorldItem, isController, makeController,
} from './items';
import { MinigameId, selectMinigame, minigameSeed } from './minigames';
import { hashSeed, mulberry32, pick } from './seededRng';

export const TV_UNIT = { x: 760, y: 110, width: 40, height: 110, id: 'tv_unit' };
export const NEAR_TV = 80;
export const NEAR_ITEM = 90;

/** Believable minimum play time (ms) before a win is accepted (R14-4). */
export const MIN_WIN_MS: Record<MinigameId, number> = {
  slide: 1500,
  maze: 800,
  lockpick: 1200,
  memory: 2000,
  chase: 8000,
};

/** Wins slower than the 30 s clock plus this slack are rejected. */
export const WIN_SLACK_MS = 2500;

export interface RoundPublic {
  minigame: MinigameId;
  gameSeed: number;
  items: PublicItem[];
}

export function distanceToRect(px: number, py: number, r: { x: number; y: number; width: number; height: number }): number {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.width));
  const dy = Math.max(r.y - py, 0, py - (r.y + r.height));
  return Math.hypot(dx, dy);
}

export function inFrontOfTv(px: number, py: number): boolean {
  return distanceToRect(px, py, TV_UNIT) <= NEAR_TV;
}

export function hidingSpotList(): { id: string; x: number; y: number; width: number; height: number }[] {
  return buildInteractables(houseLayout.hidingSpots).map((s) => ({
    id: s.id, x: s.x, y: s.y, width: s.width, height: s.height,
  }));
}

export function createRound(seedText: string, round = 1): { minigame: MinigameId; gameSeed: number; code: EscapeCode; items: WorldItem[] } {
  const rng = mulberry32(hashSeed(`${seedText}#items#${round}`));
  const spots = hidingSpotList();
  const spot = pick(rng, spots);
  return {
    minigame: selectMinigame(seedText, round),
    gameSeed: minigameSeed(seedText, round),
    code: makeEscapeCode(rng),
    items: [makeController(spot.id, spot.x + spot.width / 2, spot.y + spot.height / 2)],
  };
}

/** 16 cryptographically random bytes as hex. Not derived from the room code. */
export function randomSeedText(): string {
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Online only: code and controller spot come from a server-only random seed (R14-3). */
export function createServerRound(round = 1): { minigame: MinigameId; gameSeed: number; code: EscapeCode; items: WorldItem[] } {
  return createRound(randomSeedText(), round);
}

export function itemReachableFrom(pose: { x: number; y: number }, item: { x: number; y: number; spotId?: string | null }, reach = NEAR_ITEM): boolean {
  if (item.spotId) {
    const spot = hidingSpotList().find((s) => s.id === item.spotId);
    if (spot) return distanceToRect(pose.x, pose.y, spot) <= reach;
  }
  return Math.hypot(pose.x - item.x, pose.y - item.y) <= reach;
}

export function visibleItems(items: PublicItem[], openSpots: Iterable<string>): PublicItem[] {
  const open = new Set(openSpots);
  return items.filter((i) => i.heldBy || !i.spotId || open.has(i.spotId)).map((i) => ({ ...i }));
}

export class ItemRound {
  minigame: MinigameId;
  gameSeed: number;
  code: EscapeCode;
  items: WorldItem[];
  private playing = new Set<string>();
  private knows = new Set<string>();
  private attempts = new Map<string, { game: MinigameId; at: number }>();

  constructor(init: { minigame: MinigameId; gameSeed: number; code: EscapeCode; items: WorldItem[] }) {
    this.minigame = init.minigame;
    this.gameSeed = init.gameSeed;
    this.code = init.code;
    this.items = init.items.map((i) => ({ ...i }));
  }

  static fromSeed(seedText: string, round = 1): ItemRound {
    return new ItemRound(createRound(seedText, round));
  }

  static fromServerRandom(round = 1): ItemRound {
    return new ItemRound(createServerRound(round));
  }

  /** Client snapshot from the server (the secret code is omitted until a reveal). */
  static fromPublic(pub: RoundPublic, known?: EscapeCode | null): ItemRound {
    return new ItemRound({
      minigame: pub.minigame,
      gameSeed: pub.gameSeed,
      code: known ?? (['red', 'blue', 'violet', 'yellow'] as EscapeCode),
      items: pub.items.map((i) => ({ ...i })),
    });
  }

  setRevealedCode(code: EscapeCode, playerId: string): void {
    this.code = code;
    this.knows.add(playerId);
  }

  /**
   * Public snapshot. Hidden-spot contents are omitted when `openSpots` is given,
   * so clients cannot learn the controller location from the room code or the
   * initial `round` message. The paper code is never included.
   */
  publicView(openSpots?: Iterable<string>): RoundPublic {
    const items = openSpots === undefined
      ? this.items.map((i) => ({ ...i }))
      : visibleItems(this.items, openSpots);
    return { minigame: this.minigame, gameSeed: this.gameSeed, items };
  }

  itemInSpot(spotId: string): WorldItem | undefined {
    return this.items.find((i) => i.spotId === spotId && !i.heldBy);
  }

  heldBy(playerId: string): WorldItem | undefined {
    return this.items.find((i) => i.heldBy === playerId);
  }

  knowsCode(playerId: string): boolean { return this.knows.has(playerId); }
  codeFor(playerId: string): EscapeCode | null { return this.knows.has(playerId) ? this.code : null; }

  pickup(playerId: string, itemId: string, pose: { x: number; y: number }, openSpots: Set<string> | string[]): { ok: boolean; error?: string } {
    if (this.heldBy(playerId)) return { ok: false, error: 'hands-full' };
    const item = this.items.find((i) => i.id === itemId);
    if (!item || item.heldBy) return { ok: false, error: 'no-item' };
    const open = openSpots instanceof Set ? openSpots : new Set(openSpots);
    if (item.spotId) {
      if (!open.has(item.spotId)) return { ok: false, error: 'closed' };
      const spot = hidingSpotList().find((s) => s.id === item.spotId);
      if (spot && distanceToRect(pose.x, pose.y, spot) > NEAR_ITEM) return { ok: false, error: 'too-far' };
    } else if (Math.hypot(pose.x - item.x, pose.y - item.y) > NEAR_ITEM) {
      return { ok: false, error: 'too-far' };
    }
    item.heldBy = playerId;
    item.spotId = null;
    return { ok: true };
  }

  drop(
    playerId: string, x: number, y: number, intoSpot?: string | null,
    pose?: { x: number; y: number }, openSpots?: Set<string> | string[],
  ): { ok: boolean; error?: string } {
    const item = this.heldBy(playerId);
    if (!item) return { ok: false, error: 'empty-hands' };
    const origin = pose ?? { x, y };
    const open = openSpots instanceof Set ? openSpots : new Set(openSpots ?? []);
    let spotId = intoSpot || null;
    let dx = x, dy = y;
    if (spotId) {
      if (openSpots && !open.has(spotId)) return { ok: false, error: 'closed' };
      const spot = hidingSpotList().find((s) => s.id === spotId);
      if (!spot) return { ok: false, error: 'no-spot' };
      if (distanceToRect(origin.x, origin.y, spot) > NEAR_ITEM) return { ok: false, error: 'too-far' };
      dx = spot.x + spot.width / 2;
      dy = spot.y + spot.height / 2;
    } else {
      const dist = Math.hypot(dx - origin.x, dy - origin.y);
      if (dist > NEAR_ITEM) {
        if (dist === 0) { dx = origin.x; dy = origin.y; }
        else {
          const t = NEAR_ITEM / dist;
          dx = origin.x + (dx - origin.x) * t;
          dy = origin.y + (dy - origin.y) * t;
        }
      }
      // A floor drop must not land inside a closed spot (e.g. the bed).
      const inside = hidingSpotList().find((s) => dx >= s.x && dy >= s.y && dx <= s.x + s.width && dy <= s.y + s.height);
      if (inside) {
        if (openSpots && !open.has(inside.id)) return { ok: false, error: 'closed' };
        if (open.has(inside.id) && distanceToRect(origin.x, origin.y, inside) <= NEAR_ITEM) {
          spotId = inside.id;
          dx = inside.x + inside.width / 2;
          dy = inside.y + inside.height / 2;
        }
      }
    }
    item.heldBy = null;
    item.x = dx;
    item.y = dy;
    item.spotId = spotId;
    this.cancelMinigame(playerId);
    return { ok: true };
  }

  /** Drop whatever a leaving player was holding, at their last pose (open floor). */
  dropIfHeld(playerId: string, x: number, y: number): void {
    if (this.heldBy(playerId)) this.drop(playerId, x, y, null, { x, y }, []);
    this.cancelMinigame(playerId);
  }

  startMinigame(playerId: string, pose: { x: number; y: number }, now = Date.now()): { ok: boolean; error?: string; minigame?: MinigameId; gameSeed?: number } {
    const item = this.heldBy(playerId);
    if (!isController(item)) return { ok: false, error: 'need-controller' };
    if (!inFrontOfTv(pose.x, pose.y)) return { ok: false, error: 'not-at-tv' };
    this.playing.add(playerId);
    this.attempts.set(playerId, { game: this.minigame, at: now });
    return { ok: true, minigame: this.minigame, gameSeed: this.gameSeed };
  }

  cancelMinigame(playerId: string): void {
    this.playing.delete(playerId);
    this.attempts.delete(playerId);
  }

  /**
   * Winning reveals the paper code to that player only. The controller is not
   * consumed and there is no noise event. A win needs a matching start and a
   * believable elapsed time (R14-4).
   */
  winMinigame(playerId: string, now = Date.now()): { ok: boolean; error?: string; code?: EscapeCode } {
    const item = this.heldBy(playerId);
    if (!isController(item)) return { ok: false, error: 'need-controller' };
    const att = this.attempts.get(playerId);
    if (!att || !this.playing.has(playerId)) return { ok: false, error: 'no-start' };
    const elapsed = now - att.at;
    const min = MIN_WIN_MS[att.game];
    if (elapsed < min) return { ok: false, error: 'too-fast' };
    if (elapsed > 30_000 + WIN_SLACK_MS) return { ok: false, error: 'too-slow' };
    this.playing.delete(playerId);
    this.attempts.delete(playerId);
    this.knows.add(playerId);
    return { ok: true, code: this.code };
  }

  /** Offline / local reveal (same rules: must hold the controller). */
  revealLocal(playerId = 'local'): EscapeCode | null {
    const item = this.heldBy(playerId);
    if (!isController(item)) return null;
    this.knows.add(playerId);
    return this.code;
  }
}

export { CONTROLLER_ID };
