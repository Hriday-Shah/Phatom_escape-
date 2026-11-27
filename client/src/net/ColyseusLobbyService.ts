/**
 * Online lobby + game link (stage 2): `LobbyService` on a Colyseus room of the game server
 * (server/src/HouseRoom.ts). The server is authoritative: actions are sent as messages and the
 * screen re-renders from the `lobby` snapshots the server broadcasts. Quick local checks
 * (not host, colour taken) answer at once so the screen behaves like the offline one.
 *
 * Drops: when the connection is lost without a deliberate Leave, this reconnects with the
 * room's reconnection token (the server keeps the seat ~30 s), reporting `onStatus`
 * ('reconnecting' / 'connected'); when that fails, `onEnd('lost')`. The token is also kept in
 * sessionStorage so reloading the tab rejoins the same seat (`ColyseusLobbyService.resume`).
 */
import { Client, Room } from 'colyseus.js';
import type {
  ColourId, LobbyPlayer, LobbyResult, LobbyService, LobbySettings, LobbyState,
} from '../lobby/lobby';
import {
  CLOSE_CONSENTED, HEARTBEAT_MS, WAKE_MAX_MS, SILENCE_DROP_MS, CLOSE_FLOOD, CLOSE_KICKED, JoinFailure, ItemPayload, NoisePayload, PhasePayload, PoseTuple, RECONNECT_RETRY_MS, RECONNECT_WINDOW_MS, RoundPayload,
} from './protocol';
import type { EscapeCode } from '../logic/escapeCode';
import type { RoundPublic } from '../logic/itemRound';
import type { LogEvent, PlayView } from '../logic/minigames/replay';
import { httpBase } from './serverConfig';

/** kicked by the host; lost = could not reconnect in time; closed = the server closed the room. */
export type EndReason = 'kicked' | 'lost' | 'closed';
export type NetStatus = 'connected' | 'reconnecting';
/** A player as the server shows it: `away` while reconnecting (seat held). */
export type NetPlayer = LobbyPlayer & { away?: boolean };

/** What the game scene needs from the network. */
export interface GameLink {
  readonly selfId: string;
  players(): NetPlayer[];
  getState(): LobbyState;
  sendPose(x: number, y: number, d: number, m: number, f?: number): void;
  /** Open / close of any hiding or search spot (drawer, sofa cushion, bed, fridge...). */
  sendSpot(id: string, open: boolean): void;
  /** Returns unsubscribe. */
  onPoses(cb: (p: PoseTuple[]) => void): () => void;
  onSpot(cb: (id: string, open: boolean, by: string) => void): () => void;
  /** The server refused this phone's toggle. `open` is the flag to draw. */
  onSpotRejected(cb: (id: string, open: boolean) => void): () => void;
  /** Full spot state (on start and after a reconnection): listed = open, anything else closed. */
  onSpots(cb: (open: string[]) => void): () => void;
  onPlayerLeft(cb: (id: string) => void): () => void;
  onChange(cb: (s: LobbyState) => void): () => void;
  onStatus(cb: (s: NetStatus) => void): () => void;
  onEnd(cb: (r: EndReason) => void): () => void;
  /** Open spots as last received (the scene applies them when it starts). */
  openSpots(): string[];
  /** This phone's pose from the last server snapshot, if one has arrived (reload / rejoin). */
  selfPose(): { x: number; y: number } | null;
  /** Every pose from that snapshot, so a reloaded house can draw the others at once. */
  knownPoses(): PoseTuple[];
  leave(): void;
  /** Round snapshot (mini-game + items) captured at start, if the server sent one. */
  round(): RoundPublic | null;
  sendItemPickup(id: string): void;
  sendItemDrop(x: number, y: number, spotId?: string | null): void;
  sendHideItem(kind: string, spotId: string, variant?: string): void;
  sendMinigameStart(): void;
  sendMinigameWin(log: LogEvent[]): void;
  sendMinigameClose(): void;
  sendMinigameInput(index: number): void;
  onRound(cb: (r: RoundPublic) => void): () => void;
  onItems(cb: (items: ItemPayload[]) => void): () => void;
  onCodeReveal(cb: (code: EscapeCode) => void): () => void;
  onMinigameStartOk(cb: (m: { minigame: string; gameSeed: number; puzzle: PlayView }) => void): () => void;
  onMinigameReveal(cb: (m: { index: number; face: number }) => void): () => void;
  /** Phase name, roles, and the server clock. `at` is performance.now() when it arrived. */
  onPhase(cb: (view: PhasePayload, at: number) => void): () => void;
  phase(): { view: PhasePayload; at: number } | null;
  /** Drawer ripple for a Phantom phone. */
  onNoise(cb: (n: NoisePayload) => void): () => void;
  /** Stand here: this phase does not allow the move the phone just sent. */
  onHeld(cb: (p: { x: number; y: number; f: number }) => void): () => void;
  /** Server refused a hideItem request (bedroom rules, taken spot, …). */
  onHideRejected(cb: (error: string) => void): () => void;
}

