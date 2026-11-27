/**
 * In-game online sync (stage 2): sends this player's pose at SEND_HZ (only when it changed,
 * plus a 1 s keep-alive), draws everyone else at the newest server pose (greyed while
 * reconnecting), and nudges this body when the server slid that pose. Facing and the
 * walk/idle flag are the stick, so both phones show the same row. Mirrors every hiding /
 * search spot both ways, rolls a refused drawer back, applies the full spot state after a
 * reconnection, and posts short notices (left, reconnecting, new host). Other players stay
 * drawn; the light circle is what hides someone standing in the dark. Roles and the
 * phase clock come from the server. Created by GameScene only for an online room
 * (registry 'net'); offline play never touches this.
 */
import Phaser from 'phaser';
import type { GameLink, NetPlayer } from './ColyseusLobbyService';
import { RemotePlayer } from '../objects/RemotePlayer';
import { FLOOR_GROUND, type FloorId } from '../data/houseFloors';
import { SEND_HZ, type PhasePayload } from './protocol';
import { canMove, canSeeInside, isWaiting, type RoundRole } from '../logic/roundPhase';
import { poseIntent } from './dirOf';
import type { PoseTuple } from './protocol';
import { reconcilePose, type SentPose } from './reconcile';
import { netToast } from './NetOverlay';

export interface NetPlayerSource {
  x: number;
  y: number;
  getMoveInput(): { x: number; y: number };
  getFloor(): FloorId;
  setFloor(floor: FloorId, x?: number, y?: number): void;
  useSharedSlide(on: boolean): void;
  shift(dx: number, dy: number): void;
  /** Put the body on a pose the server already stored (reload / rejoin). */
  place(x: number, y: number, floor?: FloorId): void;
  setRole(role: RoundRole): void;
}
export interface NetSpots {
  setOpen(id: string, open: boolean): void;
  syncOpen(open: readonly string[]): void;
  onLocalToggle(cb: (id: string, open: boolean) => void): void;
}

export class NetSync {
  private remotes = new Map<string, RemotePlayer>();
  private unsubs: (() => void)[] = [];
  private lastSent = { x: NaN, y: NaN, d: -1, m: -1, f: -1, at: 0 };
  private nextSend = 0;
  private lastMoveDir = 0;
  /** Send the current pose on the next tick (the link just came back; the server never saw the last ones). */
  private resend = false;
  /** True after the first pose leaves this phone. A later own pose is not a teleport. */
  private sentOnce = false;
  /** Poses sent and not yet matched to a broadcast. Newest last. */
  private sent: SentPose[] = [];
  private known = new Map<string, NetPlayer>();
  private hostId: string;
  private mayMove = true;
  private role: RoundRole = 'player';
  private phase: PhasePayload['phase'] | null = null;
  private roles = new Map<string, RoundRole>();

  constructor(private scene: Phaser.Scene, private link: GameLink, private me: NetPlayerSource, spots: NetSpots) {
    this.me.useSharedSlide(true);
    spots.syncOpen(link.openSpots());
    spots.onLocalToggle((id, open) => link.sendSpot(id, open));
    const st = link.getState();
    this.hostId = st.hostId;
    for (const p of st.players) this.known.set(p.id, p);
    this.unsubs.push(
      link.onPoses((poses) => this.applyPoses(poses, performance.now())),
      link.onSpot((id, open, by) => { if (by !== link.selfId) spots.setOpen(id, open); }),
      link.onSpotRejected((id, open) => spots.setOpen(id, open)),
      link.onSpots((open) => spots.syncOpen(open)),
      link.onStatus((s) => { if (s === 'connected') this.resend = true; }),
      link.onPlayerLeft((id) => { this.remotes.get(id)?.destroy(); this.remotes.delete(id); }),
      link.onChange((s) => this.onLobby(s.players, s.hostId)),
      link.onPhase((view) => this.onPhase(view)),
      link.onHeld((p) => this.snapHeld(p)),
    );
    const already = link.phase();
    if (already) this.onPhase(already.view);
    // The rejoin burst was stored before this scene existed. Draw it now; later
    // broadcasts arrive through onPoses.
    this.applyPoses(link.knownPoses(), performance.now());
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.tick, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    scene.events.once(Phaser.Scenes.Events.DESTROY, () => this.destroy()); // game torn down (Quit)
  }

  /**
   * Apply a server pose list. Before this phone has sent, a reload stands on the stored
   * point. After that, our own broadcast is the slide correction the other phone draws,
   * and a far snapshot is left alone. The server places the return pose.
   */
  private applyPoses(poses: readonly PoseTuple[], now: number): void {
    const myFloor = this.me.getFloor();
    for (const row of poses) {
      const [id, x, y, d, m, fRaw] = row;
      const f = (fRaw ?? FLOOR_GROUND) as FloorId;
      if (id === this.link.selfId) {
        if (!this.sentOnce) this.me.place(x, y, f);
        else this.adopt(x, y, f);
        continue;
      }
      const remote = this.remote(id, x, y);
      if (!remote) continue;
      remote.setFloor(f);
      remote.setSameFloorVisible(f === myFloor);
      remote.buffer.push({ t: now, x, y, d, m, f });
    }
  }

