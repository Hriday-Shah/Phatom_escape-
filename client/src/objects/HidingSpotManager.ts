import Phaser from 'phaser';
import { HidingSpot } from '../data/houseLayout';

interface HidingSpotSprite {
  data: HidingSpot;
  sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  isOpen: boolean;
  highlight?: Phaser.GameObjects.Rectangle;
}

export class HidingSpotManager {
  private scene: Phaser.Scene;
  private spots: HidingSpotSprite[] = [];
  private highlightedSpot: HidingSpotSprite | null = null;
  private messageTimer: Phaser.Time.TimerEvent | null = null;
  private wallGroup: Phaser.Physics.Arcade.StaticGroup | null = null;
  /** Pulsing outline drawn around the targeted spot (QA N6). */
  private highlightGfx: Phaser.GameObjects.Graphics;
  private highlightTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, hidingSpots: HidingSpot[]) {
    this.scene = scene;
    this.highlightGfx = scene.add.graphics().setDepth(5).setVisible(false);
    this.createSpots(hidingSpots);
  }

  public setWallGroup(wallGroup: Phaser.Physics.Arcade.StaticGroup): void {
    this.wallGroup = wallGroup;
  }

  private createSpots(hidingSpots: HidingSpot[]): void {
    // Map spot IDs to texture keys
    const spotTextures: Record<string, string> = {
      'study_drawer_1': 'study_drawer', 'study_drawer_2': 'study_drawer', 'study_drawer_3': 'study_drawer',
      'bed': 'bed', 'bedside_drawer': 'bedside_drawer', 'closet_drawers': 'closet',
      'sofa': 'sofa', 'ottoman': 'ottoman', 'tv_unit': 'tv_unit', 'sideboard': 'sideboard',
      'sink_cabinet': 'sink_cabinet', 'wall_shelf': 'wall_shelf', 'microwave_unit': 'microwave_unit',
      'kitchen_sink_cabinet': 'kitchen_sink', 'stove': 'stove', 'stove_drawers': 'kitchen_drawer', 'fridge': 'fridge',
    };

    hidingSpots.forEach(spot => {
      const textureKey = spotTextures[spot.id];
      let sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
      
      if (textureKey && this.scene.textures.exists(textureKey)) {
        // Use art (at 2x scale, art is half resolution)
        sprite = this.scene.add.image(spot.x, spot.y, textureKey)
          .setOrigin(0, 0)
          .setScale(2)
          .setInteractive();
      } else {
        // Fallback to colored rectangle
        const color = this.getColorForType(spot.type);
        sprite = this.scene.add.rectangle(
          spot.x + spot.width / 2,
          spot.y + spot.height / 2,
          spot.width,
          spot.height,
          color,
          1
        ).setStrokeStyle(2, 0x000000)
        .setInteractive();
      }

      const spotData: HidingSpotSprite = {
        data: spot,
        sprite,
        isOpen: false,
      };

      // Add tap handler for tap-to-open
      sprite.on('pointerdown', () => {
        // Only open if it's the highlighted spot
        if (this.highlightedSpot === spotData) {
          this.toggleSpot(spotData);
        }
      });

      this.spots.push(spotData);
    });
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

  public update(playerPosition: Phaser.Math.Vector2): void {
    let closestSpot: HidingSpotSprite | null = null;
    let closestDistance = Infinity;

    // Find closest spot in range with line of sight
    this.spots.forEach(spot => {
      const spotCenter = new Phaser.Math.Vector2(
        spot.data.x + spot.data.width / 2,
        spot.data.y + spot.data.height / 2
      );
      const distance = playerPosition.distance(spotCenter);

      if (distance < spot.data.interactRange && distance < closestDistance) {
        // Check line of sight (no walls between player and spot)
        if (this.hasLineOfSight(playerPosition, spotCenter)) {
          closestSpot = spot;
          closestDistance = distance;
        }
      }
    });

    // Update highlight
    if (this.highlightedSpot !== closestSpot) {
      this.clearHighlight();
      if (closestSpot) {
        this.highlightSpot(closestSpot);
      }
      this.highlightedSpot = closestSpot;
    }
  }

  private hasLineOfSight(from: Phaser.Math.Vector2, to: Phaser.Math.Vector2): boolean {
    if (!this.wallGroup) return true;

    const line = new Phaser.Geom.Line(from.x, from.y, to.x, to.y);
    const walls = this.wallGroup.getChildren() as Phaser.GameObjects.GameObject[];

    for (const wall of walls) {
      if (!(wall as any).getData?.('blocksSight')) continue;
      const bounds = (wall as any).getBounds();
      if (!bounds) continue;

      const rect = new Phaser.Geom.Rectangle(bounds.x, bounds.y, bounds.width, bounds.height);
      if (Phaser.Geom.Intersects.LineToRectangle(line, rect)) {
        return false;
      }
    }

    return true;
  }

  private highlightSpot(spot: HidingSpotSprite): void {
    const s: any = spot.sprite;
    if (typeof s.setStrokeStyle === 'function') s.setStrokeStyle(3, 0xFFFF00);
    else if (typeof s.setTint === 'function') s.setTint(0xFFF2A0);

    // Bright outline (2 world px = 1 art px, drawn just outside the spot) that pulses.
    const { x, y, width, height } = spot.data;
    const g = this.highlightGfx;
    g.clear();
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

  private promptText(spot: HidingSpotSprite): string {
    // Show keyboard hint only on non-touch devices
    const isTouch = this.scene.sys.game.device.input.touch;
    const hint = isTouch ? '' : '[E] ';
    return `${hint}${spot.data.name}`;
  }

  private showPrompt(spot: HidingSpotSprite): void {
    this.showMessage(this.promptText(spot));
  }

  private clearHighlight(): void {
    this.highlightTween?.stop();
    this.highlightTween = null;
    this.highlightGfx.clear().setVisible(false);
    if (this.highlightedSpot) {
      const s: any = this.highlightedSpot.sprite;
      if (typeof s.setStrokeStyle === 'function') s.setStrokeStyle(2, 0x000000);
      else if (typeof s.clearTint === 'function') s.clearTint();
      this.hideMessage();
    }
  }

  public interact(): void {
    if (this.highlightedSpot) {
      this.toggleSpot(this.highlightedSpot);
    }
  }

  private toggleSpot(spot: HidingSpotSprite): void {
    spot.isOpen = !spot.isOpen;
    
    // Map spot ID to texture
    const spotTextures: Record<string, string> = {
      'study_drawer_1': 'study_drawer', 'study_drawer_2': 'study_drawer', 'study_drawer_3': 'study_drawer',
      'bed': 'bed', 'bedside_drawer': 'bedside_drawer', 'closet_drawers': 'closet',
      'sofa': 'sofa', 'ottoman': 'ottoman', 'tv_unit': 'tv_unit', 'sideboard': 'sideboard',
      'sink_cabinet': 'sink_cabinet', 'wall_shelf': 'wall_shelf', 'microwave_unit': 'microwave_unit',
      'kitchen_sink_cabinet': 'kitchen_sink', 'stove': 'stove', 'stove_drawers': 'kitchen_drawer', 'fridge': 'fridge',
    };
    
    const textureKey = spotTextures[spot.data.id];
    const openKey = textureKey ? `${textureKey}_open` : null;
    
    if (textureKey && openKey && this.scene.textures.exists(textureKey) && this.scene.textures.exists(openKey)) {
      // Switch texture (sprite is Image if art exists)
      if (spot.sprite instanceof Phaser.GameObjects.Image) {
        spot.sprite.setTexture(spot.isOpen ? openKey : textureKey);
      }
    } else if ('setFillStyle' in spot.sprite) {
      // Fallback: change color
      (spot.sprite as any).setFillStyle(
        spot.isOpen ? this.getOpenColor(spot.data.type) : this.getColorForType(spot.data.type)
      );
    }

    if (spot.isOpen) {
      // Only OPENING reveals the contents; the name comes back after 2 s.
      this.showMessage('Empty', 2000);
    } else if (this.highlightedSpot === spot) {
      // Closing: straight back to the name prompt (cancels any pending 'Empty' timer).
      this.showPrompt(spot);
    }
  }

  private showMessage(text: string, duration?: number): void {
    // Every new message cancels the previous timer, so a stale timer can never
    // blank or replace a newer message.
    if (this.messageTimer) {
      this.messageTimer.destroy();
      this.messageTimer = null;
    }

    // Show message via UIScene (UIScene itself never auto-hides the spot prompt;
    // this manager owns the only timer).
    const uiScene = this.scene.scene.get('UIScene');
    if (uiScene && (uiScene as any).showHidingSpotPrompt) {
      (uiScene as any).showHidingSpotPrompt(text);
      if (duration) {
        this.messageTimer = this.scene.time.delayedCall(duration, () => {
          this.messageTimer = null;
          // Re-show the highlight prompt if still highlighted, else hide.
          if (this.highlightedSpot) {
            (uiScene as any).showHidingSpotPrompt(this.promptText(this.highlightedSpot));
          } else {
            (uiScene as any).hideHidingSpotPrompt?.();
          }
        });
      }
    }
  }

  private hideMessage(): void {
    // Cancel timer
    if (this.messageTimer) {
      this.messageTimer.destroy();
      this.messageTimer = null;
    }

    const uiScene = this.scene.scene.get('UIScene');
    if (uiScene && (uiScene as any).hideHidingSpotPrompt) {
      (uiScene as any).hideHidingSpotPrompt();
    }
  }

  public resize(): void {
    // Resizing handled by UIScene
  }

  public destroy(): void {
    if (this.messageTimer) {
      this.messageTimer.destroy();
    }
    this.highlightTween?.stop();
    this.highlightGfx.destroy();
    this.spots.forEach(spot => {
      spot.sprite.destroy();
      spot.highlight?.destroy();
    });
  }
}
