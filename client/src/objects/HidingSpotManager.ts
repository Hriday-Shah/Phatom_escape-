import Phaser from 'phaser';
import { HidingSpot } from '../data/houseLayout';
import { SafeAreaManager } from '../utils/SafeAreaManager';

interface HidingSpotSprite {
  data: HidingSpot;
  sprite: Phaser.GameObjects.Rectangle;
  isOpen: boolean;
  highlight?: Phaser.GameObjects.Rectangle;
}

export class HidingSpotManager {
  private scene: Phaser.Scene;
  private spots: HidingSpotSprite[] = [];
  private highlightedSpot: HidingSpotSprite | null = null;
  private messageText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, hidingSpots: HidingSpot[]) {
    this.scene = scene;
    
    // Create message text
    this.messageText = scene.add.text(
      scene.scale.width / 2,
      scene.scale.height - 100,
      '',
      {
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: '#000000aa',
        padding: { x: 12, y: 8 },
      }
    )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(999)
      .setVisible(false);

    this.createSpots(hidingSpots);
    
    // Reposition on safe area changes
    SafeAreaManager.onInsetsChange(() => this.resize());
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
      let sprite: any;
      
      if (textureKey && this.scene.textures.exists(textureKey)) {
        // Use art (at 2x scale, art is half resolution)
        sprite = this.scene.add.image(spot.x, spot.y, textureKey)
          .setOrigin(0, 0)
          .setScale(2);
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
        ).setStrokeStyle(2, 0x000000);
      }

      this.spots.push({
        data: spot,
        sprite,
        isOpen: false,
      });
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

    // Find closest spot in range
    this.spots.forEach(spot => {
      const spotCenter = new Phaser.Math.Vector2(
        spot.sprite.x,
        spot.sprite.y
      );
      const distance = playerPosition.distance(spotCenter);

      if (distance < spot.data.interactRange && distance < closestDistance) {
        closestSpot = spot;
        closestDistance = distance;
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

  private highlightSpot(spot: HidingSpotSprite): void {
    const s: any = spot.sprite;
    if (typeof s.setStrokeStyle === 'function') s.setStrokeStyle(3, 0xFFFF00);
    else if (typeof s.setTint === 'function') s.setTint(0xFFF2A0);
    this.showMessage(`[E] ${spot.data.name}`);
  }

  private clearHighlight(): void {
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
      this.showMessage('Empty', 2000);
    } else if ('setFillStyle' in spot.sprite) {
      // Fallback: change color
      if (spot.isOpen) {
        (spot.sprite as any).setFillStyle(this.getOpenColor(spot.data.type));
        this.showMessage('Empty', 2000);
      } else {
        (spot.sprite as any).setFillStyle(this.getColorForType(spot.data.type));
        this.hideMessage();
      }
    }
  }

  private showMessage(text: string, duration?: number): void {
    this.messageText.setText(text).setVisible(true);
    
    if (duration) {
      this.scene.time.delayedCall(duration, () => {
        this.hideMessage();
      });
    }
  }

  private hideMessage(): void {
    this.messageText.setVisible(false);
  }

  public resize(): void {
    const insets = SafeAreaManager.getInsets();
    const bottomOffset = 150 + insets.bottom; // Keep above controls
    
    this.messageText.setPosition(
      this.scene.scale.width / 2,
      this.scene.scale.height - bottomOffset
    );
  }

  public destroy(): void {
    this.spots.forEach(spot => {
      spot.sprite.destroy();
      spot.highlight?.destroy();
    });
    this.messageText.destroy();
  }
}
