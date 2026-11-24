/**
 * Online lobby (trial of stage 2): `LobbyService` on a Colyseus room of the game server
 * (server/src/HouseRoom.ts). The server is authoritative: actions are sent as messages and the
 * screen re-renders from the `lobby` snapshots the server broadcasts. Quick local checks
 * (not host, colour taken) answer at once so the screen behaves like the offline one.
 *
 * After start, the same connection carries the game (`GameLink`, used by net/NetSync.ts).
 */
import { Client, Room } from 'colyseus.js';
import type {
  ColourId, LobbyPlayer, LobbyResult, LobbyService, LobbySettings, LobbyState,
} from '../lobby/lobby';
import { CLOSE_KICKED, JoinFailure, PoseTuple } from './protocol';
import { httpBase } from './serverConfig';

export type EndReason = 'kicked' | 'disconnected';

/** What the game scene needs from the network. */
export interface GameLink {
  readonly selfId: string;
  players(): LobbyPlayer[];
  sendPose(x: number, y: number, d: number, m: number): void;
  sendDrawer(id: string, open: boolean): void;
  /** Returns unsubscribe. */
  onPoses(cb: (p: PoseTuple[]) => void): () => void;
  onDrawer(cb: (id: string, open: boolean, by: string) => void): () => void;
  onDrawers(cb: (open: string[]) => void): () => void;
  onPlayerLeft(cb: (id: string) => void): () => void;
  /** Drawers open when the game started (sent by the server on start). */
  initialOpenDrawers(): string[];
}

type Listener<T extends unknown[]> = (...a: T) => void;
class Emitter<T extends unknown[]> {
  private s = new Set<Listener<T>>();
  on(cb: Listener<T>): () => void { this.s.add(cb); return () => this.s.delete(cb); }
  emit(...a: T): void { this.s.forEach((cb) => cb(...a)); }
}

export class JoinError extends Error {
  constructor(readonly reason: JoinFailure) { super(reason); }
}

const ok: LobbyResult = { ok: true };

export class ColyseusLobbyService implements LobbyService, GameLink {
  private state: LobbyState;
  private changes = new Emitter<[LobbyState]>();
  private ends = new Emitter<[EndReason]>();
  private poses = new Emitter<[PoseTuple[]]>();
  private drawer = new Emitter<[string, boolean, string]>();
  private drawers = new Emitter<[string[]]>();
  private leftEv = new Emitter<[string]>();
  private openAtStart: string[] = [];
  private left = false;
  private kicked = false;

  private constructor(private room: Room, readonly server: string, first: { selfId: string; lobby: Omit<LobbyState, 'selfId'> }) {
    this.state = { ...first.lobby, selfId: first.selfId };
    room.onMessage('lobby', (l: Omit<LobbyState, 'selfId'>) => { this.state = { ...l, selfId: this.state.selfId }; this.changes.emit(this.getState()); });
    room.onMessage('rejected', () => { this.changes.emit(this.getState()); }); // re-render (e.g. a colour lost in a race)
    room.onMessage('kicked', () => { this.kicked = true; });
    room.onMessage('poses', (m: { p: PoseTuple[] }) => { if (Array.isArray(m?.p)) this.poses.emit(m.p); });
    room.onMessage('drawer', (m: { id: string; open: boolean; by: string }) => this.drawer.emit(m.id, m.open, m.by));
    room.onMessage('drawers', (m: { open: string[] }) => { this.openAtStart = m.open ?? []; this.drawers.emit(this.openAtStart); });
    room.onMessage('left', (m: { id: string }) => this.leftEv.emit(m.id));
    room.onMessage('welcome', () => {});
    room.onLeave((code) => {
      if (this.left) return;
      this.left = true;
      this.ends.emit(this.kicked || code === CLOSE_KICKED ? 'kicked' : 'disconnected');
    });
  }

  /** Host a new room on `server`. */
  static create(server: string, nickname: string, colour?: ColourId): Promise<ColyseusLobbyService> {
    return ColyseusLobbyService.connect(server, (c) => c.create('house', { nickname, colour }));
  }

  /** Join room `code` on `server` (rejects with a JoinError). */
  static join(server: string, code: string, nickname: string): Promise<ColyseusLobbyService> {
    return ColyseusLobbyService.connect(server, (c) => c.joinById(code, { nickname }), code);
  }

  private static async connect(server: string, open: (c: Client) => Promise<Room>, code?: string): Promise<ColyseusLobbyService> {
    let room: Room;
    try {
      room = await open(new Client(server));
    } catch (e) {
      throw new JoinError(await ColyseusLobbyService.failure(server, e, code));
    }
    // Wait for our id and the first lobby snapshot (both sent right after the join).
    const first = await new Promise<{ selfId: string; lobby: Omit<LobbyState, 'selfId'> }>((resolve, reject) => {
      let selfId = ''; let lobby: Omit<LobbyState, 'selfId'> | null = null;
      const done = () => { if (selfId && lobby) { clearTimeout(t); resolve({ selfId, lobby }); } };
      const t = setTimeout(() => reject(new JoinError('unreachable')), 8000);
      room.onMessage('welcome', (m: { selfId: string }) => { selfId = m.selfId; done(); });
      room.onMessage('lobby', (m: Omit<LobbyState, 'selfId'>) => { lobby = m; done(); });
    }).catch((e) => { void room.leave(); throw e; });
    return new ColyseusLobbyService(room, server, first);
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

  private static async reachable(server: string): Promise<boolean> {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 5000);
      const r = await fetch(`${httpBase(server)}/health`, { cache: 'no-store', signal: ctl.signal });
      clearTimeout(t);
      return r.ok;
    } catch { return false; }
  }

  // ---- LobbyService ----

  getState(): LobbyState {
    const s = this.state;
    return { ...s, players: s.players.map((p) => ({ ...p })), settings: { ...s.settings } };
  }
  onChange(cb: (s: LobbyState) => void): () => void { return this.changes.on(cb); }
  /** Called when the room ends for this client (kicked, connection lost). */
  onEnd(cb: (r: EndReason) => void): () => void { return this.ends.on(cb); }
  get code(): string { return this.state.code; }

  join(): LobbyResult { return this.left ? { ok: false, error: 'left' } : ok; } // joined in connect()
  leave(): void {
    if (this.left) return;
    this.left = true;
    void this.room.leave(true);
  }
  private send(type: string, msg: unknown): LobbyResult {
    if (this.left) return { ok: false, error: 'left' };
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
  players(): LobbyPlayer[] { return this.getState().players; }
  sendPose(x: number, y: number, d: number, m: number): void { if (!this.left) this.room.send('pos', { x, y, d, m }); }
  sendDrawer(id: string, open: boolean): void { if (!this.left) this.room.send('drawer', { id, open }); }
  onPoses(cb: (p: PoseTuple[]) => void): () => void { return this.poses.on(cb); }
  onDrawer(cb: (id: string, open: boolean, by: string) => void): () => void { return this.drawer.on(cb); }
  onDrawers(cb: (open: string[]) => void): () => void { return this.drawers.on(cb); }
  onPlayerLeft(cb: (id: string) => void): () => void { return this.leftEv.on(cb); }
  initialOpenDrawers(): string[] { return [...this.openAtStart]; }
}
