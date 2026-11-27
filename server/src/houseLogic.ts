/**
 * Authoritative room logic for one online house (trial of stage 2). Pure (no Colyseus, no
 * sockets), so it is unit-tested in src/tests. The Colyseus room (HouseRoom.ts) only maps
 * sessions to calls on this class and broadcasts what it returns.
 *
 * The lobby rules are the client's own `LobbyRoom` (client/src/lobby/lobby.ts), so host-only
 * actions, colour uniqueness, setting clamps and host migration behave exactly as offline; the
 * nickname is cleaned with the client's `displayNickname` (home/settings.ts).
 */
import {
  ColourId, DrawerNoise, LobbyPlayer, LobbyResult, LobbyRoom, LobbySettings, MAX_PLAYERS, PLAYER_COLOURS, maxPhantoms, validSettings,
} from '../../client/src/lobby/lobby';
import {
  RoundPhase, RoundRole, canMove, canOpenSpot, canSeeInside, isWaiting, minutesToMs, pickPhantoms,
} from '../../client/src/logic/roundPhase';
import { displayNickname } from '../../client/src/home/settings';
import { randomBytes, randomInt } from 'node:crypto';
import { PLAYER_SPEED } from '../../client/src/config/physicsConfig';
import { ItemRound, RoundPublic, createServerRoundFrom } from '../../client/src/logic/itemRound';
import { EscapeCode } from '../../client/src/logic/escapeCode';
import { PublicItem } from '../../client/src/logic/items';
import { houseLayout } from '../../client/src/data/houseLayout';
import { onlineSpawnSlots } from '../../client/src/logic/onlineSpawn';
import { FLOOR_GROUND, normaliseFloor, poseInsideFloor } from '../../client/src/data/houseFloors';
import {
  resolveStairAfterMove,
  movementBlockersForFloor,
  spotFloor,
} from '../../client/src/logic/floorMovement';
import {
  canUseSpot, hasLineOfSight, losBlockers, PLAYER_BODY_RADIUS, pointBlocked, poseOnFloor, resolveMove, spotById,
} from '../../client/src/logic/worldCollision';
import type { PlayView } from '../../client/src/logic/minigames/replay';

export type JoinError = 'full' | 'started';
/** A lobby player as everyone sees it; `away` = dropped, the seat is kept while they reconnect. */
export type PublicPlayer = LobbyPlayer & { away: boolean };
export interface PublicLobby {
  code: string;
  hostId: string;
  players: PublicPlayer[];
  settings: LobbySettings;
  started: boolean;
}

/** One remote-visible pose: world x/y, direction 0..3 (down, left, right, up), moving 0/1, floor f. */
export interface Pose { x: number; y: number; d: number; m: number; f: number }

export interface RoundRoleRow { id: string; role: RoundRole }
/** Where a Phantom is put when chase starts (the entrance). Sent once, with that phase change. */
export interface RoundEntry { id: string; x: number; y: number; f: number }
/** Non-Phantoms wait here during hiding — outside the house, so they cannot appear inside. */
export const WAITING_ROOM_POSE: Pose = { x: -400, y: -400, d: 0, m: 0, f: FLOOR_GROUND };
export interface RoundView {
  phase: RoundPhase;
  /** Server epoch ms when this phase ends. On `ended`, the moment chase ran out. */
  endsAt: number;
  serverNow: number;
  roles: RoundRoleRow[];
  result?: 'phantom-wins';
  entries?: RoundEntry[];
}
/** Opening a spot in search or chase, when drawer noise is not off. `to` is Phantom player ids. */
export interface DrawerNoiseEvent {
  id: string;
  x: number;
  y: number;
  level: Exclude<DrawerNoise, 'off'>;
  to: string[];
}

interface RoundClock {
  phase: RoundPhase;
  endsAt: number;
  searchMs: number;
  chaseMs: number;
  result?: 'phantom-wins';
}

const COLOUR_IDS = new Set<string>(PLAYER_COLOURS.map((c) => c.id));
/** Spot / section ids (drawers, sofa cushions, bed, fridge...) look like `sofa_d1`; anything else is refused. */
const SPOT_ID = /^[A-Za-z0-9_-]{1,48}$/;
/** At most this many distinct spot ids per room (the house has far fewer). */
export const MAX_SPOTS = 256;
/** A dropped player keeps their seat (colour, host) this long while reconnecting. */
export const RECONNECT_SECONDS = Number(process.env.RECONNECT_SECONDS) > 0 ? Number(process.env.RECONNECT_SECONDS) : 30;
/** Any position outside this box is refused (the house is well inside it). */
export const WORLD_LIMIT = 6000;
/** Speed sanity: allowed distance = speed x elapsed x SLACK + JITTER (elapsed capped). */
export const SPEED_SLACK = 1.35;
export const SPEED_JITTER_PX = 24;
export const MAX_ELAPSED_MS = 1000;

