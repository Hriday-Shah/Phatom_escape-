/**
 * Wires the item round, floor sprites, Game Controller USE-at-TV, and the
 * mini-game / paper-code overlays to GameScene.
 */
import Phaser from 'phaser';
import { debugItems, debugMinigame } from '../config/debugFlags';
import { artKeyFor, isController, itemLabel, type WorldItem } from '../logic/items';
import { ItemRound, inFrontOfTv, TV_UNIT } from '../logic/itemRound';
import { MinigameId } from '../logic/minigames';
import { CodeReveal, MinigameOverlay } from '../minigame/MinigameOverlay';
import type { HidingSpotManager } from '../objects/HidingSpotManager';
import type { GameLink } from '../net/ColyseusLobbyService';

export interface ItemHost {
  registry: Phaser.Data.DataManager;
  player: { x: number; y: number; getFacing(): { x: number; y: number } };
  hidingSpotManager: HidingSpotManager;
  add: Phaser.Scene['add'];
  time: Phaser.Scene['time'];
  textures: Phaser.Scene['textures'];
  netSync: { /* filled by GameScene */ } | null;
  getUIScene(): { setHeldItem(key: string | null): void; getJoystickDirection(): Phaser.Math.Vector2; getItemSlotBounds(): Phaser.Geom.Rectangle; getLayout(): { screen: { x: number; y: number; w: number; h: number } } };
  anims: Phaser.Animations.AnimationManager;
}

export class ItemDirector {
  readonly overlay = new MinigameOverlay();
  readonly code = new CodeReveal();
  round: ItemRound | null = null;
  private sprites = new Map<string, Phaser.GameObjects.Image>();
  private selfId = 'local';
  private net: GameLink | null = null;
  private opening = false;
  private tvHighlight?: Phaser.GameObjects.Sprite;
  private tvGlow?: Phaser.GameObjects.Sprite;
  private tvBadge?: Phaser.GameObjects.Image;

  constructor(private host: ItemHost) {}

  get open(): boolean { return this.overlay.isOpen(); }

  attach(net: GameLink | null): void {
    this.net = net;
    this.selfId = net?.selfId ?? 'local';
    const fromLobby = this.host.registry.get('fromLobby') === true;
    const debugGame = debugMinigame();
    const seed = String(this.host.registry.get('roundSeed') ?? 'local');

    const incoming = net?.round?.();
    if (incoming) this.round = ItemRound.fromPublic(incoming, this.round?.code);
    else if (fromLobby || debugItems()) this.round = ItemRound.fromSeed(seed);

    if (debugGame) {
      if (!this.round) this.round = ItemRound.fromSeed('debug-minigame');
      const c = this.round.items.find(isController);
      if (c) { c.heldBy = this.selfId; c.spotId = null; }
    }

    const hm = this.host.hidingSpotManager;
    hm.contentsLabel = (id) => {
      const it = this.round?.itemInSpot(id);
      return it ? itemLabel(it) : null;
    };
    hm.tryPickup = (id) => this.pickupFromSpot(id);
    hm.onToggle = () => this.syncSprites();

    if (net) this.listenNet(net);

    this.syncHeld();
    this.syncSprites();
    this.place();

    if (debugGame && this.round) {
      this.host.time.delayedCall(200, () => { this.place(); this.openMinigame(debugGame, true); this.place(); });
    }
    const w = window as unknown as { __PE_ITEMS__?: unknown };
    w.__PE_ITEMS__ = {
      holding: () => this.holdingController(),
      atTv: () => this.atTv(),
      open: (id?: MinigameId) => this.openMinigame(id, true),
      knownCode: () => this.code.known(),
    };
  }

  place(): void {
    const ui = this.host.getUIScene();
    if (!ui?.getLayout) return;
    const scr = ui.getLayout().screen;
    this.overlay.place(scr);
    const slot = ui.getItemSlotBounds?.();
    this.code.place(scr, slot);
  }

  atTv(): boolean {
    return inFrontOfTv(this.host.player.x, this.host.player.y);
  }

  holdingController(): boolean {
    return isController(this.round?.heldBy(this.selfId));
  }

  /** Prompt to show instead of the hiding-spot name, or null. */
  promptOverride(): string | null {
    if (this.open) return null;
    if (this.holdingController() && this.atTv()) {
      const touch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
      return touch ? 'Use Game Controller' : '[E] Use Game Controller';
    }
    return null;
  }

  onUse(): boolean {
    if (this.overlay.isOpen()) { this.overlay.confirm(); return true; }
    if (this.holdingController() && this.atTv()) { this.openMinigame(); return true; }
    return false;
  }

  onDrop(): boolean {
    if (this.overlay.isOpen() || !this.round) return false;
    const held = this.round.heldBy(this.selfId);
    if (!held) return false;
    const f = this.host.player.getFacing();
    const x = this.host.player.x + f.x * 20;
    const y = this.host.player.y + f.y * 20;
    const hl = this.host.hidingSpotManager.highlighted();
    const into = hl?.isOpen ? hl.data.id : null;
    if (this.net) this.net.sendItemDrop(x, y, into);
    else this.round.drop(this.selfId, x, y, into);
    this.syncHeld();
    this.syncSprites();
    return true;
  }

  private pickupFromSpot(spotId: string): boolean {
    if (!this.round) return false;
    const item = this.round.itemInSpot(spotId);
    if (!item) return false;
    const pose = { x: this.host.player.x, y: this.host.player.y };
    const open = this.host.hidingSpotManager.openIds();
    if (this.net) this.net.sendItemPickup(item.id);
    const r = this.round.pickup(this.selfId, item.id, pose, open);
    if (r.ok) { this.syncHeld(); this.syncSprites(); return true; }
    return false;
  }

