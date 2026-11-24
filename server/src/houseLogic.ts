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
  ColourId, LobbyPlayer, LobbyResult, LobbyRoom, LobbySettings, MAX_PLAYERS, PLAYER_COLOURS, validSettings,
} from '../../client/src/lobby/lobby';
import { displayNickname } from '../../client/src/home/settings';
import { PLAYER_SPEED } from '../../client/src/config/physicsConfig';
import { ItemRound, RoundPublic } from '../../client/src/logic/itemRound';
import { EscapeCode } from '../../client/src/logic/escapeCode';
import { PublicItem } from '../../client/src/logic/items';

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

/** One remote-visible pose: world x/y, direction 0..3 (down, left, right, up), moving 0/1. */
export interface Pose { x: number; y: number; d: number; m: number }

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
    return { x: Math.round(m.x * 10) / 10, y: Math.round(m.y * 10) / 10, d, m: m.m === 1 || m.m === true ? 1 : 0 };
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

interface Track { pose: Pose; at: number; dirty: boolean }

export class HouseLogic {
  private lobby: LobbyRoom | null = null;
  /** session id -> lobby player id (and back). */
  private bySession = new Map<string, string>();
  private poses = new Map<string, Track>();
  /** Open / closed state of every hiding / search spot touched (drawers, sofa, bed, ...). */
  private spots = new Map<string, boolean>();
  /** Dropped players (by session) whose seats are held for reconnection. */
  private away = new Set<string>();
  /** Movement corrections (speed sanity) since start, for logs / tests. */
  corrections = 0;
  /** Items + chosen mini-game, created when the host starts. */
  items: ItemRound | null = null;

  constructor(readonly code: string) {}

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
    return this.bySession.has(session);
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
    if (s) { this.bySession.delete(s); this.away.delete(s); this.poses.delete(target); }
    return { ok: true, session: s };
  }
  start(session: string): LobbyResult {
    if (this.started) return { ok: false, error: 'bad-setting' };
    const r = this.act(session, (l, id) => l.start(id));
    if (r.ok) this.items = ItemRound.fromServerRandom(1);
    return r;
  }

  roundPublic(): RoundPublic | null { return this.items?.publicView(this.openSpots()) ?? null; }
  itemList(): PublicItem[] { return this.items?.publicView(this.openSpots()).items ?? []; }

  private poseOf(playerId: string): { x: number; y: number } | null {
    const t = this.poses.get(playerId);
    return t ? { x: t.pose.x, y: t.pose.y } : null;
  }

  pickup(session: string, msg: unknown): { ok: boolean; error?: string } {
    const id = this.bySession.get(session);
    if (!id || !this.started || !this.items) return { ok: false, error: 'not-started' };
    const itemId = isObj(msg) && typeof msg.id === 'string' && msg.id.length <= 48 ? msg.id : null;
    if (!itemId) return { ok: false, error: 'no-item' };
    const pose = this.poseOf(id) ?? { x: 0, y: 0 };
    return this.items.pickup(id, itemId, pose, this.openSpots());
  }

  dropItem(session: string, msg: unknown): { ok: boolean; error?: string } {
    const id = this.bySession.get(session);
    if (!id || !this.started || !this.items) return { ok: false, error: 'not-started' };
    if (!isObj(msg) || !finite(msg.x) || !finite(msg.y)) return { ok: false, error: 'bad-pos' };
    const spot = typeof msg.spotId === 'string' && SPOT_ID.test(msg.spotId) ? msg.spotId : null;
    const pose = this.poseOf(id) ?? { x: 0, y: 0 };
    return this.items.drop(id, msg.x, msg.y, spot, pose, this.openSpots());
  }

  startMinigame(session: string, now = Date.now()): { ok: boolean; error?: string } {
    const id = this.bySession.get(session);
    if (!id || !this.started || !this.items) return { ok: false, error: 'not-started' };
    const pose = this.poseOf(id) ?? { x: 0, y: 0 };
    return this.items.startMinigame(id, pose, now);
  }

  cancelMinigame(session: string): { ok: boolean; error?: string } {
    const id = this.bySession.get(session);
    if (!id || !this.started || !this.items) return { ok: false, error: 'not-started' };
    this.items.cancelMinigame(id);
    return { ok: true };
  }

  winMinigame(session: string, now = Date.now()): { ok: boolean; error?: string; code?: EscapeCode } {
    const id = this.bySession.get(session);
    if (!id || !this.started || !this.items) return { ok: false, error: 'not-started' };
    return this.items.winMinigame(id, now);
  }


  /**
   * In-game movement. The first pose is taken as the spawn; later ones may move at most
   * speed x elapsed (with slack); a longer jump is cut back to that distance along the way.
   * Returns the pose kept, or null when dropped (not started / unknown player / invalid).
   */
  move(session: string, msg: unknown, now: number): Pose | null {
    const id = this.bySession.get(session);
    if (!id || !this.started) return null;
    const p = parse.pos(msg); if (!p) return null;
    const prev = this.poses.get(id);
    if (prev) {
      const dt = Math.min(MAX_ELAPSED_MS, Math.max(0, now - prev.at));
      const max = (PLAYER_SPEED * dt / 1000) * SPEED_SLACK + SPEED_JITTER_PX;
      const dx = p.x - prev.pose.x, dy = p.y - prev.pose.y;
      const dist = Math.hypot(dx, dy);
      if (dist > max) {
        const k = max / dist;
        p.x = Math.round((prev.pose.x + dx * k) * 10) / 10;
        p.y = Math.round((prev.pose.y + dy * k) * 10) / 10;
        this.corrections++;
      }
    }
    this.poses.set(id, { pose: p, at: now, dirty: true });
    return p;
  }

  /** Poses changed since the last call: [playerId, x, y, d, m][] (the broadcast tick). */
  takeDirtyPoses(): [string, number, number, number, number][] {
    const out: [string, number, number, number, number][] = [];
    for (const [id, t] of this.poses) if (t.dirty) { t.dirty = false; out.push([id, t.pose.x, t.pose.y, t.pose.d, t.pose.m]); }
    return out;
  }
  allPoses(): [string, number, number, number, number][] {
    return [...this.poses].map(([id, t]) => [id, t.pose.x, t.pose.y, t.pose.d, t.pose.m]);
  }

  /** In-game open / close of any hiding or search spot (anyone in the room, after start). */
  setSpot(session: string, msg: unknown): { id: string; open: boolean; by: string } | null {
    const by = this.bySession.get(session);
    if (!by || !this.started || this.away.has(session)) return null;
    const d = parse.spot(msg); if (!d) return null;
    if (!this.spots.has(d.id) && this.spots.size >= MAX_SPOTS) return null;
    if (this.spots.get(d.id) === d.open) return null; // no change, nothing to broadcast
    this.spots.set(d.id, d.open);
    return { ...d, by };
  }
  /** Every open spot (the full state a (re)joining client applies; anything else is closed). */
  openSpots(): string[] { return [...this.spots].filter(([, o]) => o).map(([id]) => id); }

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
