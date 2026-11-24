/**
 * In-game online sync (trial): sends this player's pose at SEND_HZ (only when it changed, plus
 * a 1 s keep-alive), draws everyone else as RemotePlayers, and mirrors drawer open / close
 * both ways. No Phantom, no timers yet. Created by GameScene only when the game came from an
 * online lobby (registry 'net'); offline play never touches this.
 */
import Phaser from 'phaser';
import type { GameLink } from './ColyseusLobbyService';
import { RemotePlayer } from '../objects/RemotePlayer';
import { SEND_HZ } from './protocol';
import { dirOf } from './dirOf';

export interface NetPlayerSource { x: number; y: number; getBody(): Phaser.Physics.Arcade.Body; getFacing(): { x: number; y: number } }
export interface NetDrawers { setOpen(id: string, open: boolean): void; onLocalToggle(cb: (id: string, open: boolean) => void): void }

export class NetSync {
  private remotes = new Map<string, RemotePlayer>();
  private unsubs: (() => void)[] = [];
  private lastSent = { x: NaN, y: NaN, d: -1, m: -1, at: 0 };
  private nextSend = 0;
  private lastMoveDir = 0;

  constructor(private scene: Phaser.Scene, private link: GameLink, private me: NetPlayerSource, drawers: NetDrawers) {
    for (const id of link.initialOpenDrawers()) drawers.setOpen(id, true);
    drawers.onLocalToggle((id, open) => link.sendDrawer(id, open));
    this.unsubs.push(
      link.onPoses((poses) => {
        const now = performance.now();
        for (const [id, x, y, d, m] of poses) {
          if (id === link.selfId) continue;
          this.remote(id, x, y)?.buffer.push({ t: now, x, y, d, m });
        }
      }),
      link.onDrawer((id, open, by) => { if (by !== link.selfId) drawers.setOpen(id, open); }),
      link.onDrawers((open) => open.forEach((id) => drawers.setOpen(id, true))),
      link.onPlayerLeft((id) => { this.remotes.get(id)?.destroy(); this.remotes.delete(id); }),
    );
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.tick, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  private remote(id: string, x: number, y: number): RemotePlayer | null {
    let r = this.remotes.get(id);
    if (!r) {
      const p = this.link.players().find((q) => q.id === id);
      if (!p) return null; // not (or no longer) in the room
      r = new RemotePlayer(this.scene, id, p.nickname, p.colour, x, y);
      this.remotes.set(id, r);
    }
    return r;
  }

  private tick(): void {
    const now = performance.now();
    for (const r of this.remotes.values()) r.update(now);
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

  /** QA: remote players' drawn positions. */
  remotePositions(): { id: string; x: number; y: number }[] {
    return [...this.remotes.values()].map((r) => ({ id: r.id, x: r.x, y: r.y }));
  }

  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.tick, this);
    this.unsubs.forEach((u) => u());
    this.remotes.forEach((r) => r.destroy());
    this.remotes.clear();
  }
}
