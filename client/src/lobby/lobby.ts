/**
 * Lobby model and service interface (placeholder lobby, stage 1).
 *
 * `LobbyService` is what the lobby screen talks to. Stage 1 has only `LocalLobbyService`
 * (in-browser, optional placeholder players); stage 2 can implement the same interface on a
 * Colyseus room (state sync -> onChange, actions -> room messages). Pure: no DOM, unit-tested.
 */

export const PLAYER_COLOURS = [
  { id: 'cyan', name: 'Cyan', hex: '#5FD3E6' },
  { id: 'orange', name: 'Orange', hex: '#F28C28' },
  { id: 'violet', name: 'Violet', hex: '#9B6BFF' },
  { id: 'yellow', name: 'Yellow', hex: '#F2D13A' },
  { id: 'blue', name: 'Blue', hex: '#3A7BF2' },
  { id: 'pink', name: 'Pink', hex: '#FF8FD0' },
  { id: 'white', name: 'White', hex: '#F4F1EA' },
  { id: 'silver', name: 'Silver', hex: '#A9B4C8' },
] as const;
export type ColourId = (typeof PLAYER_COLOURS)[number]['id'];
export const MAX_PLAYERS = PLAYER_COLOURS.length;

/** Hoodie tint with no lobby colour (?debug, ?play, ...): the original cyan. */
export const DEFAULT_HOODIE_TINT = 0x5fd3e6;
/** Phaser tint for a lobby colour id (anything unknown -> the default cyan). */
export function hoodieTint(colour: unknown): number {
  const c = PLAYER_COLOURS.find((x) => x.id === colour);
  return c ? parseInt(c.hex.slice(1), 16) : DEFAULT_HOODIE_TINT;
}

export type DrawerNoise = 'off' | 'quiet' | 'normal' | 'loud';

export interface LobbySettings {
  /** Hiding phase: the Phantom hides items, minutes. */
  hidingMinutes: number;
  /** Search phase: the Phantom is blindfolded and players search, minutes. */
  searchMinutes: number;
  /** Escape / chase phase, minutes. */
  chaseMinutes: number;
  /** How long a stun-gun hit stuns the Phantom, seconds. */
  stunSeconds: number;
  /** Stun gun reload time, minutes. */
  reloadMinutes: number;
  /** How long one sneak lasts, seconds. */
  sneakSeconds: number;
  /** Wait before sneaking again, seconds. */
  sneakCooldownSeconds: number;
  /** Number of Phantoms. */
  phantoms: number;
  /** How loud opening / closing drawers is (how far the Phantom hears it). */
  drawerNoise: DrawerNoise;
}

export type NumericSettingKey = Exclude<keyof LobbySettings, 'drawerNoise'>;
export interface NumericSettingDef { key: NumericSettingKey; label: string; unit: 'min' | 's' | ''; min: number; max: number; step: number; default: number }

/**
 * Numeric settings in display order (the host can change every one; players see them
 * read-only). `elementId` in LobbyScreen maps each to its #pe-set-* select.
 */
export const NUMERIC_SETTINGS: readonly NumericSettingDef[] = [
  { key: 'hidingMinutes', label: 'Hiding time', unit: 'min', min: 1, max: 10, step: 1, default: 5 },
  { key: 'searchMinutes', label: 'Search time', unit: 'min', min: 1, max: 10, step: 1, default: 5 },
  { key: 'chaseMinutes', label: 'Escape / chase time', unit: 'min', min: 5, max: 40, step: 1, default: 20 },
  { key: 'stunSeconds', label: 'Stun duration', unit: 's', min: 10, max: 60, step: 5, default: 30 },
  { key: 'reloadMinutes', label: 'Stun gun reload', unit: 'min', min: 1, max: 10, step: 1, default: 5 },
  { key: 'sneakSeconds', label: 'Sneak duration', unit: 's', min: 5, max: 20, step: 1, default: 10 },
  { key: 'sneakCooldownSeconds', label: 'Sneak cooldown', unit: 's', min: 10, max: 90, step: 5, default: 30 },
  { key: 'phantoms', label: 'Phantoms', unit: '', min: 1, max: 3, step: 1, default: 1 },
];

export const DRAWER_NOISE = { options: ['off', 'quiet', 'normal', 'loud'] as DrawerNoise[], default: 'normal' as DrawerNoise };

/** Limits by key (`SETTING_LIMITS.chaseMinutes.max`, ...). */
export const SETTING_LIMITS = {
  ...(Object.fromEntries(NUMERIC_SETTINGS.map((d) => [d.key, d])) as Record<NumericSettingKey, NumericSettingDef>),
  drawerNoise: DRAWER_NOISE,
};

export const DEFAULT_SETTINGS: LobbySettings = {
  ...(Object.fromEntries(NUMERIC_SETTINGS.map((d) => [d.key, d.default])) as Record<NumericSettingKey, number>),
  drawerNoise: DRAWER_NOISE.default,
};