/** Simple token bucket (per client, per kind of message). */
export class RateLimiter {
  private tokens: number;
  private last: number;
  constructor(private ratePerSec: number, private burst: number, now: number) { this.tokens = burst; this.last = now; }
  take(now: number): boolean {
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.ratePerSec);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function defaultRng(): number {
  return randomInt(0, 0x1_0000_0000) / 0x1_0000_0000;
}

/** Validators for every client message: the parsed value, or null to drop it. */
export const parse = {
  colour(m: unknown): ColourId | null { return isObj(m) && typeof m.colour === 'string' && COLOUR_IDS.has(m.colour) ? m.colour as ColourId : null; },
  ready(m: unknown): boolean | null { return isObj(m) && typeof m.ready === 'boolean' ? m.ready : null; },
  settings(m: unknown): Partial<LobbySettings> | null {
    if (!isObj(m) || !isObj(m.patch)) return null;
    const keys = Object.keys(m.patch);
    if (keys.length === 0 || keys.length > 16) return null;
    return m.patch as Partial<LobbySettings>; // values are checked / clamped by validSettings
  },
  kick(m: unknown): string | null { return isObj(m) && typeof m.id === 'string' && m.id.length <= 16 ? m.id : null; },
  pos(m: unknown): Pose | null {
    if (!isObj(m) || !finite(m.x) || !finite(m.y)) return null;
    if (Math.abs(m.x) > WORLD_LIMIT || Math.abs(m.y) > WORLD_LIMIT) return null;
    const d = m.d === 0 || m.d === 1 || m.d === 2 || m.d === 3 ? m.d : 0;
    const f = normaliseFloor(m.f);
    return { x: Math.round(m.x * 10) / 10, y: Math.round(m.y * 10) / 10, d, m: m.m === 1 || m.m === true ? 1 : 0, f };
  },
  spot(m: unknown): { id: string; open: boolean } | null {
    return isObj(m) && typeof m.id === 'string' && SPOT_ID.test(m.id) && typeof m.open === 'boolean' ? { id: m.id, open: m.open } : null;
  },
  join(o: unknown): { nickname: string; colour?: ColourId } {
    const raw = isObj(o) && typeof o.nickname === 'string' ? o.nickname.slice(0, 200) : '';
    const colour = isObj(o) && typeof o.colour === 'string' && COLOUR_IDS.has(o.colour) ? o.colour as ColourId : undefined;
    return { nickname: displayNickname(raw), colour };
  },
};

interface Track { pose: Pose; at: number; dirty: boolean; creditMs: number }

export class HouseLogic {
  private lobby: LobbyRoom | null = null;
  /** session id -> lobby player id (and back). */
  private bySession = new Map<string, string>();
  private poses = new Map<string, Track>();
  /** Open / closed state of every hiding / search spot touched (drawers, sofa, bed, ...). */
  private spots = new Map<string, boolean>();
  /** Who last opened each currently-open spot (they may see its contents). */
  private spotOpener = new Map<string, string>();
  /** Dropped players (by session) whose seats are held for reconnection. */
  private away = new Set<string>();
  /**
   * Player ids whose next pose may be placed where the phone already is.
   * A reconnect otherwise speed-caps that step from the last accepted point,
   * so everyone else watches a crawl across the house.
   */
  private placeOnReturn = new Set<string>();
  /** Movement corrections (speed sanity) since start, for logs / tests. */
  corrections = 0;
  /** Items + chosen mini-game, created when the host starts. */
  items: ItemRound | null = null;
  /** Player id -> role, assigned once at start. */
  private roles = new Map<string, RoundRole>();
  private round: RoundClock | null = null;
  /** Latest time the clock has been advanced to. Never moves backwards. */
  private clockNow = 0;
  /** A phase broadcast is waiting (start, or a transition). */
  private phaseDirty = false;
  /** Entrance placements for the chase transition. Consumed by the next phase event. */
  private queuedEntries: RoundEntry[] | null = null;
  /** Sessions whose latest move was refused because this phase does not let them walk. */
  private held = new Set<string>();
  private pendingNoise: DrawerNoiseEvent | null = null;
  /** Drawer noise captured when the host presses Start. */
  private drawerNoise: DrawerNoise = 'off';

