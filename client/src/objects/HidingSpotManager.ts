import Phaser from 'phaser';
import { HidingSpot, houseLayout } from '../data/houseLayout';
import { DRAWER_UNITS, DrawerUnit, baseTextureKey, sectionOpenTextureKey } from '../data/drawerSlices';
import { HIDING_SPOT_TEXTURES } from '../utils/artHelpers';
import { spriteCenter, spotRotation } from '../data/spotArt';
import { boostedOpenKey } from './openContrast';
import { RealDeadline } from '../logic/realTimer';
import { FLOOR_GROUND, type FloorId } from '../data/houseFloors';
import {
  CORNER_SECTIONS, Interactable, Rect, buildInteractables, isEligible, selectTarget, sightBlockers,
} from '../logic/spotTargeting';

/** One solid piece of furniture (one physics body in GameScene), drawn once. */
interface UnitVisual {
  spot: HidingSpot;
  sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  /** One-piece spots: closed / open texture keys (null = coloured rectangle fallback). */
  closedKey: string | null;
  openKey: string | null;
  /** Sectioned units: per-section open overlay (cropped `{unit}_d{N}_open`), by section number. */
  overlays: Map<number, Phaser.GameObjects.Image>;
}

/** One thing the player can target and open: a one-piece spot or one drawer/door/cushion. */
interface SpotState {
  data: Interactable;
  unit: UnitVisual;
  isOpen: boolean;
}

export class HidingSpotManager {
  private scene: Phaser.Scene;
  private units = new Map<string, UnitVisual>();
  /** Every targetable spot/section (QA scripts read `spots[i].data.id` / `.unitId`). */
  private spots: SpotState[] = [];
  private highlightedSpot: SpotState | null = null;
  private eligible = new Set<SpotState>();
  /** Expiry of a timed message ('Empty'), on real time (see realTimer.ts). */
  private messageDeadline = new RealDeadline();
  private blockers: Rect[] = sightBlockers(houseLayout);
  /** Pulsing outline drawn around just the targeted spot / section. */
  private highlightGfx: Phaser.GameObjects.Graphics;
  private highlightTween: Phaser.Tweens.Tween | null = null;
  /** Faint dotted outline on a corner section reachable only diagonally (see CORNER_SECTIONS). */
  private cornerHintGfx: Phaser.GameObjects.Graphics;
  private allItems: Interactable[];
  /** Label of an item hidden in this spot, or null. */
  public contentsLabel: ((id: string) => string | null) | null = null;
  /** Approved texture key for an item in an open spot, or null. */
  public contentsArtKey: ((id: string) => string | null) | null = null;
  /** Called when the player uses an open spot; return true if an item was picked up. */
  public tryPickup: ((id: string) => boolean) | null = null;
  private readonly spotItemSprites = new Map<string, Phaser.GameObjects.Image>();
  private activeFloor: FloorId = FLOOR_GROUND;

  constructor(scene: Phaser.Scene, hidingSpots: HidingSpot[]) {
    this.scene = scene;
    this.highlightGfx = scene.add.graphics().setDepth(5).setVisible(false);
    this.cornerHintGfx = scene.add.graphics().setDepth(5).setVisible(false);
    hidingSpots.forEach((spot) => this.units.set(spot.id, this.createUnit(spot)));
    this.allItems = buildInteractables(hidingSpots);
    for (const it of this.allItems) {
      this.spots.push({ data: it, unit: this.units.get(it.unitId)!, isOpen: false });
    }
  }

  /** Line of sight uses the layout's wall bodies (see logic/spotTargeting.ts); kept for callers. */
  public setWallGroup(_wallGroup: Phaser.Physics.Arcade.StaticGroup): void {}