/** Snap to the setting's step and clamp into its range. */
export function clampSetting(def: NumericSettingDef, v: number): number {
  const snapped = def.min + Math.round((v - def.min) / def.step) * def.step;
  return Math.min(def.max, Math.max(def.min, snapped));
}

export interface LobbyPlayer {
  id: string;
  nickname: string;
  colour: ColourId;
  isHost: boolean;
  ready: boolean;
  /** Placeholder player (stage 1 only). */
  placeholder?: boolean;
}

export interface LobbyState {
  code: string;
  /** This client's player id. */
  selfId: string;
  hostId: string;
  players: LobbyPlayer[];
  settings: LobbySettings;
  started: boolean;
}

export type LobbyError = 'not-host' | 'colour-taken' | 'no-such-player' | 'cannot-kick-self' | 'room-full' | 'bad-setting' | 'left';
export type LobbyResult = { ok: true } | { ok: false; error: LobbyError };

/** What the lobby screen needs. Every action acts as this client (`state.selfId`). */
export interface LobbyService {
  getState(): LobbyState;
  /** Called after every change; returns an unsubscribe function. */
  onChange(cb: (s: LobbyState) => void): () => void;
  join(nickname: string, code: string): LobbyResult;
  leave(): void;
  setColour(colour: ColourId): LobbyResult;
  setReady(ready: boolean): LobbyResult;
  updateSettings(patch: Partial<LobbySettings>): LobbyResult;
  kick(playerId: string): LobbyResult;
  start(): LobbyResult;
  /** True when everyone except the host is ready. */
  allReady(): boolean;
}

const ok: LobbyResult = { ok: true };
const fail = (error: LobbyError): LobbyResult => ({ ok: false, error });

/** Room code alphabet: no 0/O, 1/I/L lookalikes. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function makeRoomCode(rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return s;
}

/**
 * Apply a settings patch: numbers are snapped to their step and clamped into their range;
 * null when a value is not a finite number, the noise is unknown, or the key is unknown.
 */
export function validSettings(cur: LobbySettings, patch: Partial<LobbySettings>): LobbySettings | null {
  const next: LobbySettings = { ...cur };
  for (const [k, v] of Object.entries(patch) as [keyof LobbySettings, unknown][]) {
    if (k === 'drawerNoise') {
      if (!DRAWER_NOISE.options.includes(v as DrawerNoise)) return null;
      next.drawerNoise = v as DrawerNoise;
      continue;
    }
    const def = SETTING_LIMITS[k as NumericSettingKey];
    if (!def || typeof v !== 'number' || !Number.isFinite(v)) return null;
    next[k as NumericSettingKey] = clampSetting(def, v);
  }
  return next;
}

/**
 * The room itself (authoritative state; in stage 2 this logic lives on the server). Every
 * action names the acting player, so rules like "only the host" are enforced here.
 */
export class LobbyRoom {
  private s: Omit<LobbyState, 'selfId'>;
  private seq = 0;

  constructor(code: string, hostNickname: string, hostColour?: ColourId) {
    this.s = { code, hostId: '', players: [], settings: { ...DEFAULT_SETTINGS }, started: false };
    const host = this.add(hostNickname, hostColour);
    this.s.hostId = host.id;
    host.isHost = true;
  }

  get state(): Omit<LobbyState, 'selfId'> { return this.s; }
  get hostId(): string { return this.s.hostId; }

  freeColours(): ColourId[] {
    const taken = new Set(this.s.players.map((p) => p.colour));
    return PLAYER_COLOURS.map((c) => c.id).filter((c) => !taken.has(c));
  }

  /** A new player gets the first free colour (or `colour` when it is free). */
  add(nickname: string, colour?: ColourId, placeholder = false): LobbyPlayer {
    if (this.s.players.length >= MAX_PLAYERS) throw new Error('room-full');
    const free = this.freeColours();
    const p: LobbyPlayer = { id: `p${++this.seq}`, nickname, colour: colour && free.includes(colour) ? colour : free[0], isHost: false, ready: false, placeholder };
    this.s.players.push(p);
    return p;
  }

  private player(id: string): LobbyPlayer | undefined { return this.s.players.find((p) => p.id === id); }

  setColour(actor: string, colour: ColourId): LobbyResult {
    const p = this.player(actor);
    if (!p) return fail('no-such-player');
    if (p.colour === colour) return ok;
    if (this.s.players.some((q) => q.colour === colour)) return fail('colour-taken');
    if (!PLAYER_COLOURS.some((c) => c.id === colour)) return fail('bad-setting');
    p.colour = colour;
    return ok;
  }

  setReady(actor: string, ready: boolean): LobbyResult {
    const p = this.player(actor);
    if (!p) return fail('no-such-player');
    p.ready = ready;
    return ok;
  }

  updateSettings(actor: string, patch: Partial<LobbySettings>): LobbyResult {
    if (actor !== this.s.hostId) return fail('not-host');
    const next = validSettings(this.s.settings, patch);
    if (!next) return fail('bad-setting');
    this.s.settings = next;
    return ok;
  }