  constructor(readonly code: string, private readonly rng: () => number = defaultRng) {}

  get started(): boolean { return !!this.lobby?.state.started; }
  get size(): number { return this.bySession.size; }
  playerId(session: string): string | undefined { return this.bySession.get(session); }
  sessionOf(playerId: string): string | undefined {
    for (const [s, p] of this.bySession) if (p === playerId) return s;
    return undefined;
  }

  /** Why a new player may not join right now (checked before a seat is given). */
  canJoin(): JoinError | null {
    if (this.started) return 'started';
    if (this.size >= MAX_PLAYERS) return 'full';
    return null;
  }

  /** Add a player (the first one is the host). Returns its player id. */
  join(session: string, options: unknown): { ok: true; playerId: string } | { ok: false; error: JoinError } {
    const why = this.canJoin();
    if (why) return { ok: false, error: why };
    const { nickname, colour } = parse.join(options);
    let id: string;
    if (!this.lobby) { this.lobby = new LobbyRoom(this.code, nickname, colour); id = this.lobby.hostId; }
    else {
      try { id = this.lobby.add(nickname, colour).id; } catch { return { ok: false, error: 'full' }; }
    }
    this.bySession.set(session, id);
    this.capPhantoms();
    return { ok: true, playerId: id };
  }

  /** A player left (or was kicked / dropped): host migrates to the next player. */
  leave(session: string): void {
    const id = this.bySession.get(session);
    if (!id) return;
    this.bySession.delete(session);
    this.away.delete(session);
    const last = this.poses.get(id);
    this.items?.dropIfHeld(id, last?.pose.x ?? 0, last?.pose.y ?? 0);
    this.poses.delete(id);
    this.placeOnReturn.delete(id);
    this.roles.delete(id);
    if (this.lobby?.state.players.some((p) => p.id === id)) this.lobby.leave(id);
    this.capPhantoms();
  }

  /** R11: keep Phantoms within maxPhantoms(players) as players come and go (the client's rule). */
  private capPhantoms(): void {
    if (this.lobby?.state.players.length) this.lobby.capPhantoms();
  }

  /**
   * Connection dropped (not a deliberate leave): the seat, colour and host status are kept and
   * others see the player as away. `leave()` once the reconnection window runs out.
   */
  drop(session: string): boolean {
    if (!this.bySession.has(session)) return false;
    this.away.add(session);
    return true;
  }
  /** Back in time: still a player? (false when kicked meanwhile). */
  reconnect(session: string): boolean {
    this.away.delete(session);
    const id = this.bySession.get(session);
    // Mid-game only. A lobby reconnect has no pose, and a fresh start assigns the entrance slot.
    if (id && this.started && this.poses.has(id)) this.placeOnReturn.add(id);
    return !!id;
  }
  isAway(session: string): boolean { return this.away.has(session); }