  /** Roster changes during the game: grey out dropped players, notices. */
  private onLobby(players: NetPlayer[], hostId: string): void {
    const self = this.link.selfId;
    const now = new Map(players.map((p) => [p.id, p]));
    for (const [id, before] of this.known) {
      if (id === self) continue;
      const after = now.get(id);
      if (!after) netToast(`${before.nickname} left the room.`);
      else if (after.away && !before.away) netToast(`${after.nickname} lost connection: reconnecting…`);
      else if (!after.away && before.away) netToast(`${after.nickname} is back.`);
    }
    if (hostId !== this.hostId && hostId === self) netToast("The host left: you're the host now.");
    if (this.known.size > 1 && players.length === 1 && players[0].id === self) netToast('Everyone else has left the room.');
    this.known = now; this.hostId = hostId;
    for (const [id, r] of this.remotes) {
      const p = now.get(id);
      if (!p) { r.destroy(); this.remotes.delete(id); } else r.setInfo(p.nickname, p.colour, !!p.away);
    }
  }

  private remote(id: string, x: number, y: number): RemotePlayer | null {
    let r = this.remotes.get(id);
    if (!r) {
      const p = this.link.players().find((q) => q.id === id);
      if (!p) return null; // not (or no longer) in the room
      r = new RemotePlayer(this.scene, id, p.nickname, p.colour, x, y);
      if (p.away) r.setInfo(p.nickname, p.colour, true);
      this.remotes.set(id, r);
      this.applyRoleVisibility();
    }
    return r;
  }

  private onPhase(view: PhasePayload): void {
    this.phase = view.phase;
    this.roles = new Map(view.roles.map((r) => [r.id, r.role]));
    this.role = this.roles.get(this.link.selfId) ?? 'player';
    this.mayMove = canMove(this.role, view.phase);
    this.me.setRole(this.role);
    const entry = view.entries?.find((e) => e.id === this.link.selfId);
    if (entry) {
      this.me.place(entry.x, entry.y, (entry.f ?? FLOOR_GROUND) as FloorId);
      this.sent = [];
      this.sentOnce = true;
      this.lastSent = { x: entry.x, y: entry.y, d: 0, m: 0, f: entry.f ?? 0, at: performance.now() };
    } else if ((view.phase === 'chase' && this.role === 'phantom') || (view.phase === 'search' && this.role === 'player')) {
      // Let in while this phone was away: the next pose snapshot is the entrance, not a slide.
      this.sent = [];
      this.sentOnce = false;
    }
    this.applyRoleVisibility();
  }

  /** A refused walk: stand on the server pose and drop the predictions that caused it. */
  private snapHeld(p: { x: number; y: number; f: number }): void {
    const f = (p.f ?? FLOOR_GROUND) as FloorId;
    this.me.place(p.x, p.y, f);
    this.sent = [];
    this.sentOnce = true;
    this.lastSent = { x: p.x, y: p.y, d: this.lastSent.d, m: 0, f: p.f ?? 0, at: performance.now() };
  }

  private applyRoleVisibility(): void {
    const phase = this.phase ?? 'ended';
    const ICanSee = canSeeInside(this.role, phase);
    for (const [id, r] of this.remotes) {
      const them = this.roles.get(id) ?? 'player';
      r.setRole(them);
      r.setRoleVisible(ICanSee && !isWaiting(them, phase));
    }
  }

  private tick(): void {
    const now = performance.now();
    const list = [...this.remotes.values()];
    // The light circle hides anyone outside it. A wall ray between the two centres
    // was also zeroing the sprite, so a player still standing in the light vanished
    // at a doorway jamb.
    for (const r of list) r.update(now);
    this.applyRoleVisibility();
    staggerLabels(list);
    if (!this.mayMove) return;
    if (now < this.nextSend) return;
    this.nextSend = now + 1000 / SEND_HZ;
    const x = Math.round(this.me.x * 10) / 10, y = Math.round(this.me.y * 10) / 10;
    // The stick, not the velocity: held into a table this is still a walk, facing the stick.
    const input = this.me.getMoveInput();
    const intent = poseIntent(input.x, input.y, this.lastMoveDir);
    this.lastMoveDir = intent.d;
    const { d, m } = intent;
    const f = this.me.getFloor();
    const s = this.lastSent;
    if (!this.resend && x === s.x && y === s.y && d === s.d && m === s.m && f === s.f && now - s.at < 1000) return;
    this.resend = false;
    this.sentOnce = true;
    this.lastSent = { x, y, d, m, f, at: now };
    this.sent.push({ x, y });
    if (this.sent.length > 24) this.sent.shift();
    this.link.sendPose(x, y, d, m, f);
    for (const r of this.remotes.values()) {
      r.setSameFloorVisible(r.getFloor() === f);
    }
  }

  /** Our own broadcast pose: the point the other phone is drawing. */
  private adopt(x: number, y: number, floor: FloorId): void {
    const r = reconcilePose(this.sent, { x, y }, { x: this.me.x, y: this.me.y });
    this.sent = r.pending;
    if (r.dx || r.dy) this.me.shift(r.dx, r.dy);
    if (this.me.getFloor() !== floor) this.me.setFloor(floor, x, y);
  }

  /** QA: remote players' drawn positions and state. */
  remotePositions(): { id: string; x: number; y: number; away: boolean }[] {
    return [...this.remotes.values()].map((r) => ({ id: r.id, x: r.x, y: r.y, away: r.isAway }));
  }

  private destroyed = false;

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.tick, this);
    this.unsubs.forEach((u) => u());
    this.remotes.forEach((r) => r.destroy());
    this.remotes.clear();
  }
}

/** Raise later labels when two remotes would print on top of each other (R13-2). */
function staggerLabels(rs: RemotePlayer[]): void {
  const sorted = [...rs].sort((a, b) => a.x - b.x || a.y - b.y);
  for (const r of sorted) r.setLabelLift(0);
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1], b = sorted[i];
    if (Math.abs(a.x - b.x) < 80 && Math.abs(a.y - b.y) < 28) b.setLabelLift(12);
  }
}