  kick(actor: string, target: string): LobbyResult {
    if (actor !== this.s.hostId) return fail('not-host');
    if (target === actor) return fail('cannot-kick-self');
    const i = this.s.players.findIndex((p) => p.id === target);
    if (i < 0) return fail('no-such-player');
    this.s.players.splice(i, 1);
    return ok;
  }

  /** A player leaves; if it was the host, the next player becomes host. */
  leave(actor: string): void {
    const i = this.s.players.findIndex((p) => p.id === actor);
    if (i < 0) return;
    this.s.players.splice(i, 1);
    if (actor === this.s.hostId && this.s.players.length) {
      this.s.hostId = this.s.players[0].id;
      this.s.players.forEach((p) => (p.isHost = p.id === this.s.hostId));
    }
  }

  /** The host can always start; the screen asks to confirm first when allReady() is false. */
  start(actor: string): LobbyResult {
    if (actor !== this.s.hostId) return fail('not-host');
    this.s.started = true;
    return ok;
  }

  /** Everyone except the host has pressed Ready (pressing Start is the host's "ready"). */
  allReady(): boolean { return this.s.players.every((p) => p.ready || p.id === this.s.hostId); }
}

/** Placeholder players for the stage-1 preview (and the ?lobby= debug entries). */
export const PLACEHOLDER_HOST_NAME = 'Demo host';
export const PLACEHOLDER_NAMES = ['Demo player 2', 'Demo player 3', 'Demo player 4'];

/**
 * Stage 1: the room lives in this browser. As host, `create()`; as a player, `joinLocal()` puts
 * a placeholder host (and others) in the room so the player view has someone to follow.
 */
export class LocalLobbyService implements LobbyService {
  private listeners = new Set<(s: LobbyState) => void>();
  private room: LobbyRoom;
  private selfId: string;
  private left = false;

  private constructor(room: LobbyRoom, selfId: string) { this.room = room; this.selfId = selfId; }

  /** Host a new room. `placeholders`: add that many placeholder players. */
  static create(nickname: string, opts: { code?: string; placeholders?: number; colour?: ColourId } = {}): LocalLobbyService {
    const room = new LobbyRoom(opts.code ?? makeRoomCode(), nickname, opts.colour);
    const svc = new LocalLobbyService(room, room.hostId);
    for (let i = 0; i < (opts.placeholders ?? 0); i++) {
      const p = room.add(PLACEHOLDER_NAMES[i % PLACEHOLDER_NAMES.length], undefined, true);
      p.ready = i % 2 === 0; // some ready, some not
    }
    return svc;
  }

  /** Join room `code` as a player (stage 1: a local room with a placeholder host). */
  static joinLocal(nickname: string, code: string, opts: { placeholders?: number } = {}): LocalLobbyService {
    const room = new LobbyRoom(code, 'Host', undefined);
    room.state.players[0].placeholder = true;
    room.state.players[0].nickname = PLACEHOLDER_HOST_NAME;
    for (let i = 0; i < (opts.placeholders ?? 0); i++) {
      const p = room.add(PLACEHOLDER_NAMES[i % PLACEHOLDER_NAMES.length], undefined, true);
      p.ready = true;
    }
    const svc = new LocalLobbyService(room, '');
    svc.join(nickname, code);
    return svc;
  }

  getState(): LobbyState {
    const s = this.room.state;
    return { ...s, selfId: this.selfId, players: s.players.map((p) => ({ ...p })), settings: { ...s.settings } };
  }

  onChange(cb: (s: LobbyState) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit<T>(r: T): T {
    const st = this.getState();
    this.listeners.forEach((cb) => cb(st));
    return r;
  }

  join(nickname: string, code: string): LobbyResult {
    if (code !== this.room.state.code) return fail('no-such-player');
    if (this.selfId && this.room.state.players.some((p) => p.id === this.selfId)) return ok;
    try { this.selfId = this.room.add(nickname).id; } catch { return fail('room-full'); }
    this.left = false;
    return this.emit(ok);
  }

  leave(): void {
    if (this.left) return;
    this.left = true;
    this.room.leave(this.selfId);
    this.emit(undefined);
  }

  private act(f: () => LobbyResult): LobbyResult { return this.left ? fail('left') : this.emit(f()); }
  setColour(colour: ColourId): LobbyResult { return this.act(() => this.room.setColour(this.selfId, colour)); }
  setReady(ready: boolean): LobbyResult { return this.act(() => this.room.setReady(this.selfId, ready)); }
  updateSettings(patch: Partial<LobbySettings>): LobbyResult { return this.act(() => this.room.updateSettings(this.selfId, patch)); }
  kick(playerId: string): LobbyResult { return this.act(() => this.room.kick(this.selfId, playerId)); }
  start(): LobbyResult { return this.act(() => this.room.start(this.selfId)); }
  /** Everyone except the host is ready (the screen confirms before starting otherwise). */
  allReady(): boolean { return this.room.allReady(); }
}
