/**
 * Colyseus room for one online house, keyed by its 6-character room code (the room id).
 * All rules live in HouseLogic; this class only wires sessions and messages to it.
 *
 * Protocol (JSON messages, no Colyseus schema state):
 *   client -> server: colour {colour} | ready {ready} | settings {patch} | kick {id} | start {}
 *                     | pos {x, y, d, m, f} | spot {id, open}   (any hiding / search spot)
 *                     | itemPickup {id} | itemDrop {x, y, spotId}
 *                     | minigameStart {} | minigameWin {log} | minigameClose {} | minigameInput {index}
 *   server -> client: welcome {selfId} | lobby PublicLobby | rejected {action, error}
 *                     | rejected {action:'spot', id, open} (toggle refused: draw this open flag)
 *                     | kicked {} | poses {p: [id, x, y, d, m, f][]} | spot {id, open, by}
 *                     | spots {open: id[]} (full state: anything not listed is closed) | left {id}
 *                     | round {minigame, gameSeed, items} | items {items} (per-client, never every spot's contents)
 *                     | minigameStartOk {minigame, gameSeed, puzzle} | minigameReveal {index, face}
 *                     | codeReveal {code} (winner only)
 *                     | phase {phase, endsAt, serverNow, roles, result?, entries?}
 *                     | noise {id, x, y, level} (Phantom phones only, search/chase, drawer noise not off)
 *                     | held {x, y, f} (this phone may not walk in this phase; stand here)
 *
 * Drops: a client that disconnects without leaving keeps its seat for RECONNECT_SECONDS
 * (Colyseus allowReconnection; shown as `away`); a deliberate leave removes it at once.
 */
import { Client, Room, ServerError } from '@colyseus/core';
import { makeRoomCode, MAX_PLAYERS } from '../../client/src/lobby/lobby';
import { HouseLogic, RateLimiter, RECONNECT_SECONDS } from './houseLogic';
import { originAllowed } from './origins';

/** Live rooms by code (room status endpoint, unique codes). */
export const ROOMS = new Map<string, HouseLogic>();

/** Position broadcast rate (the client sends at about the same rate). */
export const TICK_HZ = 12;
/** Close codes the client maps to friendly messages. */
export const CLOSE_KICKED = 4001;
export const CLOSE_FLOOD = 4002;

export function newRoomCode(): string {
  for (let i = 0; i < 100; i++) { const c = makeRoomCode(); if (!ROOMS.has(c)) return c; }
  throw new Error('no free room code');
}

interface Limits { pos: RateLimiter; act: RateLimiter; dropped: number }