  private createUnit(spot: HidingSpot): UnitVisual {
    const sections: DrawerUnit | undefined = DRAWER_UNITS[spot.id];
    const tex = this.scene.textures;
    let closedKey: string | null;
    let openKey: string | null = null;
    if (sections) {
      closedKey = tex.exists(baseTextureKey(sections)) ? baseTextureKey(sections) : null;
    } else {
      const k = HIDING_SPOT_TEXTURES[spot.id];
      closedKey = k && tex.exists(k) ? k : null;
      openKey = k && tex.exists(`${k}_open`) ? `${k}_open` : null;
      if (closedKey && openKey) openKey = boostedOpenKey(this.scene, closedKey, openKey);
    }

    let sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
    if (closedKey) {
      // Art is half resolution: 1 art px = 2 world units. Rotated units are
      // centred on the (possibly offset) sprite and angled clockwise.
      sprite = this.placeArt(spot, closedKey, 0);
    } else {
      sprite = this.scene.add.rectangle(spot.x + spot.width / 2, spot.y + spot.height / 2,
        spot.width, spot.height, this.getColorForType(spot.type), 1).setStrokeStyle(2, 0x000000);
    }
    sprite.setDepth(0).setInteractive();

    const overlays = new Map<number, Phaser.GameObjects.Image>();
    if (sections && closedKey) {
      for (const s of sections.sections) {
        const key = sectionOpenTextureKey(sections, s.drawer);
        if (!tex.exists(key)) continue;
        // `_d{N}_open` is the whole unit with only N open; show just the pixels that change
        // so any number of sections can be open at once on top of the closed base.
        const crop = this.changedRect(closedKey, key) ?? { x: s.x, y: s.y, width: s.w, height: s.h };
        const img = this.placeArt(spot, key, 1).setVisible(false);
        img.setCrop(crop.x, crop.y, crop.width, crop.height);
        overlays.set(s.drawer, img);
      }
    }

    const unit: UnitVisual = { spot, sprite, closedKey, openKey, overlays };
    sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.onUnitTap(unit, pointer));
    return unit;
  }

  /** Place a 2x art image at the unit, honoring rotation and spriteOffset. */
  private placeArt(spot: HidingSpot, key: string, depth: number): Phaser.GameObjects.Image {
    const rot = spotRotation(spot);
    const off = spot.spriteOffset;
    if (!rot && !off) {
      return this.scene.add.image(spot.x, spot.y, key).setOrigin(0, 0).setScale(2).setDepth(depth);
    }
    const c = spriteCenter(spot);
    return this.scene.add.image(c.x, c.y, key).setOrigin(0.5, 0.5).setScale(2).setAngle(rot).setDepth(depth);
  }

  /** Bounding box (art px) of the pixels that differ between two same-size textures. */
  private changedRect(aKey: string, bKey: string): Rect | null {
    try {
      const a = this.scene.textures.get(aKey).getSourceImage() as CanvasImageSource & { width: number; height: number };
      const b = this.scene.textures.get(bKey).getSourceImage() as CanvasImageSource & { width: number; height: number };
      if (a.width !== b.width || a.height !== b.height) return null;
      const read = (img: CanvasImageSource) => {
        const c = document.createElement('canvas');
        c.width = a.width; c.height = a.height;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, a.width, a.height).data;
      };
      const da = read(a), db = read(b);
      let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
      for (let y = 0; y < a.height; y++) {
        for (let x = 0; x < a.width; x++) {
          const i = (y * a.width + x) * 4;
          if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2] || da[i + 3] !== db[i + 3]) {
            if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
          }
        }
      }
      return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
    } catch {
      return null;
    }
  }

  /** Tap a unit: open the section under the finger if it is in reach, else the targeted one. */
  private onUnitTap(unit: UnitVisual, pointer: Phaser.Input.Pointer): void {
    const wx = pointer.worldX, wy = pointer.worldY;
    const hit = this.spots.find((s) => s.unit === unit && this.eligible.has(s)
      && wx >= s.data.x && wx < s.data.x + s.data.width && wy >= s.data.y && wy < s.data.y + s.data.height);
    if (hit) {
      if (hit !== this.highlightedSpot) this.setHighlight(hit);
      this.toggleSpot(hit);
    } else if (this.highlightedSpot && this.highlightedSpot.unit === unit) {
      this.toggleSpot(this.highlightedSpot);
    }
  }

  private getColorForType(type: string): number {
    switch (type) {
      case 'drawer': return 0x8B7355;
      case 'closet': return 0x654321;
      case 'cabinet': return 0xA0826D;
      case 'appliance': return 0xECF0F1;
      case 'furniture': return 0x9B59B6;
      default: return 0x888888;
    }
  }

  private getOpenColor(type: string): number {
    switch (type) {
      case 'drawer': return 0x7A6344;
      case 'closet': return 0x543210;
      case 'cabinet': return 0x8F7256;
      case 'appliance': return 0xBDC3C7;
      case 'furniture': return 0x8E44AD;
      default: return 0x666666;
    }
  }

  /** World rect of the highlighted spot including its outline (null when none). */
  public getHighlightedBounds(): { x: number; y: number; width: number; height: number } | null {
    if (!this.highlightedSpot) return null;
    const { x, y, width, height } = this.highlightedSpot.data;
    const pad = HidingSpotManager.OUTLINE_PAD;
    return { x: x - pad, y: y - pad, width: width + pad * 2, height: height + pad * 2 };
  }

  /** The outline is stroked 3px outside the spot with a 4px line: it reaches 5px out. */
  static readonly OUTLINE_PAD = 5;
  /** Above spot highlight graphics (depth 5) so item art stays visible when targeted. */
  static readonly SPOT_ITEM_DEPTH = 6;

  public setActiveFloor(floor: FloorId): void {
    this.activeFloor = floor;
    if (floor !== FLOOR_GROUND) this.setHighlight(null);
  }

  public update(playerPosition: Phaser.Math.Vector2, facing: { x: number; y: number } = { x: 0, y: 1 }): void {
    if (!this.inputEnabled) return;
    if (this.activeFloor !== FLOOR_GROUND) {
      this.setHighlight(null);
      return;
    }
    this.tickMessage();
    const px = playerPosition.x, py = playerPosition.y;
    this.eligible.clear();
    for (const s of this.spots) if (isEligible(px, py, s.data, this.blockers)) this.eligible.add(s);
    const best = selectTarget(px, py, facing, this.allItems, this.blockers, this.highlightedSpot?.data.id ?? null);
    const next = best ? this.spots.find((s) => s.data === best)! : null;
    if (next !== this.highlightedSpot) this.setHighlight(next);
    this.updateCornerHint();
  }

  /**
   * Corner sections (kitchen sink door 1) can't be faced straight on: while the
   * neighbouring section is targeted and the corner one is in reach, a faint dotted outline on
   * it hints that pushing diagonally into the corner picks it.
   */
  private updateCornerHint(): void {
    const cur = this.highlightedSpot?.data.id;
    const entry = Object.entries(CORNER_SECTIONS).find(([, c]) => c.neighbour === cur);
    const corner = entry ? this.spots.find((s) => s.data.id === entry[0] && this.eligible.has(s)) : undefined;
    const id = corner?.data.id ?? null;
    if (id === this.cornerHintId) return;
    this.cornerHintId = id;
    const g = this.cornerHintGfx;
    g.clear();
    if (!corner) { g.setVisible(false); return; }
    const { x, y, width, height } = corner.data;
    g.fillStyle(0xFFE14D, 0.55);
    // Dotted outline, 2x2 dots every 6 px, 2 px outside the section.
    for (let dx = 0; dx <= width + 2; dx += 6) { g.fillRect(x - 2 + dx, y - 3, 2, 2); g.fillRect(x - 2 + dx, y + height + 1, 2, 2); }
    for (let dy = 0; dy <= height + 2; dy += 6) { g.fillRect(x - 3, y - 2 + dy, 2, 2); g.fillRect(x + width + 1, y - 2 + dy, 2, 2); }
    g.setVisible(true);
  }

  private cornerHintId: string | null = null;

  private setHighlight(spot: SpotState | null): void {
    this.clearHighlight();
    this.highlightedSpot = spot;
    if (spot) this.highlightSpot(spot);
  }

  private highlightSpot(spot: SpotState): void {
    // Outline only (never a tint: tinting the open art turned the open bed olive).
    const { x, y, width, height } = spot.data;
    const g = this.highlightGfx;
    g.clear();
    g.fillStyle(0xFFE14D, 0.18);
    g.fillRect(x, y, width, height);
    g.lineStyle(4, 0x000000, 0.6);
    g.strokeRect(x - 3, y - 3, width + 6, height + 6);
    g.lineStyle(2, 0xFFE14D, 1);
    g.strokeRect(x - 2, y - 2, width + 4, height + 4);
    g.setAlpha(1).setVisible(true);
    this.highlightTween?.stop();
    this.highlightTween = this.scene.tweens.add({
      targets: g,
      alpha: { from: 1, to: 0.35 },
      duration: 450,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.showPrompt(spot);
  }

  private promptText(spot: SpotState): string {
    const isTouch = this.scene.sys.game.device.input.touch;
    const hint = isTouch ? '' : '[E] ';
    if (!this.autoPickup && spot.isOpen) return `${hint}Close ${spot.data.name}`;
    return `${hint}${spot.data.name}`;
  }

  private showPrompt(spot: SpotState): void {
    this.showMessage(this.promptText(spot));
  }

  private clearHighlight(): void {
    this.highlightTween?.stop();
    this.highlightTween = null;
    this.highlightGfx.clear().setVisible(false);
    if (this.highlightedSpot) this.hideMessage();
  }

  private inputEnabled = true;

  /** Phantom search covers the house: no highlight and no open. */
  public setInputEnabled(on: boolean): void {
    this.inputEnabled = on;
    if (!on) this.clearHighlight();
  }

  /** When false (Phantom hiding), Interact opens/closes only — it does not take the item. */
  public autoPickup = true;

  public interact(): void {
    if (!this.inputEnabled) return;
    if (this.activeFloor !== FLOOR_GROUND) return;
    if (!this.highlightedSpot) return;
    if (this.autoPickup && this.highlightedSpot.isOpen && this.tryPickup?.(this.highlightedSpot.data.id)) return;
    this.toggleSpot(this.highlightedSpot);
  }

  public takeHighlighted(): boolean {
    if (!this.inputEnabled || !this.highlightedSpot?.isOpen) return false;
    return !!this.tryPickup?.(this.highlightedSpot.data.id);
  }


  /** Online: told about every open / close this player makes (net/NetSync.ts). */
  private localToggle: ((id: string, open: boolean) => void) | null = null;
  public openIds(): string[] { return this.spots.filter((s) => s.isOpen).map((s) => s.data.id); }
  public highlighted(): { data: { id: string; unitId: string; name: string }; isOpen: boolean } | null { return this.highlightedSpot; }

  public onLocalToggle(cb: (id: string, open: boolean) => void): void { this.localToggle = cb; }
  public onToggle: ((id: string, open: boolean) => void) | null = null;

  /**
   * Online: another player opened / closed spot `id` (no 'Empty' message here; if it is the
   * one this player targets, its prompt follows). Unknown ids are ignored.
   */
  public setOpen(id: string, open: boolean): void {
    const spot = this.spots.find((s) => s.data.id === id);
    if (!spot || spot.isOpen === open) return;
    spot.isOpen = open;
    this.drawSpot(spot);
    if (this.highlightedSpot === spot) this.showPrompt(spot);
  }

  /** Online: the room's full spot state (listed = open, every other spot closed). */
  public syncOpen(openIds: readonly string[]): void {
    const open = new Set(openIds);
    for (const sp of this.spots) this.setOpen(sp.data.id, open.has(sp.data.id));
  }

  private toggleSpot(spot: SpotState): void {
    spot.isOpen = !spot.isOpen;
    this.drawSpot(spot);
    this.localToggle?.(spot.data.id, spot.isOpen);
    this.onToggle?.(spot.data.id, spot.isOpen);

    if (spot.isOpen) {
      const label = this.contentsLabel?.(spot.data.id);
      const hasArt = !!this.contentsArtKey?.(spot.data.id);
      if (this.autoPickup && label && this.tryPickup?.(spot.data.id)) {
        this.showMessage(`Picked up ${label}`, 2000);
      } else if (hasArt) {
        this.showPrompt(spot);
      } else if (label) {
        this.showMessage(label);
      } else {
        this.showMessage('Empty', 2000);
      }
    } else if (this.highlightedSpot === spot) {
      // Closing: straight back to the name prompt (cancels any pending 'Empty' timer).
      this.showPrompt(spot);
    }
  }

  /** Open / closed art for one spot or section. */
  private drawSpot(spot: SpotState): void {
    const unit = spot.unit;

    if (spot.data.drawer > 0) {
      unit.overlays.get(spot.data.drawer)?.setVisible(spot.isOpen);
    } else if (unit.sprite instanceof Phaser.GameObjects.Image) {
      if (unit.closedKey && unit.openKey) unit.sprite.setTexture(spot.isOpen ? unit.openKey : unit.closedKey);
    } else {
      unit.sprite.setFillStyle(spot.isOpen ? this.getOpenColor(spot.data.type) : this.getColorForType(spot.data.type));
    }
    // Opened (or closed) art is never tinted.
    if (unit.sprite instanceof Phaser.GameObjects.Image) unit.sprite.clearTint();
    unit.overlays.forEach((o) => o.clearTint());
    this.refreshSpotItemSprite(spot);
  }

  /** Draw or hide the item sprite for one open spot (16 px art at 2× world scale). */
  private refreshSpotItemSprite(spot: SpotState): void {
    const id = spot.data.id;
    let spr = this.spotItemSprites.get(id);
    const key = spot.isOpen ? (this.contentsArtKey?.(id) ?? null) : null;
    if (!key || !this.scene.textures.exists(key)) {
      spr?.setVisible(false);
      return;
    }
    const cx = spot.data.x + spot.data.width / 2;
    const cy = spot.data.y + spot.data.height / 2;
    if (!spr) {
      spr = this.scene.add.image(cx, cy, key).setScale(2).setDepth(HidingSpotManager.SPOT_ITEM_DEPTH);
      this.spotItemSprites.set(id, spr);
    } else {
      spr.setTexture(key).setPosition(cx, cy);
    }
    spr.setVisible(true);
  }

  /** Refresh every spot item sprite (after the item list or open state changes). */
  public syncSpotItemSprites(artKeyForSpot: (spotId: string) => string | null): void {
    this.contentsArtKey = artKeyForSpot;
    for (const spot of this.spots) this.refreshSpotItemSprite(spot);
  }

  private showMessage(text: string, duration?: number): void {
    // Every new message replaces the previous deadline, so a stale one can never
    // blank or replace a newer message.
    this.messageDeadline.clear();
    // Show message via UIScene (UIScene itself never auto-hides the spot prompt;
    // this manager owns the only deadline).
    const uiScene = this.scene.scene.get('UIScene');
    if (uiScene && (uiScene as any).showHidingSpotPrompt) {
      (uiScene as any).showHidingSpotPrompt(text);
      if (duration) this.messageDeadline.set(duration);
    }
  }

  /** Polled every frame: when a timed message expires, back to the name prompt (or hide). */
  private tickMessage(): void {
    if (!this.messageDeadline.due()) return;
    const uiScene = this.scene.scene.get('UIScene') as any;
    if (!uiScene) return;
    if (this.highlightedSpot) uiScene.showHidingSpotPrompt?.(this.promptText(this.highlightedSpot));
    else uiScene.hideHidingSpotPrompt?.();
  }

  private hideMessage(): void {
    this.messageDeadline.clear();
    const uiScene = this.scene.scene.get('UIScene');
    if (uiScene && (uiScene as any).hideHidingSpotPrompt) {
      (uiScene as any).hideHidingSpotPrompt();
    }
  }

  public resize(): void {
    // Resizing handled by UIScene
  }

  public destroy(): void {
    this.messageDeadline.clear();
    this.highlightTween?.stop();
    this.highlightGfx.destroy();
    this.spotItemSprites.forEach((s) => s.destroy());
    this.spotItemSprites.clear();
    this.units.forEach((u) => {
      u.sprite.destroy();
      u.overlays.forEach((o) => o.destroy());
    });
  }
}
