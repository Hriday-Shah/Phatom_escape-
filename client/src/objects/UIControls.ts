import Phaser from 'phaser';
import { SafeAreaManager } from '../utils/SafeAreaManager';

export class UIControls {
  private scene: Phaser.Scene;
  private buttons: Map<string, Phaser.GameObjects.Container> = new Map();
  private interactButtonSize = 70;
  private smallButtonSize = 50;
  private margin = 20;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.createButtons();
    this.positionButtons();
    
    // Reposition on safe area changes
    SafeAreaManager.onInsetsChange(() => this.positionButtons());
  }

  private createButtons(): void {
    // Large interact button
    const interactContainer = this.scene.add.container(0, 0)
      .setScrollFactor(0)
      .setDepth(1000);

    const hasArt = this.scene.textures.exists('ui_btn_interact');
    
    if (hasArt) {
      const btn = this.scene.add.image(0, 0, 'ui_btn_interact')
        .setDisplaySize(this.interactButtonSize, this.interactButtonSize)
        .setInteractive({ useHandCursor: true });
      
      btn.on('pointerdown', () => {
        if (this.scene.textures.exists('ui_btn_interact_pressed')) {
          btn.setTexture('ui_btn_interact_pressed');
        }
        this.scene.events.emit('interact');
      });
      
      btn.on('pointerup', () => {
        btn.setTexture('ui_btn_interact');
      });
      
      btn.on('pointerout', () => {
        btn.setTexture('ui_btn_interact');
      });
      
      interactContainer.add(btn);
    } else {
      // Fallback
      const interactBg = this.scene.add.circle(0, 0, this.interactButtonSize / 2, 0x4A90E2, 0.7);
      const interactBorder = this.scene.add.circle(0, 0, this.interactButtonSize / 2)
        .setStrokeStyle(3, 0x2E5C8A, 1);
      
      const interactText = this.scene.add.text(0, -5, 'Interact', {
        fontSize: '14px',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      
      const interactKey = this.scene.add.text(0, 10, '(E)', {
        fontSize: '11px',
        color: '#cccccc',
      }).setOrigin(0.5);

      interactBg.setInteractive({ useHandCursor: true });
      interactBg.on('pointerdown', () => {
        this.scene.events.emit('interact');
      });

      interactContainer.add([interactBg, interactBorder, interactText, interactKey]);
    }
    
    this.buttons.set('interact', interactContainer);

    // Small disabled buttons
    const smallButtons = [
      { id: 'drop', key: 'ui_btn_drop', label: 'Drop' },
      { id: 'sneak', key: 'ui_btn_sneak', label: 'Sneak' },
      { id: 'shoot', key: 'ui_btn_shoot_disabled', label: 'Shoot' },
    ];

    smallButtons.forEach((config) => {
      const container = this.scene.add.container(0, 0)
        .setScrollFactor(0)
        .setDepth(1000);

      if (this.scene.textures.exists(config.key)) {
        const btn = this.scene.add.image(0, 0, config.key)
          .setDisplaySize(this.smallButtonSize, this.smallButtonSize)
          .setAlpha(0.6);
        container.add(btn);
      } else {
        // Fallback
        const bg = this.scene.add.circle(0, 0, this.smallButtonSize / 2, 0x666666, 0.4);
        const border = this.scene.add.circle(0, 0, this.smallButtonSize / 2)
          .setStrokeStyle(2, 0x444444, 0.6);
        
        const text = this.scene.add.text(0, 0, config.label, {
          fontSize: '10px',
          color: '#888888',
        }).setOrigin(0.5);

        container.add([bg, border, text]);
      }
      
      this.buttons.set(config.id, container);
    });
  }

  private positionButtons(): void {
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const insets = SafeAreaManager.getInsets();
    const isLandscape = width > height;
    
    const rightMargin = this.margin + insets.right;
    const bottomMargin = this.margin + insets.bottom;
    
    // Position interact button bottom-right
    const interactX = width - rightMargin - this.interactButtonSize / 2;
    const interactY = height - bottomMargin - this.interactButtonSize / 2;
    this.buttons.get('interact')?.setPosition(interactX, interactY);
    
    if (isLandscape) {
      // Landscape: compact 2x2 cluster above interact
      const spacing = this.smallButtonSize + 10;
      this.buttons.get('drop')?.setPosition(interactX - spacing, interactY - spacing);
      this.buttons.get('sneak')?.setPosition(interactX, interactY - spacing * 1.5);
      this.buttons.get('shoot')?.setPosition(interactX + spacing, interactY - spacing);
    } else {
      // Portrait: arc above interact
      const arcRadius = this.interactButtonSize + 20;
      const angleStep = Math.PI / 4;
      this.buttons.get('drop')?.setPosition(
        interactX - arcRadius * Math.cos(angleStep),
        interactY - arcRadius * Math.sin(angleStep)
      );
      this.buttons.get('sneak')?.setPosition(
        interactX,
        interactY - arcRadius
      );
      this.buttons.get('shoot')?.setPosition(
        interactX + arcRadius * Math.cos(angleStep),
        interactY - arcRadius * Math.sin(angleStep)
      );
    }
  }

  public resize(): void {
    this.positionButtons();
  }

  public destroy(): void {
    this.buttons.forEach(container => container.destroy());
    this.buttons.clear();
  }
}
