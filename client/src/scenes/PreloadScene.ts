import Phaser from 'phaser';
import { TextureGenerator } from '../config/textureGenerator';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PreloadScene' });
  }

  preload(): void {
    // Show loading text
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    
    const loadingText = this.add.text(width / 2, height / 2, 'Loading...', {
      fontSize: '32px',
      color: '#ffffff',
    }).setOrigin(0.5);

    // Generate all placeholder textures
    TextureGenerator.generateAll(this);
    
    loadingText.destroy();
  }

  create(): void {
    this.scene.start('GameScene');
  }
}
