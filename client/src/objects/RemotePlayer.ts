/**
 * Another player in an online room: same body + hoodie-tint sprites as the local Player (no
 * physics), drawn from interpolated server poses, with a nickname label. Nicknames are drawn
 * as Phaser text (never HTML).
 */
import Phaser from 'phaser';
import { PLAYER_SPRITE_SCALE } from '../config/playerConfig';
import { TextureKeys } from '../config/textureKeys';
import { PLAYER_COLOURS } from '../lobby/lobby';
import { PoseBuffer } from '../net/interpolation';
import { DIRS, INTERP_DELAY_MS } from '../net/protocol';

const tintFor = (colour: string): number => parseInt((PLAYER_COLOURS.find((c) => c.id === colour)?.hex ?? '#5FD3E6').slice(1), 16);

export class RemotePlayer {
  readonly buffer = new PoseBuffer(INTERP_DELAY_MS);
  private body: Phaser.GameObjects.Sprite;
  private tint: Phaser.GameObjects.Sprite | null;
  private label: Phaser.GameObjects.Text;
  private anim = '';
  private nickname: string;
  private away = false;
  private labelLift = 0;

  constructor(private scene: Phaser.Scene, readonly id: string, nickname: string, colour: string, x: number, y: number) {
    const art = scene.textures.exists('player') && scene.textures.exists('player_tint');
    this.tint = art ? scene.add.sprite(x, y, 'player_tint', 0).setScale(PLAYER_SPRITE_SCALE).setTint(tintFor(colour)).setDepth(8) : null;
    this.body = art
      ? scene.add.sprite(x, y, 'player', 0).setScale(PLAYER_SPRITE_SCALE).setDepth(8.5)
      : scene.add.sprite(x, y, 'ph_' + TextureKeys.PLAYER).setTint(tintFor(colour)).setDepth(8.5);
    this.nickname = nickname;
    this.label = scene.add.text(x, y - 22, nickname, {
      fontFamily: 'system-ui, sans-serif', fontSize: '9px', color: '#ffffff', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(8.6).setResolution(4);
    this.setVisible(false);
  }

  setInfo(nickname: string, colour: string, away = false): void {
    this.nickname = nickname;
    this.away = away;
    // Dropped (seat held while reconnecting): greyed name + short tag (R13-2).
    const text = away ? `${nickname} · away` : nickname;
    if (this.label.text !== text) this.label.setText(text);
    this.label.setColor(away ? '#b0b0b0' : '#ffffff');
    const a = away ? 0.4 : 1;
    this.body.setAlpha(a); this.tint?.setAlpha(a); this.label.setAlpha(away ? 0.85 : 1);
    this.tint?.setTint(tintFor(colour));
    if (!this.tint) this.body.setTint(tintFor(colour));
  }

  setVisible(v: boolean): void {
    this.body.setVisible(v); this.tint?.setVisible(v); this.label.setVisible(v);
  }

  get isAway(): boolean { return this.away; }
  get name(): string { return this.nickname; }
  /** Extra px the name is raised by (NetSync staggers overlapping labels). */
  setLabelLift(dy: number): void { this.labelLift = dy; }

  get x(): number { return this.body.x; }
  get y(): number { return this.body.y; }

  /** Draw at the interpolated pose for `now` (performance.now()). */
  update(now: number): void {
    const p = this.buffer.sample(now);
    if (!p) return;
    this.setVisible(true);
    this.body.setPosition(p.x, p.y); this.tint?.setPosition(p.x, p.y);
    this.label.setPosition(p.x, p.y - 18 - this.labelLift);
    const dir = DIRS[p.d] ?? 'down';
    if (!this.tint) return; // placeholder art: no animation
    if (p.m) {
      const key = `walk_${dir}`;
      if (this.anim !== key && this.scene.anims.exists(key)) {
        this.body.play(key, true); this.tint.play(`${key}_tint`, true); this.anim = key;
      }
    } else if (this.anim !== `idle_${dir}`) {
      const f = p.d * 4;
      this.body.stop().setFrame(f); this.tint.stop().setFrame(f); this.anim = `idle_${dir}`;
    }
  }

  destroy(): void { this.body.destroy(); this.tint?.destroy(); this.label.destroy(); }
}