  private act(session: string, f: (lobby: LobbyRoom, id: string) => LobbyResult): LobbyResult {
    const id = this.bySession.get(session);
    if (!id || !this.lobby) return { ok: false, error: 'no-such-player' };
    return f(this.lobby, id);
  }
  setColour(session: string, msg: unknown): LobbyResult {
    const c = parse.colour(msg); if (!c) return { ok: false, error: 'bad-setting' };
    return this.act(session, (l, id) => l.setColour(id, c));
  }
  /** R11: the host always counts as ready (pressing Start is its "ready"); its own toggle is a no-op. */
  setReady(session: string, msg: unknown): LobbyResult {
    const r = parse.ready(msg); if (r === null) return { ok: false, error: 'bad-setting' };
    if (this.lobby && this.bySession.get(session) === this.lobby.hostId) return { ok: true };
    return this.act(session, (l, id) => l.setReady(id, r));
  }
  updateSettings(session: string, msg: unknown): LobbyResult {
    const patch = parse.settings(msg); if (!patch) return { ok: false, error: 'bad-setting' };
    return this.act(session, (l, id) => {
      if (id !== l.hostId) return { ok: false, error: 'not-host' };
      if (!validSettings(l.state.settings, patch)) return { ok: false, error: 'bad-setting' };
      const r = l.updateSettings(id, patch);
      this.capPhantoms();
      return r;
    });
  }
  /** Host only. On success returns the kicked player's session so the room can disconnect it. */
  kick(session: string, msg: unknown): LobbyResult & { session?: string } {
    const target = parse.kick(msg); if (!target) return { ok: false, error: 'no-such-player' };
    const r = this.act(session, (l, id) => l.kick(id, target));
    if (!r.ok) return r;
    const s = this.sessionOf(target);
    if (s) { this.bySession.delete(s); this.away.delete(s); this.poses.delete(target); this.placeOnReturn.delete(target); this.roles.delete(target); }
    return { ok: true, session: s };
  }
  start(session: string, now = Date.now()): LobbyResult {
    if (this.started) return { ok: false, error: 'bad-setting' };
    const r = this.act(session, (l, id) => l.start(id));
    if (r.ok) {
      // Independent CSPRNG streams: gameSeed (public, game + visuals) vs secret hex (never sent).
      const gameSeed = randomInt(0, 0x1_0000_0000);
      const secretHex = randomBytes(16).toString('hex');
      this.items = new ItemRound(createServerRoundFrom(gameSeed, secretHex, 1));
      // Only Phantoms spawn in the house during hiding. Everyone else waits outside it.
      const players = this.lobby?.state.players ?? [];
      this.assignRoles(players.map((p) => p.id));
      const inHouse = players.filter((p) => this.roles.get(p.id) === 'phantom');
      const slots = onlineSpawnSlots({ x: 300, y: 430 }, Math.max(inHouse.length, 1));
      inHouse.forEach((p, i) => {
        const s = slots[i % slots.length]!;
        this.poses.set(p.id, { pose: { x: s.x, y: s.y, d: 0, m: 0, f: FLOOR_GROUND }, at: now, dirty: true, creditMs: 0 });
      });
      for (const p of players) {
        if (this.roles.get(p.id) === 'player') {
          this.poses.set(p.id, { pose: { ...WAITING_ROOM_POSE }, at: now, dirty: true, creditMs: 0 });
        }
      }
      const settings = this.lobby?.state.settings;
      const hidingMs = minutesToMs(settings?.hidingMinutes ?? 5);
      this.round = {
        phase: 'hiding',
        endsAt: now + hidingMs,
        searchMs: minutesToMs(settings?.searchMinutes ?? 5),
        chaseMs: minutesToMs(settings?.chaseMinutes ?? 20),
      };
      this.clockNow = now;
      this.drawerNoise = settings?.drawerNoise ?? 'off';
      this.phaseDirty = true;
    }
    return r;
  }

  /** `phantoms` from the host settings, already capped, chosen at random. */
  private assignRoles(ids: string[]): void {
    const n = Math.min(this.lobby?.state.settings.phantoms ?? 1, maxPhantoms(ids.length));
    const phantoms = new Set(pickPhantoms(ids, n, this.rng));
    this.roles.clear();
    for (const id of ids) this.roles.set(id, phantoms.has(id) ? 'phantom' : 'player');
  }

  roleOf(playerId: string): RoundRole | null {
    return this.roles.get(playerId) ?? null;
  }

  /**
   * Move the phase clock forward to `now`. Time only moves forward, so a late message
   * cannot rewind a phase. Crossing a boundary schedules the next phase from that
   * boundary (a late tick does not shorten the following phase).
   */
  advance(now: number): boolean {
    if (!this.round) return false;
    if (now < this.clockNow) now = this.clockNow;
    this.clockNow = now;
    let changed = false;
    while (this.round.phase !== 'ended' && now >= this.round.endsAt) {
      this.enterNext();
      changed = true;
    }
    return changed;
  }

  private enterNext(): void {
    const r = this.round!;
    const boundary = r.endsAt;
    this.placeOnReturn.clear();
    if (r.phase === 'hiding') {
      r.phase = 'search';
      r.endsAt = boundary + r.searchMs;
      this.queuedEntries = this.letPlayersIn(boundary);
    } else if (r.phase === 'search') {
      r.phase = 'chase';
      r.endsAt = boundary + r.chaseMs;
      this.queuedEntries = this.letPhantomsIn(boundary);
    } else {
      r.phase = 'ended';
      r.result = 'phantom-wins';
      r.endsAt = boundary;
    }
    this.phaseDirty = true;
  }

  /** Chase: Phantoms are let in at the entrance. They do not walk there themselves. */
  private letPhantomsIn(at: number): RoundEntry[] {
    return this.placeRoleAtEntrance('phantom', at);
  }

  /** Search: waiting players are released into the house at the entrance. */
  private letPlayersIn(at: number): RoundEntry[] {
    return this.placeRoleAtEntrance('player', at);
  }

