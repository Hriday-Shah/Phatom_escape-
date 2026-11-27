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
import { FacingFilter } from '../logic/facingFilter';
import { FLOOR_GROUND, type FloorId } from '../data/houseFloors';
import type { FloorPose } from '../logic/floorMovement';
import { movementBlockersForFloor, resolveStairAfterMove } from '../logic/floorMovement';
import { integrateSlide } from '../logic/worldCollision';
import { DEFAULT_HOODIE_TINT } from '../lobby/lobby';

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
  /** Online: move with the shared slide instead of a private Arcade body. */
  private sharedSlide = false;
  /** Leftover milliseconds so every phone steps the slide at 60 Hz, whatever the refresh. */
  private slideDebt = 0;
  /** Wall, furniture, hiding-spot and door rects. The layout does not change mid-round. */
  private slideBlockers: { x: number; y: number; width: number; height: number }[] | null = null;
  private floorLevel: FloorId = FLOOR_GROUND;
  private onFloorChange: ((f: FloorId) => void) | null = null;
  /** Offline Arcade: stair pads are checked after the physics step (POST_UPDATE). */
  private footBeforePhysics: FloorPose = { x: 0, y: 0, f: FLOOR_GROUND };

  /** `hoodieTint`: colour for the hoodie layer (player_tint.png is a greyscale hoodie-only mask). */
  constructor(scene: Phaser.Scene, x: number, y: number, hoodieTint: number = DEFAULT_HOODIE_TINT) {
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
        .setTint(hoodieTint)
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
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.afterPhysicsStairs, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.syncLayers, this);
      scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.afterPhysicsStairs, this);
    });
  }

  private syncLayers(): void {
    if (this.tintSprite !== this.bodySprite) {
      this.tintSprite.setPosition(this.bodySprite.x, this.bodySprite.y);
    }
  }

  private afterPhysicsStairs(): void {
    if (this.sharedSlide) return;
    const resolved = resolveStairAfterMove(this.footBeforePhysics, this.x, this.y);
    if (resolved.f !== this.floorLevel) this.setFloor(resolved.f, resolved.x, resolved.y);
  }

  /** Current hoodie tint (QA / tests). */
  public getHoodieTint(): number {
    return this.tintSprite.tintTopLeft;
  }

  /** Body diameter in world units (for runtime sanity checks). */
  public getBodyDiameter(): number {
    return this.physics.width;
  }

  public setMovement(x: number, y: number): void {
    this.moveVector.set(x, y);
  }

  /** Stick this frame (the walk row and the pose both read this, not the body's velocity). */
  public getMoveInput(): { x: number; y: number } {
    return { x: this.moveVector.x, y: this.moveVector.y };
  }

  /**
   * Online rooms move with `integrateSlide`, the same function the server uses, and
   * ignore Arcade separation so a wall slide cannot diverge from the broadcast pose.
   */
  public useSharedSlide(on: boolean): void {
    this.sharedSlide = on;
    this.physics.setVelocity(0, 0);
    this.physics.moves = !on;
    this.physics.checkCollision.none = on;
  }

  public getFloor(): FloorId {
    return this.floorLevel;
  }

  public setFloor(floor: FloorId, x?: number, y?: number): void {
    const changed = this.floorLevel !== floor;
    this.floorLevel = floor;
    this.slideBlockers = null;
    if (x != null && y != null) this.physics.reset(x, y);
    if (changed) this.onFloorChange?.(floor);
  }

  public onFloorChanged(cb: (f: FloorId) => void): void {
    this.onFloorChange = cb;
  }

  public bumpBlockers(): void {
    this.slideBlockers = null;
  }

  /** Fixed 60 Hz slides. A 120 Hz phone must not take a different path around the table. */
  private stepSlide(dirX: number, dirY: number, delta: number): void {
    const step = 1000 / 60;
    this.slideDebt = Math.min(100, this.slideDebt + Math.max(0, delta));
    const blockers = this.slideBlockers ??= movementBlockersForFloor(this.floorLevel);
    let x = this.x;
    let y = this.y;
    let guard = 0;
    while (this.slideDebt >= step && guard++ < 8) {
      this.slideDebt -= step;
      const next = integrateSlide({ x, y }, dirX, dirY, step, blockers);
      x = next.x;
      y = next.y;
    }
    const stair = resolveStairAfterMove({ x: this.x, y: this.y, f: this.floorLevel }, x, y);
    if (stair.f !== this.floorLevel) {
      this.setFloor(stair.f, stair.x, stair.y);
    } else if (x !== this.x || y !== this.y) {
      this.physics.reset(x, y);
    }
  }

  /** Nudge the body by a server correction without waiting for the next step. */
  public shift(dx: number, dy: number): void {
    if (!dx && !dy) return;
    this.physics.reset(this.x + dx, this.y + dy);
  }

  public update(delta = 1000 / 60): void {
    this.footBeforePhysics = { x: this.x, y: this.y, f: this.floorLevel };
    const hasArt = this.scene.textures.exists('player') && this.tintSprite !== this.bodySprite;
    
    if (this.moveVector.length() > 0) {
      const normalized = this.moveVector.clone().normalize();
      this.updateFacing(normalized);
      if (this.sharedSlide) {
        this.physics.setVelocity(0, 0);
        this.stepSlide(normalized.x, normalized.y, delta);
      } else {
        this.physics.setVelocity(normalized.x * this.speed, normalized.y * this.speed);
        this.slideBlockers = movementBlockersForFloor(this.floorLevel);
      }
      
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
      this.slideDebt = 0;
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
    const f = this.facingFilter.facing;
    return { x: f.x, y: f.y };
  }

  static readonly FACING_HOLD_FRAMES = FacingFilter.HOLD_FRAMES;
  private facingFilter = new FacingFilter();

  private updateFacing(dir: Phaser.Math.Vector2): void {
    this.facingFilter.update(dir);
  }

  /** Stand on a pose the server already has (a reload or the first snapshot). */
  public place(x: number, y: number, floor: FloorId = FLOOR_GROUND): void {
    this.setFloor(floor, x, y);
    this.syncLayers();
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
