import Phaser from 'phaser';
import { HidingSpot } from '../data/houseLayout';
import { SafeAreaManager } from '../utils/SafeAreaManager';

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

  constructor(scene: Phaser.Scene, hidingSpots: HidingSpot[]) {
    this.scene = scene;
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
    // Use tint for Image sprites (can't use setStrokeStyle)
    if (spot.sprite instanceof Phaser.GameObjects.Image) {
      spot.sprite.setTint(0xFFFF00);
    } else {
      spot.sprite.setStrokeStyle(3, 0xFFFF00);
    }
    
    // Show keyboard hint only on non-touch devices
    const isTouch = this.scene.sys.game.device.input.touch;
    const hint = isTouch ? '' : '[E] ';
    this.showMessage(`${hint}${spot.data.name}`);
  }

  private clearHighlight(): void {
    if (this.highlightedSpot) {
      if (this.highlightedSpot.sprite instanceof Phaser.GameObjects.Image) {
        this.highlightedSpot.sprite.clearTint();
      } else {
        this.highlightedSpot.sprite.setStrokeStyle(2, 0x000000);
      }
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
      this.showMessage('Empty', 2000);
    } else if ('setFillStyle' in spot.sprite) {
      // Fallback: change color
      if (spot.isOpen) {
        (spot.sprite as any).setFillStyle(this.getOpenColor(spot.data.type));
        this.showMessage('Empty', 2000);
      } else {
        (spot.sprite as any).setFillStyle(this.getColorForType(spot.data.type));
        // Don't hide message - let it show the highlight prompt again
        this.clearHighlight();
        if (this.highlightedSpot === spot) {
          this.highlightSpot(spot);
        }
      }
    }
  }

  private showMessage(text: string, duration?: number): void {
    // Cancel previous timer
    if (this.messageTimer) {
      this.messageTimer.destroy();
      this.messageTimer = null;
    }

    // Show message via UIScene
    const uiScene = this.scene.scene.get('UIScene');
    if (uiScene && (uiScene as any).showHidingSpotPrompt) {
      if (duration) {
        (uiScene as any).showHidingSpotPrompt(text, duration);
        
        // Store timer reference so we can cancel it
        this.messageTimer = this.scene.time.delayedCall(duration, () => {
          this.messageTimer = null;
          // Re-show highlight prompt if still highlighted
          if (this.highlightedSpot) {
            const isTouch = this.scene.sys.game.device.input.touch;
            const hint = isTouch ? '' : '[E] ';
            (uiScene as any).showHidingSpotPrompt(`${hint}${this.highlightedSpot.data.name}`);
          }
        });
      } else {
        (uiScene as any).showHidingSpotPrompt(text);
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
    this.spots.forEach(spot => {
      spot.sprite.destroy();
      spot.highlight?.destroy();
    });
  }
}
