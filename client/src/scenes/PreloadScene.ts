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

    // Generate placeholder textures (fallback)
    TextureGenerator.generateAll(this);
    
    // Load art manifest and assets
    this.load.json('artManifest', 'assets/manifest.json');
    
    loadingText.destroy();
  }

  create(): void {
    // Load art assets from manifest
    const manifest = this.cache.json.get('artManifest');
    if (manifest?.assets) {
      this.load.once('complete', () => this.scene.start('GameScene'));
      
      for (const asset of manifest.assets) {
        const key = asset.key;
        const url = `assets/${asset.file}`;
        
        if (asset.spritesheet) {
          this.load.spritesheet(key, url, {
            frameWidth: asset.spritesheet.frameWidth,
            frameHeight: asset.spritesheet.frameHeight,
          });
        } else {
          this.load.image(key, url);
        }
      }
      
      this.load.start();
    } else {
      this.scene.start('GameScene');
    }
  }

}
