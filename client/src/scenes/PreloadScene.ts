import Phaser from 'phaser';
import { TextureGenerator } from '../config/textureGenerator';

export class PreloadScene extends Phaser.Scene {
  private loadedArtCount = 0;
  
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
    
    // Load art manifest with relative URL
    const basePath = import.meta.env.BASE_URL || '/';
    this.load.json('artManifest', `${basePath}assets/manifest.json`);
    
    this.load.once('complete', () => {
      loadingText.destroy();
      this.loadArtAssets();
    });
  }

  private loadArtAssets(): void {
    const manifest = this.cache.json.get('artManifest');
    
    if (!manifest) {
      console.warn('⚠️ manifest.json not found, using placeholders');
      this.scene.start('GameScene');
      return;
    }
    
    if (!manifest.assets || !Array.isArray(manifest.assets)) {
      console.error('❌ Invalid manifest schema: missing assets array');
      this.scene.start('GameScene');
      return;
    }
    
    // Filter approved assets only
    const approvedAssets = manifest.assets.filter(
      (asset: any) => asset.status === 'approved'
    );
    
    console.log(`📦 Loading ${approvedAssets.length} approved art assets...`);
    
    const basePath = import.meta.env.BASE_URL || '/';
    
    // Load each approved asset
    for (const asset of approvedAssets) {
      const url = `${basePath}assets/${asset.file}`;
      
      if (asset.spritesheet) {
        this.load.spritesheet(asset.key, url, {
          frameWidth: asset.spritesheet.frameWidth,
          frameHeight: asset.spritesheet.frameHeight,
        });
      } else {
        this.load.image(asset.key, url);
      }
    }
    
    this.load.on('loaderror', (file: any) => {
      console.error(`❌ Failed to load: ${file.key} from ${file.url}`);
    });
    
    this.load.once('complete', () => {
      // Count successfully loaded textures
      this.loadedArtCount = approvedAssets.filter(
        (asset: any) => this.textures.exists(asset.key)
      ).length;
      
      console.log(`✅ Loaded ${this.loadedArtCount}/${approvedAssets.length} art textures`);
      
      if (this.loadedArtCount === 0) {
        console.warn('⚠️ No art textures loaded, using placeholders');
      }
      
      this.scene.start('GameScene');
    });
    
    this.load.start();
  }

  create(): void {
    // Loading happens in preload, this is just for Phaser lifecycle
  }
}
