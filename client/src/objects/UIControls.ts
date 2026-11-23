import Phaser from 'phaser';
import { SafeAreaManager } from '../utils/SafeAreaManager';

export class UIControls {
  private scene: Phaser.Scene;
  private buttons: Map<string, Phaser.GameObjects.Container> = new Map();
  private itemSlot: Phaser.GameObjects.Container | null = null;
  
  // UI layout specs: 60px buttons in 2x2 cluster, 12px gaps, 16px margin
  private readonly buttonSize = 60; // CSS px
  private readonly buttonGap = 12; // CSS px
  private readonly margin = 16; // CSS px

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.createButtons();
    this.positionButtons();
    
    // Reposition on safe area changes
    SafeAreaManager.onInsetsChange(() => this.positionButtons());
  }

  private createButtons(): void {
    // 2x2 button cluster: Interact bottom-right, Shoot above it, Sneak bottom-left, Drop above Sneak
    const buttonConfigs = [
      { id: 'interact', key: 'ui_btn_interact', pressedKey: 'ui_btn_interact_pressed', label: 'Interact', active: true },
      { id: 'shoot', key: 'ui_btn_shoot_disabled', label: 'Shoot', active: false },
      { id: 'sneak', key: 'ui_btn_sneak', pressedKey: 'ui_btn_sneak_pressed', label: 'Sneak', active: false },
      { id: 'drop', key: 'ui_btn_drop', pressedKey: 'ui_btn_drop_pressed', label: 'Drop', active: false },
    ];

    buttonConfigs.forEach((config) => {
      const container = this.scene.add.container(0, 0)
        .setScrollFactor(0)
        .setDepth(1000);

      if (this.scene.textures.exists(config.key)) {
        const btn = this.scene.add.image(0, 0, config.key)
          .setDisplaySize(this.buttonSize, this.buttonSize);
        
        if (config.active) {
          btn.setInteractive({ useHandCursor: true });
          
          btn.on('pointerdown', () => {
            if (config.pressedKey && this.scene.textures.exists(config.pressedKey)) {
              btn.setTexture(config.pressedKey);
            }
            this.scene.events.emit(config.id === 'interact' ? 'interact' : config.id);
          });
          
          btn.on('pointerup', () => {
            btn.setTexture(config.key);
          });
          
          btn.on('pointerout', () => {
            btn.setTexture(config.key);
          });
        } else {
          btn.setAlpha(0.6);
        }
        
        container.add(btn);
      } else {
        // Fallback
        const bg = this.scene.add.circle(0, 0, this.buttonSize / 2, config.active ? 0x4A90E2 : 0x666666, config.active ? 0.7 : 0.4);
        const border = this.scene.add.circle(0, 0, this.buttonSize / 2)
          .setStrokeStyle(2, config.active ? 0x2E5C8A : 0x444444, config.active ? 1 : 0.6);
        
        const text = this.scene.add.text(0, 0, config.label, {
          fontSize: '10px',
          color: config.active ? '#ffffff' : '#888888',
        }).setOrigin(0.5);

        if (config.active) {
          bg.setInteractive({ useHandCursor: true });
          bg.on('pointerdown', () => {
            this.scene.events.emit(config.id === 'interact' ? 'interact' : config.id);
          });
        }

        container.add([bg, border, text]);
      }
      
      this.buttons.set(config.id, container);
    });
    
    // Item slot (60px): top-right in landscape, above Shoot in portrait
    this.itemSlot = this.scene.add.container(0, 0)
      .setScrollFactor(0)
      .setDepth(1000);
    
    if (this.scene.textures.exists('ui_item_slot')) {
      const slot = this.scene.add.image(0, 0, 'ui_item_slot')
        .setDisplaySize(this.buttonSize, this.buttonSize);
      this.itemSlot.add(slot);
    } else {
      // Fallback
      const slotBg = this.scene.add.rectangle(0, 0, this.buttonSize, this.buttonSize, 0x333333, 0.5);
      const slotBorder = this.scene.add.rectangle(0, 0, this.buttonSize, this.buttonSize)
        .setStrokeStyle(2, 0x666666, 0.8);
      this.itemSlot.add([slotBg, slotBorder]);
    }
  }

  private positionButtons(): void {
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const insets = SafeAreaManager.getInsets();
    const isPortrait = height > width;
    
    // 16px margin added to safe-area insets
    const rightEdge = width - insets.right - this.margin;
    const bottomEdge = height - insets.bottom - this.margin;
    const topEdge = insets.top + this.margin;
    
    // 2x2 button cluster with 12px gaps
    // Bottom row: Sneak (left), Interact (right)
    // Top row: Drop (left), Shoot (right)
    const interactX = rightEdge - this.buttonSize / 2;
    const interactY = bottomEdge - this.buttonSize / 2;
    
    const sneakX = interactX - this.buttonSize - this.buttonGap;
    const sneakY = interactY;
    
    const shootX = interactX;
    const shootY = interactY - this.buttonSize - this.buttonGap;
    
    const dropX = sneakX;
    const dropY = shootY;
    
    this.buttons.get('interact')?.setPosition(interactX, interactY);
    this.buttons.get('shoot')?.setPosition(shootX, shootY);
    this.buttons.get('sneak')?.setPosition(sneakX, sneakY);
    this.buttons.get('drop')?.setPosition(dropX, dropY);
    
    // Item slot: top-right in landscape, above Shoot in portrait
    if (this.itemSlot) {
      if (isPortrait) {
        // Above Shoot button
        this.itemSlot.setPosition(shootX, shootY - this.buttonSize - this.buttonGap);
      } else {
        // Top-right corner
        this.itemSlot.setPosition(rightEdge - this.buttonSize / 2, topEdge + this.buttonSize / 2);
      }
    }
  }

  public resize(): void {
    this.positionButtons();
  }

  public destroy(): void {
    this.buttons.forEach(container => container.destroy());
    this.buttons.clear();
    this.itemSlot?.destroy();
  }
}