  private placeRoleAtEntrance(role: RoundRole, at: number): RoundEntry[] {
    const ids = [...this.roles.entries()].filter(([, r]) => r === role).map(([id]) => id);
    if (!ids.length) return [];
    const slots = onlineSpawnSlots({ x: 300, y: 430 }, Math.max(ids.length, 1));
    const entries: RoundEntry[] = [];
    ids.forEach((id, i) => {
      const s = slots[i % slots.length]!;
      const pose = { x: s.x, y: s.y, d: 0, m: 0, f: FLOOR_GROUND };
      const prev = this.poses.get(id);
      if (prev) {
        prev.pose = pose;
        prev.at = at;
        prev.dirty = true;
        prev.creditMs = 0;
      } else {
        this.poses.set(id, { pose: { ...pose }, at, dirty: true, creditMs: 0 });
      }
      entries.push({ id, x: s.x, y: s.y, f: FLOOR_GROUND });
    });
    return entries;
  }

  /** Current phase. Does not move the clock (call `advance` first). */
  roundView(now = this.clockNow): RoundView | null {
    if (!this.round) return null;
    return this.packView(now, null);
  }

  /** Phase message for every phone, or null when nothing new happened. */
  takePhaseEvent(now: number): RoundView | null {
    if (this.advance(now)) this.phaseDirty = true;
    if (!this.phaseDirty || !this.round) return null;
    this.phaseDirty = false;
    const entries = this.queuedEntries;
    this.queuedEntries = null;
    return this.packView(now, entries);
  }

  private packView(now: number, entries: RoundEntry[] | null): RoundView {
    const r = this.round!;
    const roles: RoundRoleRow[] = [];
    for (const p of this.lobby?.state.players ?? []) {
      const role = this.roles.get(p.id);
      if (role) roles.push({ id: p.id, role });
    }
    const view: RoundView = { phase: r.phase, endsAt: r.endsAt, serverNow: now, roles };
    if (r.result) view.result = r.result;
    if (entries && entries.length) view.entries = entries;
    return view;
  }

  /** Hide anyone who is not in the house from anyone who is, and the reverse. */
  canSeeActor(viewerId: string, subjectId: string): boolean {
    const phase = this.round?.phase ?? 'ended';
    const viewer = this.roles.get(viewerId) ?? 'player';
    const subject = this.roles.get(subjectId) ?? 'player';
    if (isWaiting(viewer, phase) || isWaiting(subject, phase)) return false;
    if (phase === 'search' && (viewer === 'phantom' || subject === 'phantom')) return false;
    return true;
  }

  canSeeHouse(playerId: string): boolean {
    const role = this.roles.get(playerId) ?? 'player';
    return canSeeInside(role, this.round?.phase ?? 'hiding');
  }

  /** Public round (game choice + seed). Items are omitted — send itemListFor per player (R15-3). */
  roundPublic(): RoundPublic | null {
    if (!this.items) return null;
    return { minigame: this.items.minigame, gameSeed: this.items.gameSeed, items: [] };
  }

  /**
   * Items this player may see (R15-3): always their held item; contents of a closed
   * spot never; contents of an open spot only if they opened it or have line of
   * sight to it; floor / held-by-other items only with line of sight.
   */
  itemListFor(playerId: string): PublicItem[] {
    if (!this.items) return [];
    if (!this.canSeeHouse(playerId)) return [];
    const pose = this.poseOf(playerId);
    if (!pose) return [];
    const open = new Set(this.openSpots());
    const pf = pose.f ?? FLOOR_GROUND;
    const blockers = losBlockers(false, pf);
    const out: PublicItem[] = [];
    for (const item of this.items.items) {
      if ((item.f ?? 0) !== pf) continue;
      if (item.heldBy === playerId) { out.push({ ...item }); continue; }
      if (item.spotId) {
        if (spotFloor(item.spotId) !== pf) continue;
        if (!open.has(item.spotId)) continue;
        const spot = spotById(item.spotId);
        if (!spot) continue;
        const opener = this.spotOpener.get(item.spotId);
        const canSee = opener === playerId || hasLineOfSight(pose.x, pose.y, spot.x + spot.width / 2, spot.y + spot.height / 2, blockers);
        if (!canSee) continue;
        out.push({ ...item });
        continue;
      }
      const holder = item.heldBy ? this.poseOf(item.heldBy) : null;
      const target = holder ?? { x: item.x, y: item.y };
      if (holder && (holder.f ?? 0) !== pf) continue;
      if (!hasLineOfSight(pose.x, pose.y, target.x, target.y, blockers)) continue;
      out.push({ ...item });
    }
    return out;
  }

