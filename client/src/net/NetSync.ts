/**
 * In-game online sync (stage 2): sends this player's pose at SEND_HZ (only when it changed,
 * plus a 1 s keep-alive), draws everyone else as RemotePlayers (greyed while reconnecting),
 * mirrors every hiding / search spot (drawers, sofa, bed, fridge...) both ways, applies the
 * full spot state after a reconnection, and posts short notices (left, reconnecting, new
 * host). No Phantom, no timers yet. Created by GameScene only for an online room
 * (registry 'net'); offline play never touches this.
 */
import Phaser from 'phaser';
import type { GameLink, NetPlayer } from './ColyseusLobbyService';
import { RemotePlayer } from '../objects/RemotePlayer';
import { SEND_HZ } from './protocol';
import { dirOf } from './dirOf';
import { netToast } from './NetOverlay';

export interface NetPlayerSource { x: number; y: number; getBody(): Phaser.Physics.Arcade.Body; getFacing(): { x: number; y: number } }
export interface NetSpots {
  setOpen(id: string, open: boolean): void;
  syncOpen(open: readonly string[]): void;
  onLocalToggle(cb: (id: string, open: boolean) => void): void;
}

export class NetSync {
  private remotes = new Map<string, RemotePlayer>();
  private unsubs: (() => void)[] = [];
  private lastSent = { x: NaN, y: NaN, d: -1, m: -1, at: 0 };
  private nextSend = 0;
  private lastMoveDir = 0;
  private known = new Map<string, NetPlayer>();
  private hostId: string;

  constructor(private scene: Phaser.Scene, private link: GameLink, private me: NetPlayerSource, spots: NetSpots) {
    spots.syncOpen(link.openSpots());
    spots.onLocalToggle((id, open) => link.sendSpot(id, open));
    const st = link.getState();
    this.hostId = st.hostId;
    for (const p of st.players) this.known.set(p.id, p);
    this.unsubs.push(
      link.onPoses((poses) => {
        const now = performance.now();
        for (const [id, x, y, d, m] of poses) {
          if (id === link.selfId) continue;
          this.remote(id, x, y)?.buffer.push({ t: now, x, y, d, m });
        }
      }),
      link.onSpot((id, open, by) => { if (by !== link.selfId) spots.setOpen(id, open); }),
      link.onSpots((open) => spots.syncOpen(open)),
      link.onPlayerLeft((id) => { this.remotes.get(id)?.destroy(); this.remotes.delete(id); }),
      link.onChange((s) => this.onLobby(s.players, s.hostId)),
    );
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.tick, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    scene.events.once(Phaser.Scenes.Events.DESTROY, () => this.destroy()); // game torn down (Quit)
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
    }
    return r;
  }

  private tick(): void {
    const now = performance.now();
    const list = [...this.remotes.values()];
    for (const r of list) r.update(now);
    staggerLabels(list);
    if (now < this.nextSend) return;
    this.nextSend = now + 1000 / SEND_HZ;
    const v = this.me.getBody().velocity;
    const x = Math.round(this.me.x * 10) / 10, y = Math.round(this.me.y * 10) / 10;
    const m = v.x || v.y ? 1 : 0;
    // Standing still keeps the direction it last walked (like Player's idle frame).
    const d = m ? (this.lastMoveDir = dirOf(v.x, v.y, this.me.getFacing())) : this.lastMoveDir;
    const s = this.lastSent;
    if (x === s.x && y === s.y && d === s.d && m === s.m && now - s.at < 1000) return;
    this.lastSent = { x, y, d, m, at: now };
    this.link.sendPose(x, y, d, m);
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
