import Phaser from 'phaser';
import { TextureKeys } from '../config/textureKeys';
import {
  PLAYER_BODY_OFFSET_FRAME,
  PLAYER_BODY_RADIUS,
  PLAYER_BODY_RADIUS_FRAME,
  PLAYER_SPRITE_SCALE,
} from '../config/playerConfig';
import { devLog } from '../config/display';
import { PLAYER_SPEED } from '../config/physicsConfig';

// Re-exported so callers (and tests, via config/playerConfig) share one source of truth.
export { PLAYER_BODY_RADIUS, PLAYER_BODY_RADIUS_FRAME } from '../config/playerConfig';

export class Player {
  private scene: Phaser.Scene;
  private speed = PLAYER_SPEED;
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
    
    if (hasPlayerArt && hasTintArt) {
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
      
      // Validate spritesheet frames (should have 16 frames: 4 directions × 4 frames)
      const playerTexture = scene.textures.get('player');
      const playerFrameCount = playerTexture.frameTotal - 1; // frameTotal includes Phaser's __BASE frame
      const tintTexture = scene.textures.get('player_tint');
      const tintFrameCount = tintTexture.frameTotal - 1;
      
      if (playerFrameCount !== 16) {
        throw new Error(`Invalid player spritesheet: has ${playerFrameCount} frames, expected 16 (4 directions × 4 frames)`);
      }
      
      if (tintFrameCount !== 16) {
        throw new Error(`Invalid player_tint spritesheet: has ${tintFrameCount} frames, expected 16`);
      }
      
      // Layer: tint sprite UNDER body sprite, both at 2x scale
      this.tintSprite = scene.add.sprite(x, y, 'player_tint', 0)
        .setScale(PLAYER_SPRITE_SCALE)
        .setTint(0x5FD3E6)
        .setDepth(9);
        
      this.bodySprite = scene.add.sprite(x, y, 'player', 0)
        .setScale(PLAYER_SPRITE_SCALE)
        .setDepth(10);
    } else {
      // Fallback to placeholder (use ph_ prefix)
      devLog('Using placeholder player (art not loaded)');
      this.bodySprite = scene.add.sprite(x, y, 'ph_' + TextureKeys.PLAYER)
        .setScale(1)
        .setDepth(10);
      this.tintSprite = this.bodySprite; // No separate layer
    }
    
    // Physics on body sprite
    scene.physics.add.existing(this.bodySprite);
    this.physics = this.bodySprite.body as Phaser.Physics.Arcade.Body;
    // Body.setCircle takes UNSCALED frame pixels; Arcade multiplies by the sprite scale.
    // Radius 8 on a 16px frame at 2x = a 32px body, offset 0 centres it on the sprite.
    if (this.bodySprite.scaleX === PLAYER_SPRITE_SCALE) {
      this.physics.setCircle(PLAYER_BODY_RADIUS_FRAME, PLAYER_BODY_OFFSET_FRAME, PLAYER_BODY_OFFSET_FRAME);
    } else {
      // Placeholder texture at scale 1: centre a PLAYER_BODY_RADIUS circle on its frame.
      const off = this.bodySprite.width / 2 - PLAYER_BODY_RADIUS;
      this.physics.setCircle(PLAYER_BODY_RADIUS, off, off);
    }
    this.physics.setCollideWorldBounds(true);

    // Keep the colour layer glued to the body sprite AFTER Arcade has moved it this frame.
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.syncLayers, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.syncLayers, this);
    });
  }

  private syncLayers(): void {
    if (this.tintSprite !== this.bodySprite) {
      this.tintSprite.setPosition(this.bodySprite.x, this.bodySprite.y);
    }
  }

  /** Body diameter in world units (for runtime sanity checks). */
  public getBodyDiameter(): number {
    return this.physics.width;
  }

  public setMovement(x: number, y: number): void {
    this.moveVector.set(x, y);
  }

  public update(): void {
    const hasArt = this.scene.textures.exists('player') && this.tintSprite !== this.bodySprite;
    
    if (this.moveVector.length() > 0) {
      const normalized = this.moveVector.clone().normalize();
      this.updateFacing(normalized);
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
    
    // Tint layer position is synced in POST_UPDATE (after the physics step).
  }

  /**
   * Unit vector of the way the player faces (8-way on keys, any angle on the joystick); idle
   * keeps the last one. A new direction only counts once held for FACING_HOLD_FRAMES, so
   * letting go of two keys a frame apart keeps the diagonal.
   */
  public getFacing(): { x: number; y: number } {
    return { x: this.facing.x, y: this.facing.y };
  }

  static readonly FACING_HOLD_FRAMES = 3;
  private facing = new Phaser.Math.Vector2(0, 1);
  private pendingFacing = new Phaser.Math.Vector2(0, 1);
  private pendingFrames = 0;

  private updateFacing(dir: Phaser.Math.Vector2): void {
    if (this.pendingFacing.distance(dir) < 0.2) this.pendingFrames++;
    else { this.pendingFacing.copy(dir); this.pendingFrames = 1; }
    if (this.pendingFrames >= Player.FACING_HOLD_FRAMES) this.facing.copy(this.pendingFacing);
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
