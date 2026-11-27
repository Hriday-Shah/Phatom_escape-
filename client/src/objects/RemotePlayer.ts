/**
 * Another player in an online room: same body + hoodie-tint sprites as the local Player (no
 * physics), drawn at the newest server pose, with a nickname label. Nicknames are drawn
 * as Phaser text (never HTML).
 */
import Phaser from 'phaser';
import { PLAYER_SPRITE_SCALE } from '../config/playerConfig';
import { TextureKeys } from '../config/textureKeys';
import { PLAYER_COLOURS } from '../lobby/lobby';
import { PoseBuffer } from '../net/interpolation';
import { FLOOR_GROUND, type FloorId } from '../data/houseFloors';
import { DIRS, INTERP_DELAY_MS } from '../net/protocol';
import type { RoundRole } from '../logic/roundPhase';
import { walkAnimKey } from '../logic/roundPhase';
import { ensureCharacterAnims } from './characterAnims';

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
  private floorLevel: FloorId = FLOOR_GROUND;
  private sameFloorVisible = true;
  /** Search hides Phantoms from the house, and hides the house from a Phantom. */
  private roleVisible = true;
  private role: RoundRole = 'player';
  private showPhantomMark = false;

  constructor(private scene: Phaser.Scene, readonly id: string, nickname: string, colour: string, x: number, y: number) {
    const art = scene.textures.exists('player') && scene.textures.exists('player_tint');
    this.tint = art ? scene.add.sprite(x, y, 'player_tint', 0).setScale(PLAYER_SPRITE_SCALE).setTint(tintFor(colour)).setDepth(8) : null;
    this.body = art
      ? scene.add.sprite(x, y, 'player', 0).setScale(PLAYER_SPRITE_SCALE).setDepth(8.5)
      : scene.add.sprite(x, y, 'ph_' + TextureKeys.PLAYER).setTint(tintFor(colour)).setDepth(8.5);
    ensureCharacterAnims(scene);
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
    this.refreshLabel();
    this.tint?.setTint(tintFor(colour));
    if (!this.tint) this.body.setTint(tintFor(colour));
    this.applyAlpha();
  }

  private applyAlpha(): void {
    const a = this.away ? 0.4 : 1;
    this.body.setAlpha(a);
    this.tint?.setAlpha(a);
    this.label.setAlpha(this.away ? 0.85 : 1);
  }

  setVisible(v: boolean): void {
    const show = v && this.sameFloorVisible && this.roleVisible;
    this.body.setVisible(show); this.tint?.setVisible(show); this.label.setVisible(show);
  }

  setFloor(floor: FloorId): void {
    this.floorLevel = floor;
  }

  getFloor(): FloorId {
    return this.floorLevel;
  }

  setSameFloorVisible(v: boolean): void {
    this.sameFloorVisible = v;
  }

  setPhantomMark(on: boolean): void {
    if (this.showPhantomMark === on) return;
    this.showPhantomMark = on;
    this.refreshLabel();
  }

  private refreshLabel(): void {
    let text = this.nickname;
    if (this.away) text = `${this.nickname} · away`;
    else if (this.showPhantomMark) text = `${this.nickname} · Phantom`;
    if (this.label.text !== text) this.label.setText(text);
    this.label.setColor(this.away ? '#b0b0b0' : this.showPhantomMark ? '#ffb4b4' : '#ffffff');
  }

  setRoleVisible(v: boolean): void {
    this.roleVisible = v;
    if (!v) this.setVisible(false);
  }

  get isAway(): boolean { return this.away; }
  get name(): string { return this.nickname; }
  /** Extra px the name is raised by (NetSync staggers overlapping labels). */
  setLabelLift(dy: number): void { this.labelLift = dy; }

  get x(): number { return this.body.x; }
  get y(): number { return this.body.y; }

  setRole(role: RoundRole): void {
    if (role === this.role) return;
    this.role = role;
    ensureCharacterAnims(this.scene);
    const phantomArt = role === 'phantom' && this.scene.textures.exists('phantom');
    this.anim = '';
    if (phantomArt) {
      this.body.setTexture('phantom', 0).setScale(PLAYER_SPRITE_SCALE);
      if (this.tint) this.tint.setVisible(false);
    } else if (this.scene.textures.exists('player')) {
      this.body.setTexture('player', 0).setScale(PLAYER_SPRITE_SCALE);
      if (this.tint) {
        this.tint.setVisible(this.roleVisible && this.sameFloorVisible);
        this.tint.setTexture('player_tint', 0);
      }
    }
  }

  /** Draw at the interpolated pose for `now` (performance.now()). */
  update(now: number): void {
    const p = this.buffer.sample(now);
    if (!p) return;
    this.setVisible(true);
    this.body.setPosition(p.x, p.y); this.tint?.setPosition(p.x, p.y);
    this.label.setPosition(p.x, p.y - 18 - this.labelLift);
    const dir = DIRS[p.d] ?? 'down';
    const phantomArt = this.role === 'phantom' && this.scene.textures.exists('phantom');
    const hasArt = phantomArt || !!this.tint;
    if (!hasArt) return; // placeholder art: no animation
    if (p.m) {
      const key = walkAnimKey(this.role, dir);
      if (this.anim !== key && this.scene.anims.exists(key)) {
        this.body.play(key, true);
        if (this.tint && !phantomArt) this.tint.play(`${key}_tint`, true);
        this.anim = key;
      }
    } else if (this.anim !== `idle_${dir}`) {
      const f = p.d * 4;
      this.body.stop().setFrame(f);
      if (this.tint && !phantomArt) this.tint.stop().setFrame(f);
      this.anim = `idle_${dir}`;
    }
  }

  destroy(): void { this.body.destroy(); this.tint?.destroy(); this.label.destroy(); }
}