type Listener<T extends unknown[]> = (...a: T) => void;
class Emitter<T extends unknown[]> {
  private s = new Set<Listener<T>>();
  on(cb: Listener<T>): () => void { this.s.add(cb); return () => this.s.delete(cb); }
  emit(...a: T): void { this.s.forEach((cb) => cb(...a)); }
  clear(): void { this.s.clear(); }
}

export class JoinError extends Error {
  constructor(readonly reason: JoinFailure) { super(reason); }
}

/** sessionStorage: the seat to rejoin after a reload. */
export const SEAT_KEY = 'pe.seat';
interface Seat { server: string; code: string; token: string }
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const session = (): Store | null => { try { return sessionStorage; } catch { return null; } };
export function loadSeat(server: string, store: Store | null = session()): Seat | null {
  try {
    const s = JSON.parse(store?.getItem(SEAT_KEY) ?? 'null');
    return s && s.server === server && typeof s.token === 'string' && typeof s.code === 'string' ? s : null;
  } catch { return null; }
}
function saveSeat(seat: Seat | null, store: Store | null = session()): void {
  try { if (seat) store?.setItem(SEAT_KEY, JSON.stringify(seat)); else store?.removeItem(SEAT_KEY); } catch { /* blocked */ }
}

const ok: LobbyResult = { ok: true };
type First = { selfId: string; lobby: Omit<LobbyState, 'selfId'> };
/** Spots and poses that arrived with welcome/lobby, before the room is attached. */
type EarlyRoom = { open: string[] | null; poses: PoseTuple[]; phase: { view: PhasePayload; at: number } | null };

export class ColyseusLobbyService implements LobbyService, GameLink {
  private state: LobbyState;
  private room!: Room;
  private changes = new Emitter<[LobbyState]>();
  private ends = new Emitter<[EndReason]>();
  private statuses = new Emitter<[NetStatus]>();
  private poses = new Emitter<[PoseTuple[]]>();
  private spot = new Emitter<[string, boolean, string]>();
  private spotRejected = new Emitter<[string, boolean]>();
  private spots = new Emitter<[string[]]>();
  /** Latest pose per player, including this phone (a reload spawns there). */
  private poseById = new Map<string, PoseTuple>();
  private leftEv = new Emitter<[string]>();
  private open: string[] = [];
  private left = false;
  private kicked = false;
  private ended = false;
  status: NetStatus = 'connected';
  /** Set by main.ts once the house is running (the lobby screen is gone by then). */
  inGame = false;
  private roundState: RoundPublic | null = null;
  private roundEv = new Emitter<[RoundPublic]>();
  private itemsEv = new Emitter<[ItemPayload[]]>();
  private codeEv = new Emitter<[EscapeCode]>();
  private startOkEv = new Emitter<[{ minigame: string; gameSeed: number; puzzle: PlayView }]>();
  private revealEv = new Emitter<[{ index: number; face: number }]>();
  private phaseEv = new Emitter<[PhasePayload, number]>();
  private noiseEv = new Emitter<[NoisePayload]>();
  private heldEv = new Emitter<[{ x: number; y: number; f: number }]>();
  private hideRejectedEv = new Emitter<[string]>();
  private phaseState: { view: PhasePayload; at: number } | null = null;

  private constructor(room: Room, readonly server: string, first: First, early: EarlyRoom, stopEarly: () => void) {
    this.state = { ...first.lobby, selfId: first.selfId };
    // Copied, then the burst handlers are removed, before attach() adds the live ones.
    if (early.open) this.open = early.open;
    if (early.phase) this.phaseState = early.phase;
    for (const p of early.poses) this.rememberPose(p);
    stopEarly();
    this.attach(room);
  }