  private poseOf(playerId: string): Pose | null {
    const t = this.poses.get(playerId);
    return t ? { ...t.pose } : null;
  }

  pickup(session: string, msg: unknown): { ok: boolean; error?: string } {
    const id = this.bySession.get(session);
    if (!id || !this.started || !this.items) return { ok: false, error: 'not-started' };
    if (!this.canSeeHouse(id)) return { ok: false, error: 'outside' };
    const itemId = isObj(msg) && typeof msg.id === 'string' && msg.id.length <= 48 ? msg.id : null;
    if (!itemId) return { ok: false, error: 'no-item' };
    const pose = this.poseOf(id) ?? { x: 0, y: 0, d: 0, m: 0, f: FLOOR_GROUND };
    return this.items.pickup(id, itemId, pose, this.openSpots());
  }

  dropItem(session: string, msg: unknown): { ok: boolean; error?: string } {
    const id = this.bySession.get(session);
    if (!id || !this.started || !this.items) return { ok: false, error: 'not-started' };
    if (!this.canSeeHouse(id)) return { ok: false, error: 'outside' };
    if (!isObj(msg) || !finite(msg.x) || !finite(msg.y)) return { ok: false, error: 'bad-pos' };
    const spot = typeof msg.spotId === 'string' && SPOT_ID.test(msg.spotId) ? msg.spotId : null;
    const pose = this.poseOf(id) ?? { x: 0, y: 0, d: 0, m: 0, f: FLOOR_GROUND };
    return this.items.drop(id, msg.x, msg.y, spot, pose, this.openSpots());
  }

  startMinigame(session: string, now = Date.now()): { ok: boolean; error?: string; minigame?: string; gameSeed?: number; puzzle?: PlayView } {
    const id = this.bySession.get(session);
    if (!id || !this.started || !this.items) return { ok: false, error: 'not-started' };
    if (!this.canSeeHouse(id)) return { ok: false, error: 'outside' };
    const pose = this.poseOf(id);
    if (!pose) return { ok: false, error: 'no-pose' };
    return this.items.startMinigame(id, pose, now);
  }

  /** Memory: reveal one card face to the player who flipped it (R15-2). */
  inputMinigame(session: string, msg: unknown): { ok: boolean; error?: string; index?: number; face?: number } {
    const id = this.bySession.get(session);
    if (!id || !this.started || !this.items) return { ok: false, error: 'not-started' };
    if (!this.canSeeHouse(id)) return { ok: false, error: 'outside' };
    if (!this.items.isPlaying(id)) return { ok: false, error: 'no-start' };
    const index = isObj(msg) && finite(msg.index) ? Math.trunc(msg.index) : NaN;
    const face = this.items.memoryFace(index);
    if (face == null) return { ok: false, error: 'no-reveal' };
    return { ok: true, index, face };
  }

  cancelMinigame(session: string): { ok: boolean; error?: string } {
    const id = this.bySession.get(session);
    if (!id || !this.started || !this.items) return { ok: false, error: 'not-started' };
    this.items.cancelMinigame(id);
    return { ok: true };
  }

  winMinigame(session: string, now = Date.now(), log?: unknown): { ok: boolean; error?: string; code?: EscapeCode } {
    const id = this.bySession.get(session);
    if (!id || !this.started || !this.items) return { ok: false, error: 'not-started' };
    if (!this.canSeeHouse(id)) return { ok: false, error: 'outside' };
    return this.items.winMinigame(id, now, log, true);
  }

  /** Test-only: place a player at a walkable pose. Not a network message. */
  setPoseForTest(session: string, pose: Pose, now = Date.now()): void {
    const id = this.bySession.get(session);
    if (!id) return;
    this.poses.set(id, { pose: { ...pose }, at: now, dirty: true, creditMs: 0 });
  }

  poseForTest(session: string): Pose | null {
    const id = this.bySession.get(session);
    if (!id) return null;
    return this.poses.get(id)?.pose ?? null;
  }


