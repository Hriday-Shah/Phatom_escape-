import Phaser from 'phaser';
import { TextureKeys } from '../config/textureKeys';
import { SafeAreaManager } from '../utils/SafeAreaManager';

export class UIControls {
  private scene: Phaser.Scene;
  private buttons: Map<string, Phaser.GameObjects.Container> = new Map();
  private buttonSize = 60;
  private buttonSpacing = 20;
  private margin = 20; // Minimum margin from edge

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.createButtons();
    this.positionButtons();
    
    // Reposition on safe area changes
    SafeAreaManager.onInsetsChange(() => this.positionButtons());
  }

  private createButtons(): void {
    const buttonConfigs = [
      { id: 'interact', label: 'E', enabled: true },
      { id: 'drop', label: 'Drop', enabled: false },
      { id: 'sneak', label: 'Sneak', enabled: false },
      { id: 'shoot', label: 'Shoot', enabled: false },
    ];

    buttonConfigs.forEach((config) => {
      const container = this.scene.add.container(0, 0)
        .setScrollFactor(0)
        .setDepth(1000);

      const button = this.scene.add.image(0, 0, 
        config.enabled ? TextureKeys.BUTTON : TextureKeys.BUTTON_DISABLED
      ).setInteractive(config.enabled ? undefined : { enabled: false });

      const text = this.scene.add.text(0, 0, config.label, {
        fontSize: '16px',
        color: config.enabled ? '#ffffff' : '#888888',
        fontStyle: 'bold',
      }).setOrigin(0.5);

      container.add([button, text]);
      this.buttons.set(config.id, container);

      if (config.enabled && config.id === 'interact') {
        button.on('pointerdown', () => {
          this.scene.events.emit('interact');
        });
      }
    });
  }

  private positionButtons(): void {
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const insets = SafeAreaManager.getInsets();
    
    // Position in bottom-right, offset by safe area
    const rightMargin = this.margin + insets.right;
    const bottomMargin = this.margin + insets.bottom;

    let yOffset = 0;
    this.buttons.forEach((container) => {
      container.setPosition(
        width - rightMargin,
        height - bottomMargin - yOffset
      );
      yOffset += this.buttonSize + this.buttonSpacing;
    });
  }

  public resize(): void {
    this.positionButtons();
  }

  public destroy(): void {
    this.buttons.forEach(container => container.destroy());
    this.buttons.clear();
  }
}
