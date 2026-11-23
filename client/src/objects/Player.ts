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
    const hasArt = scene.textures.exists('player') && scene.textures.exists('player_tint');
    
    if (hasArt) {
      // Create animations if not already created
      if (!scene.anims.exists('walk_down')) {
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
      }
      
      // Layer: tint sprite under body sprite
      this.tintSprite = scene.add.sprite(x, y, 'player_tint', 0).setScale(2).setTint(0x5FD3E6);
      this.bodySprite = scene.add.sprite(x, y, 'player', 0).setScale(2);
      this.bodySprite.setDepth(10);
      this.tintSprite.setDepth(9);
    } else {
      // Fallback to placeholder
      this.bodySprite = scene.add.sprite(x, y, TextureKeys.PLAYER).setScale(1);
      this.tintSprite = this.bodySprite; // No separate layer
      this.bodySprite.setDepth(10);
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
    const hasArt = this.scene.textures.exists('player');
    
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
        this.tintSprite.play(`walk_${direction}_tint`, true);
      }
    } else {
      this.physics.setVelocity(0, 0);
      
      // Stop on idle frame
      if (hasArt) {
        const dirIndex = ['down', 'left', 'right', 'up'].indexOf(this.lastDirection);
        this.bodySprite.stop().setFrame(dirIndex * 4);
        this.tintSprite.stop().setFrame(dirIndex * 4);
      }
    }
    
    // Sync tint sprite position
    this.tintSprite.setPosition(this.bodySprite.x, this.bodySprite.y);
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
