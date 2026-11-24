/**
 * Colyseus room for one online house, keyed by its 6-character room code (the room id).
 * All rules live in HouseLogic; this class only wires sessions and messages to it.
 *
 * Protocol (JSON messages, no Colyseus schema state):
 *   client -> server: colour {colour} | ready {ready} | settings {patch} | kick {id} | start {}
 *                     | pos {x, y, d, m} | drawer {id, open}
 *   server -> client: welcome {selfId} | lobby PublicLobby | rejected {action, error}
 *                     | kicked {} | poses {p: [id, x, y, d, m][]} | drawer {id, open, by}
 *                     | drawers {open: id[]} | left {id}
 */
import { Client, Room, ServerError } from '@colyseus/core';
import { makeRoomCode, MAX_PLAYERS } from '../../client/src/lobby/lobby';
import { HouseLogic, RateLimiter } from './houseLogic';
import { originAllowed } from './origins';

/** Live rooms by code (room status endpoint, unique codes). */
export const ROOMS = new Map<string, HouseLogic>();

/** Position broadcast rate (the client sends at about the same rate). */
export const TICK_HZ = 12;
/** Close codes the client maps to friendly messages. */
export const CLOSE_KICKED = 4001;

export function newRoomCode(): string {
  for (let i = 0; i < 100; i++) { const c = makeRoomCode(); if (!ROOMS.has(c)) return c; }
  throw new Error('no free room code');
}

interface Limits { pos: RateLimiter; act: RateLimiter; dropped: number }

export class HouseRoom extends Room {
  maxClients = MAX_PLAYERS;
  private logic!: HouseLogic;
  private limits = new Map<string, Limits>();

  onCreate(): void {
    const code = newRoomCode();
    this.roomId = code;
    this.logic = new HouseLogic(code);
    ROOMS.set(code, this.logic);
    this.autoDispose = true;

    const lobbyAction = (type: string, f: (c: Client, m: unknown) => { ok: boolean; error?: string }) => {
      this.onMessage(type, (client, msg) => {
        if (!this.allow(client, 'act')) return;
        const r = f(client, msg);
        if (r.ok) this.broadcastLobby();
        else client.send('rejected', { action: type, error: r.error });
      });
    };
    lobbyAction('colour', (c, m) => this.logic.setColour(c.sessionId, m));
    lobbyAction('ready', (c, m) => this.logic.setReady(c.sessionId, m));
    lobbyAction('settings', (c, m) => this.logic.updateSettings(c.sessionId, m));
    lobbyAction('kick', (c, m) => {
      const r = this.logic.kick(c.sessionId, m);
      if (r.ok && r.session) {
        const target = this.clients.getById(r.session);
        target?.send('kicked', {});
        target?.leave(CLOSE_KICKED);
      }
      return r;
    });
    lobbyAction('start', (c) => {
      const r = this.logic.start(c.sessionId);
      if (r.ok) { void this.lock(); this.broadcast('drawers', { open: this.logic.openDrawers() }); }
      return r;
    });

    this.onMessage('pos', (client, msg) => {
      if (!this.allow(client, 'pos')) return;
      this.logic.move(client.sessionId, msg, Date.now());
    });
    this.onMessage('drawer', (client, msg) => {
      if (!this.allow(client, 'act')) return;
      const d = this.logic.setDrawer(client.sessionId, msg);
      if (d) this.broadcast('drawer', d);
    });
    // Anything else is ignored.
    this.onMessage('*', () => {});

    this.clock.setInterval(() => {
      const p = this.logic.takeDirtyPoses();
      if (p.length) this.broadcast('poses', { p });
    }, 1000 / TICK_HZ);
  }

  /** Per-client rate limits; a client that keeps flooding is disconnected. */
  private allow(client: Client, kind: 'pos' | 'act'): boolean {
    const l = this.limits.get(client.sessionId);
    if (!l) return false;
    if (l[kind].take(Date.now())) return true;
    if (++l.dropped > 300) client.leave(4002);
    return false;
  }

  onAuth(_client: Client, _options: unknown, context: { headers?: Record<string, unknown> }): boolean {
    const origin = context?.headers?.origin;
    if (!originAllowed(typeof origin === 'string' ? origin : undefined)) throw new ServerError(4403, 'origin');
    const why = this.logic.canJoin();
    if (why) throw new ServerError(why === 'full' ? 4409 : 4410, why);
    return true;
  }

  onJoin(client: Client, options: unknown): void {
    const r = this.logic.join(client.sessionId, options);
    if (!r.ok) throw new ServerError(r.error === 'full' ? 4409 : 4410, r.error);
    const now = Date.now();
    // Movement: 20/s sustained (the client sends ~12/s), small burst; lobby / drawer: 8/s.
    this.limits.set(client.sessionId, { pos: new RateLimiter(20, 30, now), act: new RateLimiter(8, 16, now), dropped: 0 });
    client.send('welcome', { selfId: r.playerId });
    this.broadcastLobby();
  }

  onLeave(client: Client): void {
    const id = this.logic.playerId(client.sessionId);
    this.logic.leave(client.sessionId);
    this.limits.delete(client.sessionId);
    if (id) this.broadcast('left', { id });
    this.broadcastLobby();
  }

  onDispose(): void { ROOMS.delete(this.logic.code); }

  private broadcastLobby(): void { this.broadcast('lobby', this.logic.snapshot()); }
}