  /** Wire a (new or reconnected) room to this service. */
  private attach(room: Room): void {
    this.room = room;
    saveSeat({ server: this.server, code: this.state.code, token: room.reconnectionToken });
    room.onMessage('lobby', (l: Omit<LobbyState, 'selfId'>) => { this.state = { ...l, selfId: this.state.selfId }; this.changes.emit(this.getState()); });
    room.onMessage('welcome', (m: { selfId: string }) => { if (m?.selfId) this.state = { ...this.state, selfId: m.selfId }; });
    room.onMessage('rejected', (m: { action?: string; id?: string; open?: boolean; error?: string }) => {
      this.changes.emit(this.getState()); // re-render (e.g. a colour lost in a race)
      if (m?.action === 'spot' && typeof m.id === 'string' && typeof m.open === 'boolean') {
        this.open = m.open ? [...new Set([...this.open, m.id])] : this.open.filter((x) => x !== m.id);
        this.spotRejected.emit(m.id, m.open);
      }
      if (m?.action === 'hideItem' && typeof m.error === 'string') {
        this.hideRejectedEv.emit(m.error);
      }
    });
    room.onMessage('kicked', () => { this.kicked = true; });
    room.onMessage('poses', (m: { p: PoseTuple[] }) => {
      if (!Array.isArray(m?.p)) return;
      for (const p of m.p) this.rememberPose(p);
      this.poses.emit(m.p);
    });
    room.onMessage('spot', (m: { id: string; open: boolean; by: string }) => {
      this.open = m.open ? [...new Set([...this.open, m.id])] : this.open.filter((x) => x !== m.id);
      this.spot.emit(m.id, m.open, m.by);
    });
    room.onMessage('spots', (m: { open: string[] }) => { this.open = Array.isArray(m?.open) ? m.open : []; this.spots.emit(this.open); });
    room.onMessage('left', (m: { id: string }) => this.leftEv.emit(m.id));
    room.onMessage('round', (m: RoundPayload) => {
      if (!m || !m.minigame || !Array.isArray(m.items)) return;
      this.roundState = m as RoundPublic;
      this.roundEv.emit(this.roundState);
    });
    room.onMessage('items', (m: { items: ItemPayload[] }) => {
      if (Array.isArray(m?.items)) {
        if (this.roundState) this.roundState = { ...this.roundState, items: m.items as RoundPublic['items'] };
        this.itemsEv.emit(m.items);
      }
    });
    room.onMessage('codeReveal', (m: { code: EscapeCode }) => { if (m?.code) this.codeEv.emit(m.code); });
    room.onMessage('minigameStartOk', (m: { minigame: string; gameSeed: number; puzzle: PlayView }) => {
      if (m?.puzzle) this.startOkEv.emit(m);
    });
    room.onMessage('minigameReveal', (m: { index: number; face: number }) => {
      if (m && Number.isFinite(m.index) && Number.isFinite(m.face)) this.revealEv.emit(m);
    });
    room.onMessage('hb', () => {});
    room.onMessage('phase', (m: PhasePayload) => this.rememberPhase(m));
    room.onMessage('noise', (m: NoisePayload) => {
      if (m && typeof m.id === 'string' && Number.isFinite(m.x) && Number.isFinite(m.y)) this.noiseEv.emit(m);
    });
    room.onMessage('held', (m: { x: number; y: number; f: number }) => {
      if (m && Number.isFinite(m.x) && Number.isFinite(m.y)) this.heldEv.emit(m);
    });
    this.watch(room);
    room.onLeave((code) => {
      if (room !== this.room || this.left || this.ended || this.status === 'reconnecting') return;
      if (this.kicked || code === CLOSE_KICKED) return this.end('kicked');
      if (code === CLOSE_CONSENTED) return this.end('closed');
      if (code === CLOSE_FLOOD) return this.end('lost');
      void this.reconnectLoop();
    });
  }

