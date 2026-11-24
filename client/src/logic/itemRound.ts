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

export class ItemRound {
  minigame: MinigameId;
  gameSeed: number;
  code: EscapeCode;
  items: WorldItem[];
  private playing = new Set<string>();
  private knows = new Set<string>();

  constructor(init: { minigame: MinigameId; gameSeed: number; code: EscapeCode; items: WorldItem[] }) {
    this.minigame = init.minigame;
    this.gameSeed = init.gameSeed;
    this.code = init.code;
    this.items = init.items.map((i) => ({ ...i }));
  }

  static fromSeed(seedText: string, round = 1): ItemRound {
    return new ItemRound(createRound(seedText, round));
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

  publicView(): RoundPublic {
    return { minigame: this.minigame, gameSeed: this.gameSeed, items: this.items.map((i) => ({ ...i })) };
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

  drop(playerId: string, x: number, y: number, intoSpot?: string | null): { ok: boolean; error?: string } {
    const item = this.heldBy(playerId);
    if (!item) return { ok: false, error: 'empty-hands' };
    item.heldBy = null;
    item.x = x;
    item.y = y;
    item.spotId = intoSpot || null;
    return { ok: true };
  }

  /** Drop whatever a leaving player was holding, at their last pose. */
  dropIfHeld(playerId: string, x: number, y: number): void {
    if (this.heldBy(playerId)) this.drop(playerId, x, y, null);
    this.playing.delete(playerId);
  }

  startMinigame(playerId: string, pose: { x: number; y: number }): { ok: boolean; error?: string; minigame?: MinigameId; gameSeed?: number } {
    const item = this.heldBy(playerId);
    if (!isController(item)) return { ok: false, error: 'need-controller' };
    if (!inFrontOfTv(pose.x, pose.y)) return { ok: false, error: 'not-at-tv' };
    this.playing.add(playerId);
    return { ok: true, minigame: this.minigame, gameSeed: this.gameSeed };
  }

  /**
   * Winning reveals the paper code to that player only. The controller is not
   * consumed and there is no noise event.
   */
  winMinigame(playerId: string): { ok: boolean; error?: string; code?: EscapeCode } {
    const item = this.heldBy(playerId);
    if (!isController(item)) return { ok: false, error: 'need-controller' };
    if (!this.playing.has(playerId) && !this.knows.has(playerId)) return { ok: false, error: 'not-playing' };
    this.knows.add(playerId);
    // Still holding the controller: it is not consumed.
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