  /**
   * In-game movement. Official spawns are set at start(). Later poses are speed-clamped
   * and then slid against the same walls, furniture, hiding spots and locked doors the
   * phone uses. A straight stop would stick the broadcast pose on the car table while
   * the sprite walks along it. A chord that only clips a doorway is taken as the short
   * walk through that doorway, so a catch-up does not wedge on the foyer sideboard.
   * Facing (`d`) and walking (`m`) are the stick the phone is showing, echoed unchanged
   * so the other screen plays the same row.
   *
   * Several `pos` messages in one millisecond used to each see dt ≈ 0 and shrink to the
   * 24px jitter, so a burst crept along the wall. The unused part of the last real
   * interval is kept for that burst and spent by the distance actually moved. The next
   * real interval replaces it, so leftover credit cannot pile into a later jump.
   */
  move(session: string, msg: unknown, now: number): Pose | null {
    const id = this.bySession.get(session);
    if (!id || !this.started) return null;
    const p = parse.pos(msg); if (!p) return null;
    const prev = this.poses.get(id);
    if (!prev) return null; // no free first-pose teleport; start() assigns a spawn
    this.advance(now);
    const role = this.roles.get(id) ?? 'player';
    if (!canMove(role, this.round?.phase ?? 'ended')) {
      this.held.add(session);
      return null;
    }
    this.held.delete(session);
    // One pose after a reconnect: the phone kept walking (or reloaded onto the stored
    // point). Accept that free point once. Every later pose is speed-capped and slid.
    if (this.placeOnReturn.delete(id)) {
      const floor = normaliseFloor(p.f);
      p.f = floor;
      if (poseOnFloor(p, PLAYER_BODY_RADIUS) && !pointBlocked(p.x, p.y, movementBlockersForFloor(floor), PLAYER_BODY_RADIUS)) {
        this.poses.set(id, { pose: p, at: now, dirty: true, creditMs: 0 });
        return p;
      }
    }
    const elapsed = Math.max(0, now - prev.at);
    const wall = Math.min(MAX_ELAPSED_MS, elapsed);
    const budgetMs = wall > 0 ? wall : Math.min(MAX_ELAPSED_MS, prev.creditMs);
    const max = (PLAYER_SPEED * budgetMs / 1000) * SPEED_SLACK + SPEED_JITTER_PX;
    const intentX = p.x;
    const intentY = p.y;
    const jump = resolveStairAfterMove(
      { x: prev.pose.x, y: prev.pose.y, f: prev.pose.f as 0 | 1 },
      intentX,
      intentY,
    );
    if (jump.f !== prev.pose.f) {
      p.x = jump.x;
      p.y = jump.y;
      p.f = jump.f;
      if (!poseOnFloor(p, PLAYER_BODY_RADIUS)) {
        p.x = prev.pose.x;
        p.y = prev.pose.y;
        p.f = prev.pose.f;
        this.corrections++;
      }
      this.poses.set(id, { pose: p, at: now, dirty: true, creditMs: 0 });
      return p;
    }
    const dx = p.x - prev.pose.x, dy = p.y - prev.pose.y;
    const dist = Math.hypot(dx, dy);
    if (dist > max) {
      const k = max / dist;
      p.x = Math.round((prev.pose.x + dx * k) * 10) / 10;
      p.y = Math.round((prev.pose.y + dy * k) * 10) / 10;
      this.corrections++;
    }
    p.f = prev.pose.f;
    p.d = p.d ?? prev.pose.d;
    p.m = p.m ?? prev.pose.m;
    const blockers = movementBlockersForFloor(prev.pose.f, false);
    const slid = resolveMove(prev.pose, p, blockers, max, PLAYER_BODY_RADIUS);
    if (slid.x !== p.x || slid.y !== p.y) this.corrections++;
    p.x = slid.x;
    p.y = slid.y;
    const stair = resolveStairAfterMove(
      { x: prev.pose.x, y: prev.pose.y, f: prev.pose.f as 0 | 1 },
      p.x,
      p.y,
    );
    p.x = stair.x;
    p.y = stair.y;
    p.f = stair.f;
    if (stair.f === prev.pose.f && normaliseFloor((msg as { f?: unknown })?.f) !== prev.pose.f) {
      this.corrections++;
    }
    if (!poseOnFloor(p, PLAYER_BODY_RADIUS)) {
      p.x = prev.pose.x;
      p.y = prev.pose.y;
      p.f = prev.pose.f;
      this.corrections++;
    }
    const moved = Math.hypot(p.x - prev.pose.x, p.y - prev.pose.y);
    const pxPerMs = (PLAYER_SPEED * SPEED_SLACK) / 1000;
    const spentMs = pxPerMs > 0 ? moved / pxPerMs : budgetMs;
    const creditMs = Math.max(0, budgetMs - spentMs);
    this.poses.set(id, { pose: p, at: now, dirty: true, creditMs });
    return p;
  }