  private hbTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Dead-connection check: a heartbeat every HEARTBEAT_MS; any message from the server counts
   * as life. A socket that goes silent (network gone: no close event for a long time) is
   * treated as dropped after SILENCE_DROP_MS and the reconnection starts.
   */
  private watch(room: Room): void {
    if (this.hbTimer) clearInterval(this.hbTimer);
    let last = Date.now();
    room.onMessage('*', () => { last = Date.now(); });
    for (const t of ['lobby', 'poses', 'spot', 'spots', 'hb', 'left', 'welcome', 'phase']) room.onMessage(t, () => { last = Date.now(); });
    this.hbTimer = setInterval(() => {
      if (room !== this.room || this.left || this.ended) { clearInterval(this.hbTimer!); this.hbTimer = null; return; }
      if (this.status !== 'connected') return;
      if (Date.now() - last > SILENCE_DROP_MS) {
        clearInterval(this.hbTimer!); this.hbTimer = null;
        this.room = room; // keep its token for the reconnection
        try { room.connection.close(); } catch { /* already closing */ }
        void this.reconnectLoop();
        return;
      }
      if (room.connection.isOpen) room.send('hb', {});
    }, HEARTBEAT_MS);
  }

  private end(r: EndReason): void {
    if (this.ended) return;
    this.ended = true;
    saveSeat(null);
    this.ends.emit(r);
  }

  /** Dropped: retry with the reconnection token until the server's seat window runs out. */
  private async reconnectLoop(): Promise<void> {
    if (this.status === 'reconnecting') return; // already retrying (watchdog + late close event)
    this.status = 'reconnecting';
    this.statuses.emit('reconnecting');
    const until = Date.now() + RECONNECT_WINDOW_MS;
    const token = this.room.reconnectionToken;
    while (!this.left && Date.now() < until) {
      try {
        const room = await new Client(this.server).reconnect(token);
        if (this.left) { void room.leave(true); return; }
        this.attach(room);
        this.status = 'connected';
        this.statuses.emit('connected');
        return;
      } catch (e) {
        // Room gone: stop at once. "Invalid or expired" can also mean the server hasn't noticed
        // the drop yet (no seat held so far), so that one keeps retrying until the window ends.
        if (/disposed|not found/i.test(String((e as any)?.message ?? ''))) break;
        await new Promise((r) => setTimeout(r, RECONNECT_RETRY_MS));
      }
    }
    if (!this.left) this.end('lost');
  }

  /** Host a new room on `server`. */
  static create(server: string, nickname: string, colour?: ColourId): Promise<ColyseusLobbyService> {
    return ColyseusLobbyService.connect(server, (c) => c.create('house', { nickname, colour }));
  }

  /** Join room `code` on `server` (rejects with a JoinError). */
  static join(server: string, code: string, nickname: string): Promise<ColyseusLobbyService> {
    return ColyseusLobbyService.connect(server, (c) => c.joinById(code, { nickname }), code);
  }

  /** After a reload: take back the seat kept in sessionStorage, or null (seat gone / none). */
  static async resume(server: string): Promise<ColyseusLobbyService | null> {
    const seat = loadSeat(server);
    if (!seat) return null;
    try {
      return await ColyseusLobbyService.connect(server, (c) => c.reconnect(seat.token));
    } catch {
      saveSeat(null);
      return null;
    }
  }

  private static async connect(server: string, open: (c: Client) => Promise<Room>, code?: string): Promise<ColyseusLobbyService> {
    let room: Room;
    try {
      room = await open(new Client(server));
    } catch (e) {
      throw new JoinError(await ColyseusLobbyService.failure(server, e, code));
    }
    // Wait for our id and the first lobby snapshot (both sent right after the join).
    const early: EarlyRoom = { open: null, poses: [], phase: null };
    let stopSpots = () => {};
    let stopPoses = () => {};
    let stopPhase = () => {};
    const first = await new Promise<First>((resolve, reject) => {
      let selfId = ''; let lobby: Omit<LobbyState, 'selfId'> | null = null;
      const done = () => { if (selfId && lobby) { clearTimeout(t); resolve({ selfId, lobby }); } };
      const t = setTimeout(() => reject(new JoinError('unreachable')), 8000);
      room.onMessage('welcome', (m: { selfId: string }) => { selfId = m.selfId; done(); });
      room.onMessage('lobby', (m: Omit<LobbyState, 'selfId'>) => { lobby = m; done(); });
      // The rejoin burst (spots + poses) can arrive in the same turn as lobby, before attach().
      stopSpots = room.onMessage('spots', (m: { open?: string[] }) => { early.open = Array.isArray(m?.open) ? m.open : []; });
      stopPoses = room.onMessage('poses', (m: { p?: PoseTuple[] }) => { if (Array.isArray(m?.p)) early.poses.push(...m.p); });
      stopPhase = room.onMessage('phase', (m: PhasePayload) => { if (m?.phase) early.phase = { view: m, at: performance.now() }; });
    }).catch((e) => { void room.leave(); throw e; });
    const svc = new ColyseusLobbyService(room, server, first, early, () => { stopSpots(); stopPoses(); stopPhase(); });
    return svc;
  }