export class HouseRoom extends Room {
  maxClients = MAX_PLAYERS;
  private logic!: HouseLogic;
  private limits = new Map<string, Limits>();
  /** Sessions the server disconnected on purpose (flooding): no reconnection. */
  private noReturn = new Set<string>();
  /**
   * Newest `pos` that the rate limit refused. Applied on the next tick that has a
   * token, so a backlog cannot freeze the broadcast on an older foyer pose.
   */
  private pendingPos = new Map<string, unknown>();

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
      if (r.ok) {
        void this.lock();
        // House state goes only to clients who can see inside (Phantoms, during hiding).
        this.resyncHouse();
        this.pushPhase();
      }
      return r;
    });

    this.onMessage('pos', (client, msg) => {
      if (!this.allow(client, 'pos')) {
        this.pendingPos.set(client.sessionId, msg);
        return;
      }
      this.pendingPos.delete(client.sessionId);
      this.applyPos(client, msg, Date.now());
    });
    this.onMessage('spot', (client, msg) => {
      if (!this.allow(client, 'act')) { this.rejectSpot(client, msg); return; }
      const d = this.logic.setSpot(client.sessionId, msg);
      if (d) {
        const noise = this.logic.takeNoise();
        for (const other of this.clients) {
          const id = this.logic.playerId(other.sessionId);
          if (!id) continue;
          if (this.logic.canSeeHouse(id)) other.send('spot', { id: d.id, open: d.open, by: d.by });
          if (noise && noise.to.includes(id)) other.send('noise', { id: noise.id, x: noise.x, y: noise.y, level: noise.level });
        }
        this.sendItemsToAll();
      } else this.rejectSpot(client, msg);
      this.pushPhase();
    });
    // Heartbeat: the client's dead-connection check (and, on hosts that sleep when no inbound
    // traffic arrives, e.g. Render free, what keeps the service awake while anyone is connected).
    this.onMessage('hb', (client) => { if (this.allow(client, 'act')) client.send('hb', {}); });
    this.onMessage('itemPickup', (client, msg) => {
      if (!this.allow(client, 'act')) return;
      const r = this.logic.pickup(client.sessionId, msg);
      if (r.ok) this.sendItemsToAll();
      else client.send('rejected', { action: 'itemPickup', error: r.error });
    });
    this.onMessage('itemDrop', (client, msg) => {
      if (!this.allow(client, 'act')) return;
      const r = this.logic.dropItem(client.sessionId, msg);
      if (r.ok) this.sendItemsToAll();
      else client.send('rejected', { action: 'itemDrop', error: r.error });
    });
    this.onMessage('hideItem', (client, msg) => {
      if (!this.allow(client, 'act')) return;
      const body = msg && typeof msg === 'object' ? msg as { kind?: unknown; spotId?: unknown; variant?: unknown } : {};
      const kind = typeof body.kind === 'string' ? body.kind : '';
      const spotId = typeof body.spotId === 'string' ? body.spotId : '';
      const variant = typeof body.variant === 'string' && body.variant.length > 0 ? body.variant : undefined;
      const r = this.logic.placeHiddenItem(client.sessionId, kind, spotId, variant);
      if (r.ok) this.sendItemsToAll();
      else client.send('rejected', { action: 'hideItem', error: r.error });
    });
    this.onMessage('endHiding', (client) => {
      if (!this.allow(client, 'act')) return;
      const r = this.logic.endHiding(client.sessionId, Date.now());
      if (r.ok) this.pushPhase();
      else client.send('rejected', { action: 'endHiding', error: r.error });
    });
    this.onMessage('setPaperCode', (client, msg) => {
      if (!this.allow(client, 'act')) return;
      const r = this.logic.setPaperCode(client.sessionId, msg);
      if (!r.ok) client.send('rejected', { action: 'setPaperCode', error: r.error });
    });
    this.onMessage('unlockBedroom', (client) => {
      if (!this.allow(client, 'act')) return;
      const r = this.logic.unlockBedroom(client.sessionId);
      if (r.ok) {
        this.sendItemsToAll();
        this.pushPhase();
      } else client.send('rejected', { action: 'unlockBedroom', error: r.error });
    });
    this.onMessage('minigameStart', (client) => {
      if (!this.allow(client, 'act')) return;
      const r = this.logic.startMinigame(client.sessionId);
      if (r.ok) client.send('minigameStartOk', { minigame: r.minigame, gameSeed: r.gameSeed, puzzle: r.puzzle });
      else client.send('rejected', { action: 'minigameStart', error: r.error });
    });
    this.onMessage('minigameInput', (client, msg) => {
      if (!this.allow(client, 'act')) return;
      const r = this.logic.inputMinigame(client.sessionId, msg);
      if (r.ok && r.face != null && r.index != null) client.send('minigameReveal', { index: r.index, face: r.face });
    });
    this.onMessage('minigameWin', (client, msg) => {
      if (!this.allow(client, 'act')) return;
      const log = msg && typeof msg === 'object' && 'log' in (msg as object) ? (msg as { log: unknown }).log : msg;
      const r = this.logic.winMinigame(client.sessionId, Date.now(), log);
      // A mini-game win publishes the paper code to every player.
      if (r.ok && r.code) this.broadcast('codeReveal', { code: r.code });
      else if (!r.ok) client.send('rejected', { action: 'minigameWin', error: r.error });
    });
    this.onMessage('minigameClose', (client) => {
      if (!this.allow(client, 'act')) return;
      this.logic.cancelMinigame(client.sessionId);
    });
    // Anything else is ignored.
    this.onMessage('*', () => {});

    this.clock.setInterval(() => {
      this.pushPhase();
      this.flushPendingPoses();
      const p = this.logic.takeDirtyPoses();
      if (p.length) {
        this.sendPoses(p);
        // A player who just gained line of sight on an open spot receives its contents.
        this.sendItemsToAll();
      }
    }, 1000 / TICK_HZ);
  }

  /** Phase clock. On chase, Phantoms who were outside receive the house again. */
  private pushPhase(): void {
    const view = this.logic.takePhaseEvent(Date.now());
    if (!view) return;
    this.broadcast('phase', view);
    if (view.phase === 'search' || view.phase === 'chase') this.resyncHouse();
  }

  /** Poses a phone is allowed to see. During search a Phantom is outside the house. */
  private sendPoses(p: [string, number, number, number, number, number][]): void {
    for (const c of this.clients) {
      const id = this.logic.playerId(c.sessionId);
      if (!id) continue;
      const vis = p.filter((row) => this.logic.canSeeActor(id, row[0]));
      if (vis.length) c.send('poses', { p: vis });
    }
  }

  private resyncHouse(): void {
    const open = this.logic.openSpots();
    const poses = this.logic.allPoses();
    for (const c of this.clients) {
      const id = this.logic.playerId(c.sessionId);
      if (!id || !this.logic.canSeeHouse(id)) continue;
      c.send('spots', { open });
      c.send('items', { items: this.logic.itemListFor(id) });
      const vis = poses.filter((row) => this.logic.canSeeActor(id, row[0]));
      if (vis.length) c.send('poses', { p: vis });
    }
  }

  private applyPos(client: Client, msg: unknown, now: number): void {
    this.logic.move(client.sessionId, msg, now);
    const held = this.logic.takeHold(client.sessionId);
    if (held) client.send('held', { x: held.x, y: held.y, f: held.f });
    this.pushPhase();
  }

  /** The phone already flipped the art. Tell it the flag the room actually has. */
  private rejectSpot(client: Client, msg: unknown): void {
    const c = this.logic.spotCorrection(msg);
    if (c) client.send('rejected', { action: 'spot', id: c.id, open: c.open });
  }

  /** Apply one saved pose per session once a movement token exists. */
  private flushPendingPoses(): void {
    if (this.pendingPos.size === 0) return;
    const now = Date.now();
    for (const [sid, msg] of [...this.pendingPos]) {
      const limits = this.limits.get(sid);
      if (!limits || !limits.pos.take(now)) continue;
      this.pendingPos.delete(sid);
      const client = this.clients.getById(sid);
      if (client) this.applyPos(client, msg, now);
      else this.logic.move(sid, msg, now);
    }
  }

  /** Per-client rate limits; a client that keeps flooding is disconnected. */
  private allow(client: Client, kind: 'pos' | 'act'): boolean {
    const l = this.limits.get(client.sessionId);
    if (!l) return false;
    if (l[kind].take(Date.now())) return true;
    if (++l.dropped > 300) { this.noReturn.add(client.sessionId); client.leave(CLOSE_FLOOD); }
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

  async onLeave(client: Client, consented?: boolean): Promise<void> {
    const sid = client.sessionId;
    // Dropped (not a Leave, not kicked / flooding): hold the seat while they reconnect.
    if (!consented && !this.noReturn.has(sid) && this.logic.drop(sid)) {
      this.broadcastLobby();
      try {
        const back = await this.allowReconnection(client, RECONNECT_SECONDS);
        if (!this.logic.reconnect(sid)) { back.send('kicked', {}); back.leave(CLOSE_KICKED); return; }
        this.sendRoomState(back);
        this.broadcastLobby();
        return;
      } catch { /* window ran out: remove them below */ }
    }
    this.remove(sid);
  }

  private remove(sid: string): void {
    const id = this.logic.playerId(sid);
    this.logic.leave(sid); // host migrates to the next player
    this.limits.delete(sid);
    this.pendingPos.delete(sid);
    this.noReturn.delete(sid);
    if (id) this.broadcast('left', { id });
    if (this.logic.started) this.sendItemsToAll();
    this.broadcastLobby();
  }

  /** Send each client only the items they are allowed to see (R15-3). */
  private sendItemsToAll(): void {
    if (!this.logic.started) return;
    for (const c of this.clients) {
      const id = this.logic.playerId(c.sessionId);
      if (id) c.send('items', { items: this.logic.itemListFor(id) });
    }
  }

  /** Everything a returning client needs: its id, the lobby, and in-game spots + poses. */
  private sendRoomState(client: Client): void {
    client.send('welcome', { selfId: this.logic.playerId(client.sessionId) });
    client.send('lobby', this.logic.snapshot());
    if (this.logic.started) {
      this.logic.advance(Date.now());
      const view = this.logic.roundView();
      if (view) client.send('phase', view);
      const pid = this.logic.playerId(client.sessionId);
      const see = !pid || this.logic.canSeeHouse(pid);
      if (see) client.send('spots', { open: this.logic.openSpots() });
      const round = this.logic.roundPublic();
      if (round && see) client.send('round', round);
      if (pid && see) client.send('items', { items: this.logic.itemListFor(pid) });
      this.sendPublicCode(client);
      if (see) {
        const p = this.logic.allPoses().filter((row) => !pid || this.logic.canSeeActor(pid, row[0]));
        if (p.length) client.send('poses', { p });
      }
    }
  }

  onDispose(): void { ROOMS.delete(this.logic.code); }

  private sendPublicCode(client?: Client): void {
    const view = this.logic.roundView();
    if (!view?.codePublic || !view.code) return;
    if (client) client.send('codeReveal', { code: view.code });
    else this.broadcast('codeReveal', { code: view.code });
  }

  private broadcastLobby(): void { this.broadcast('lobby', this.logic.snapshot()); }
}