  /**
   * TODO(stage 3): per-player interest management for positions — broadcast only
   * poses a client can actually see, instead of every pose to everyone.
   */
  takeDirtyPoses(): [string, number, number, number, number, number][] {
    const out: [string, number, number, number, number, number][] = [];
    for (const [id, t] of this.poses) {
      if (t.dirty) {
        t.dirty = false;
        out.push([id, t.pose.x, t.pose.y, t.pose.d, t.pose.m, t.pose.f ?? FLOOR_GROUND]);
      }
    }
    return out;
  }
  allPoses(): [string, number, number, number, number, number][] {
    return [...this.poses].map(([id, t]) => [id, t.pose.x, t.pose.y, t.pose.d, t.pose.m, t.pose.f ?? FLOOR_GROUND]);
  }

  /** Pose to snap a phone back to when this phase does not let them walk. */
  takeHold(session: string): Pose | null {
    if (!this.held.delete(session)) return null;
    return this.poseForTest(session);
  }

  /** Drawer-noise event from the last accepted open, if Phantoms should hear it. */
  takeNoise(): DrawerNoiseEvent | null {
    const n = this.pendingNoise;
    this.pendingNoise = null;
    return n;
  }

  /** In-game open / close of any hiding or search spot (after start, and only if this phase allows it). */
  setSpot(session: string, msg: unknown): { id: string; open: boolean; by: string } | null {
    const by = this.bySession.get(session);
    if (!by || !this.started || this.away.has(session)) return null;
    const d = parse.spot(msg); if (!d) return null;
    const role = this.roles.get(by) ?? 'player';
    if (this.round && !canOpenSpot(role, this.round.phase)) return null;
    // Only real house spots (unknown ids such as kitchen_d1 are refused).
    if (!spotById(d.id)) return null;
    const pose = this.poseOf(by);
    if (!pose || pose.f !== FLOOR_GROUND || spotFloor(d.id) !== FLOOR_GROUND || !canUseSpot(pose, d.id)) return null;
    if (this.spots.get(d.id) === d.open) return null;
    this.spots.set(d.id, d.open);
    if (d.open) this.spotOpener.set(d.id, by);
    else this.spotOpener.delete(d.id);
    if (d.open) this.noteDrawerNoise(d.id);
    return { ...d, by };
  }

  /** Search and chase only, and only when the host left drawer noise on. Players never receive it. */
  private noteDrawerNoise(spotId: string): void {
    const level = this.drawerNoise;
    const phase = this.round?.phase;
    if (level === 'off' || (phase !== 'search' && phase !== 'chase')) return;
    const spot = spotById(spotId);
    if (!spot) return;
    const to = [...this.roles.entries()].filter(([, role]) => role === 'phantom').map(([id]) => id);
    if (!to.length) return;
    this.pendingNoise = {
      id: spotId,
      x: spot.x + spot.width / 2,
      y: spot.y + spot.height / 2,
      level,
      to,
    };
  }
  /** Every open spot (the full state a (re)joining client applies; anything else is closed). */
  openSpots(): string[] { return [...this.spots].filter(([, o]) => o).map(([id]) => id); }
  isSpotOpen(id: string): boolean { return this.spots.get(id) === true; }

  /**
   * When a toggle was not applied, the open flag the phone should draw.
   * Null when the message is nonsense or the server already matches it
   * (an accepted toggle needs no correction; a repeat of the same state neither).
   */
  spotCorrection(msg: unknown): { id: string; open: boolean } | null {
    const d = parse.spot(msg);
    if (!d || !spotById(d.id)) return null;
    const open = this.isSpotOpen(d.id);
    if (open === d.open) return null;
    return { id: d.id, open };
  }

  /** What every client sees (no session ids, no addresses: only nickname / colour / ready). */
  snapshot(): PublicLobby {
    const s = this.lobby?.state;
    if (!s) return { code: this.code, hostId: '', players: [], settings: {} as LobbySettings, started: false };
    return {
      code: s.code, hostId: s.hostId, started: s.started, settings: { ...s.settings },
      players: s.players.map((p) => {
        const sess = this.sessionOf(p.id);
        return { id: p.id, nickname: p.nickname, colour: p.colour, isHost: p.isHost, ready: p.isHost || p.ready, away: !!sess && this.away.has(sess) };
      }),
    };
  }
}