  /** Map a failed create / join to a friendly reason (asks the server's room status). */
  private static async failure(server: string, e: unknown, code?: string): Promise<JoinFailure> {
    const msg = String((e as any)?.message ?? e ?? '');
    const errCode = Number((e as any)?.code);
    if (/not found/i.test(msg)) return 'not-found';
    if (errCode === 4409 || /\bfull\b/.test(msg)) return 'full';
    if (errCode === 4410 || /started/.test(msg)) return 'started';
    if (code) {
      try {
        const r = await fetch(`${httpBase(server)}/rooms/${encodeURIComponent(code)}`, { cache: 'no-store' });
        const st = (await r.json())?.status;
        if (st === 'missing') return 'not-found';
        if (st === 'full' || st === 'started') return st;
        if (st === 'open') return 'unknown';
      } catch { return 'unreachable'; }
    }
    if (/locked/i.test(msg)) return 'full';
    // Anything else: unreachable unless the server answers its health check.
    return (await ColyseusLobbyService.reachable(server)) ? 'unknown' : 'unreachable';
  }

  static async reachable(server: string): Promise<boolean> {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 5000);
      const r = await fetch(`${httpBase(server)}/health`, { cache: 'no-store', signal: ctl.signal });
      clearTimeout(t);
      // A host's own "starting up" page is not the server: only its JSON health answer counts.
      return r.ok && (await r.json().catch(() => null))?.ok === true;
    } catch { return false; }
  }

  /**
   * Free hosts sleep when idle (Render free: ~1 min to wake). Poll the health check for up to
   * `maxMs`; `onWaiting` is called once if the first try fails. Resolves false if it never answers.
   */
  static async wake(server: string, onWaiting: () => void, maxMs = WAKE_MAX_MS, cancelled = () => false): Promise<boolean> {
    const until = Date.now() + maxMs;
    if (await ColyseusLobbyService.reachable(server)) return true;
    onWaiting();
    while (Date.now() < until && !cancelled()) {
      await new Promise((r) => setTimeout(r, 2500));
      if (await ColyseusLobbyService.reachable(server)) return true;
    }
    return false;
  }

  // ---- LobbyService ----

  getState(): LobbyState {
    const s = this.state;
    return { ...s, players: s.players.map((p) => ({ ...p })), settings: { ...s.settings } };
  }
  onChange(cb: (s: LobbyState) => void): () => void { return this.changes.on(cb); }
  /** Called when the room ends for this client (kicked, connection lost, room closed). */
  onEnd(cb: (r: EndReason) => void): () => void { return this.ends.on(cb); }
  onStatus(cb: (s: NetStatus) => void): () => void { return this.statuses.on(cb); }
  get code(): string { return this.state.code; }

  join(): LobbyResult { return this.left ? { ok: false, error: 'left' } : ok; } // joined in connect()
  /** Deliberate leave: the server removes this player at once (no seat kept). */
  leave(): void {
    if (this.left) return;
    this.left = true;
    saveSeat(null);
    // Nothing more reaches the (torn-down) lobby / game after a deliberate leave.
    for (const e of [this.changes, this.poses, this.spot, this.spotRejected, this.spots, this.leftEv, this.ends, this.statuses, this.phaseEv, this.noiseEv, this.heldEv]) e.clear();
    if (this.hbTimer) { clearInterval(this.hbTimer); this.hbTimer = null; }
    if (this.room.connection.isOpen) void this.room.leave(true); // else already gone (ended / dropped)
  }
  private send(type: string, msg: unknown): LobbyResult {
    if (this.left) return { ok: false, error: 'left' };
    // Dropped (or the socket is closing): the server state comes back on reconnect.
    if (this.status !== 'connected' || !this.room.connection.isOpen) return ok;
    this.room.send(type, msg);
    return ok;
  }
  private isHost(): boolean { return this.state.selfId === this.state.hostId; }
  setColour(colour: ColourId): LobbyResult {
    if (this.state.players.some((p) => p.colour === colour && p.id !== this.state.selfId)) return { ok: false, error: 'colour-taken' };
    return this.send('colour', { colour });
  }
  setReady(ready: boolean): LobbyResult { return this.send('ready', { ready }); }
  updateSettings(patch: Partial<LobbySettings>): LobbyResult { return this.isHost() ? this.send('settings', { patch }) : { ok: false, error: 'not-host' }; }
  kick(playerId: string): LobbyResult {
    if (!this.isHost()) return { ok: false, error: 'not-host' };
    if (playerId === this.state.selfId) return { ok: false, error: 'cannot-kick-self' };
    return this.send('kick', { id: playerId });
  }
  start(): LobbyResult { return this.isHost() ? this.send('start', {}) : { ok: false, error: 'not-host' }; }
  allReady(): boolean { return this.state.players.every((p) => p.ready || p.id === this.state.hostId); }

  // ---- GameLink ----

  get selfId(): string { return this.state.selfId; }
  players(): NetPlayer[] { return this.getState().players; }
  sendPose(x: number, y: number, d: number, m: number, f = 0): void { this.send('pos', { x, y, d, m, f }); }
  sendSpot(id: string, open: boolean): void { this.send('spot', { id, open }); }
  onPoses(cb: (p: PoseTuple[]) => void): () => void { return this.poses.on(cb); }
  onSpot(cb: (id: string, open: boolean, by: string) => void): () => void { return this.spot.on(cb); }
  onSpotRejected(cb: (id: string, open: boolean) => void): () => void { return this.spotRejected.on(cb); }
  onSpots(cb: (open: string[]) => void): () => void { return this.spots.on(cb); }
  private rememberPose(p: PoseTuple): void { this.poseById.set(p[0], p); }
  selfPose(): { x: number; y: number } | null {
    const p = this.poseById.get(this.state.selfId);
    return p ? { x: p[1], y: p[2] } : null;
  }
  knownPoses(): PoseTuple[] { return [...this.poseById.values()]; }
  onPlayerLeft(cb: (id: string) => void): () => void { return this.leftEv.on(cb); }
  openSpots(): string[] { return [...this.open]; }
  round(): RoundPublic | null { return this.roundState; }
  sendItemPickup(id: string): void { if (!this.left) this.room.send('itemPickup', { id }); }
  sendHideItem(kind: string, spotId: string, variant?: string): void {
    if (!this.left) this.room.send('hideItem', { kind, spotId, ...(variant ? { variant } : {}) });
  }
  sendItemDrop(x: number, y: number, spotId?: string | null): void { if (!this.left) this.room.send('itemDrop', { x, y, spotId: spotId ?? null }); }
  sendMinigameStart(): void { if (!this.left) this.room.send('minigameStart', {}); }
  sendMinigameWin(log: LogEvent[]): void { if (!this.left) this.room.send('minigameWin', { log }); }
  sendMinigameClose(): void { if (!this.left) this.room.send('minigameClose', {}); }
  sendMinigameInput(index: number): void { if (!this.left) this.room.send('minigameInput', { index }); }
  onRound(cb: (r: RoundPublic) => void): () => void { return this.roundEv.on(cb); }
  onItems(cb: (items: ItemPayload[]) => void): () => void { return this.itemsEv.on(cb); }
  onCodeReveal(cb: (code: EscapeCode) => void): () => void { return this.codeEv.on(cb); }
  onMinigameStartOk(cb: (m: { minigame: string; gameSeed: number; puzzle: PlayView }) => void): () => void { return this.startOkEv.on(cb); }
  onMinigameReveal(cb: (m: { index: number; face: number }) => void): () => void { return this.revealEv.on(cb); }
  onPhase(cb: (view: PhasePayload, at: number) => void): () => void { return this.phaseEv.on(cb); }
  phase(): { view: PhasePayload; at: number } | null { return this.phaseState; }
  onNoise(cb: (n: NoisePayload) => void): () => void { return this.noiseEv.on(cb); }
  onHeld(cb: (p: { x: number; y: number; f: number }) => void): () => void { return this.heldEv.on(cb); }
  onHideRejected(cb: (error: string) => void): () => void { return this.hideRejectedEv.on(cb); }

  private rememberPhase(m: PhasePayload): void {
    if (!m?.phase || !Array.isArray(m.roles)) return;
    const at = performance.now();
    this.phaseState = { view: m, at };
    this.phaseEv.emit(m, at);
  }
}
