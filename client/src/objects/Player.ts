import Phaser from 'phaser';
import { TextureKeys } from '../config/textureKeys';

export class Player {
  private scene: Phaser.Scene;
  private speed = 200;
  private moveVector: Phaser.Math.Vector2;
  private tintSprite: Phaser.GameObjects.Sprite;
  private bodySprite: Phaser.GameObjects.Sprite;
  private physics: Phaser.Physics.Arcade.Body;
  private lastDirection: string = 'down';

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.moveVector = new Phaser.Math.Vector2(0, 0);
    
    // Check if art is available
    const hasPlayerArt = scene.textures.exists('player');
    const hasTintArt = scene.textures.exists('player_tint');
    console.log(`🎨 Player art check: player=${hasPlayerArt}, player_tint=${hasTintArt}`);
    
    if (hasPlayerArt && hasTintArt) {
      // Create animations if not already created
      if (!scene.anims.exists('walk_down')) {
        console.log('Creating player animations...');
        ['down', 'left', 'right', 'up'].forEach((dir, row) => {
          scene.anims.create({
            key: `walk_${dir}`,
            frames: scene.anims.generateFrameNumbers('player', { start: row * 4, end: row * 4 + 3 }),
            frameRate: 8,
            repeat: -1,
          });
          scene.anims.create({
            key: `walk_${dir}_tint`,
            frames: scene.anims.generateFrameNumbers('player_tint', { start: row * 4, end: row * 4 + 3 }),
            frameRate: 8,
            repeat: -1,
          });
        });
        console.log('✅ Player animations created');
      }
      
      // Validate spritesheet frames (should have 16 frames: 4 directions × 4 frames)
      const playerTexture = scene.textures.get('player');
      const playerFrameCount = playerTexture.frameTotal;
      const tintTexture = scene.textures.get('player_tint');
      const tintFrameCount = tintTexture.frameTotal;
      
      if (playerFrameCount !== 16) {
        console.error(`❌ Player spritesheet has ${playerFrameCount} frames, expected 16`);
        throw new Error(`Invalid player spritesheet: has ${playerFrameCount} frames, expected 16 (4 directions × 4 frames)`);
      }
      
      if (tintFrameCount !== 16) {
        console.error(`❌ Player tint spritesheet has ${tintFrameCount} frames, expected 16`);
        throw new Error(`Invalid player_tint spritesheet: has ${tintFrameCount} frames, expected 16`);
      }
      
      console.log(`✅ Player spritesheets validated: ${playerFrameCount} frames each`);
      
      // Layer: tint sprite UNDER body sprite, both at 2x scale
      this.tintSprite = scene.add.sprite(x, y, 'player_tint', 0)
        .setScale(2)
        .setTint(0x5FD3E6)
        .setDepth(9);
        
      this.bodySprite = scene.add.sprite(x, y, 'player', 0)
        .setScale(2)
        .setDepth(10);
        
      console.log('✅ Player sprites created with art');
    } else {
      // Fallback to placeholder (use ph_ prefix)
      console.warn('⚠️ Using placeholder player (art not loaded)');
      this.bodySprite = scene.add.sprite(x, y, 'ph_' + TextureKeys.PLAYER)
        .setScale(1)
        .setDepth(10);
      this.tintSprite = this.bodySprite; // No separate layer
    }
    
    // Physics on body sprite
    scene.physics.add.existing(this.bodySprite);
    this.physics = this.bodySprite.body as Phaser.Physics.Arcade.Body;
    this.physics.setCircle(16);
    this.physics.setCollideWorldBounds(true);
  }

  public setMovement(x: number, y: number): void {
    this.moveVector.set(x, y);
  }

  public update(): void {
    const hasArt = this.scene.textures.exists('player') && this.tintSprite !== this.bodySprite;
    
    if (this.moveVector.length() > 0) {
      const normalized = this.moveVector.clone().normalize();
      this.physics.setVelocity(normalized.x * this.speed, normalized.y * this.speed);
      
      // Determine direction (prioritize horizontal)
      let direction = 'down';
      if (Math.abs(normalized.x) > Math.abs(normalized.y)) {
        direction = normalized.x > 0 ? 'right' : 'left';
      } else {
        direction = normalized.y > 0 ? 'down' : 'up';
      }
      
      if (direction !== this.lastDirection) {
        this.lastDirection = direction;
      }
      
      // Play walk animation if art exists
      if (hasArt && this.scene.anims.exists(`walk_${direction}`)) {
        this.bodySprite.play(`walk_${direction}`, true);
        if (this.tintSprite !== this.bodySprite) {
          this.tintSprite.play(`walk_${direction}_tint`, true);
        }
      }
    } else {
      this.physics.setVelocity(0, 0);
      
      // Stop on idle frame (col 0 of each row)
      if (hasArt) {
        const dirIndex = ['down', 'left', 'right', 'up'].indexOf(this.lastDirection);
        const idleFrame = dirIndex * 4; // row * 4 + 0
        this.bodySprite.stop().setFrame(idleFrame);
        if (this.tintSprite !== this.bodySprite) {
          this.tintSprite.stop().setFrame(idleFrame);
        }
      }
    }
    
    // Sync tint sprite position
    if (this.tintSprite !== this.bodySprite) {
      this.tintSprite.setPosition(this.bodySprite.x, this.bodySprite.y);
    }
  }

  public getPosition(): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(this.bodySprite.x, this.bodySprite.y);
  }

  public get x(): number {
    return this.bodySprite.x;
  }

  public get y(): number {
    return this.bodySprite.y;
  }

  public getBody(): Phaser.Physics.Arcade.Body {
    return this.physics;
  }
}