  private openMinigame(id?: MinigameId, fromDebug = false): void {
    if (!this.round || this.overlay.isOpen() || this.opening) return;
    const pose = { x: this.host.player.x, y: this.host.player.y };
    if (!fromDebug) {
      const r = this.round.startMinigame(this.selfId, pose);
      if (!r.ok) return;
      if (this.net) this.net.sendMinigameStart();
    }
    const game = id ?? this.round.minigame;
    this.opening = true;
    this.overlay.open(game, this.round.gameSeed, {
      joystick: () => this.host.getUIScene().getJoystickDirection(),
      onWin: () => this.onWin(),
      onClose: () => { this.opening = false; },
    });
    this.opening = false;
    this.place();
  }

  private onWin(): void {
    if (!this.round) return;
    if (this.net) { this.net.sendMinigameWin(); return; }
    const code = this.round.revealLocal(this.selfId);
    if (code) this.code.reveal(code, true);
    this.place();
  }

  private listenNet(net: GameLink): void {
    net.onRound?.((r) => {
      this.round = ItemRound.fromPublic(r, this.round?.code);
      this.syncHeld();
      this.syncSprites();
    });
    net.onItems?.((items) => {
      if (!this.round) return;
      this.round.items = items.map((i) => ({ ...i, kind: i.kind as WorldItem['kind'] }));
      this.syncHeld();
      this.syncSprites();
    });
    net.onCodeReveal?.((code) => {
      this.round?.setRevealedCode(code, this.selfId);
      this.code.reveal(code, true);
      this.place();
    });
  }

  private syncHeld(): void {
    const held = this.round?.heldBy(this.selfId);
    const ui = this.host.getUIScene();
    ui?.setHeldItem?.(held ? artKeyFor(held.kind, held.variant) : null);
  }

  syncSprites(): void {
    if (!this.round) {
      this.sprites.forEach((s) => s.destroy());
      this.sprites.clear();
      return;
    }
    const open = new Set(this.host.hidingSpotManager.openIds());
    const seen = new Set<string>();
    for (const item of this.round.items) {
      const visible = !item.heldBy && (!item.spotId || open.has(item.spotId));
      if (!visible) { this.sprites.get(item.id)?.setVisible(false); continue; }
      seen.add(item.id);
      let spr = this.sprites.get(item.id);
      const key = artKeyFor(item.kind, item.variant);
      if (!spr) {
        spr = this.host.add.image(item.x, item.y, this.host.textures.exists(key) ? key : 'item_game_controller')
          .setDisplaySize(32, 32).setDepth(4);
        this.sprites.set(item.id, spr);
      }
      spr.setPosition(item.x, item.y).setVisible(true);
      if (this.host.textures.exists(key)) spr.setTexture(key);
    }
    for (const [id, spr] of this.sprites) if (!seen.has(id)) { spr.setVisible(false); }
  }

  /** World-space TV highlight, USE badge, and screen glow. Call every frame. */
  updateFx(): void {
    this.ensureTvFx();
    if (!this.tvHighlight) return;
    const holding = this.holdingController();
    const at = this.atTv();
    const playing = this.open;
    const tv = TV_UNIT;
    const showHl = holding && at && !playing;
    this.tvHighlight.setVisible(showHl).setPosition(tv.x - 4, tv.y - 4);
    if (showHl && this.tvHighlight.anims && !this.tvHighlight.anims.isPlaying) {
      this.tvHighlight.play('fx_tv_use_highlight', true);
    }
    this.tvBadge?.setVisible(showHl).setPosition(tv.x + tv.width / 2 - 25, tv.y - 24);
    const showGlow = playing;
    this.tvGlow?.setVisible(showGlow).setPosition(tv.x - 40, tv.y);
    if (showGlow && this.tvGlow && !this.tvGlow.anims.isPlaying) {
      this.tvGlow.play('fx_tv_screen_glow', true);
    }
  }

  private ensureTvFx(): void {
    if (this.tvHighlight) return;
    if (!this.host.textures.exists('fx_tv_use_highlight')) return;
    if (!this.host.anims.exists('fx_tv_use_highlight')) {
      this.host.anims.create({
        key: 'fx_tv_use_highlight',
        frames: this.host.anims.generateFrameNumbers('fx_tv_use_highlight', { start: 0, end: 1 }),
        frameRate: 6,
        repeat: -1,
      });
    }
    if (this.host.textures.exists('fx_tv_screen_glow') && !this.host.anims.exists('fx_tv_screen_glow')) {
      this.host.anims.create({
        key: 'fx_tv_screen_glow',
        frames: this.host.anims.generateFrameNumbers('fx_tv_screen_glow', { start: 0, end: 1 }),
        frameRate: 4,
        repeat: -1,
      });
    }
    this.tvHighlight = this.host.add.sprite(0, 0, 'fx_tv_use_highlight')
      .setOrigin(0, 0).setDisplaySize(48, 118).setDepth(5.5).setVisible(false);
    if (this.host.textures.exists('fx_tv_screen_glow')) {
      this.tvGlow = this.host.add.sprite(0, 0, 'fx_tv_screen_glow')
        .setOrigin(0, 0).setDisplaySize(80, 110).setDepth(3.5).setVisible(false);
    }
    if (this.host.textures.exists('ui_prompt_use_tv')) {
      this.tvBadge = this.host.add.image(0, 0, 'ui_prompt_use_tv')
        .setOrigin(0, 0).setDisplaySize(50, 22).setDepth(6).setVisible(false);
    }
  }

  destroy(): void {
    this.overlay.destroy();
    this.code.destroy();
    this.sprites.forEach((s) => s.destroy());
    this.sprites.clear();
    this.tvHighlight?.destroy();
    this.tvGlow?.destroy();
    this.tvBadge?.destroy();
  }
}
