import Phaser from 'phaser';
import { TextureKeys } from '../config/textureKeys';

export class Player extends Phaser.Physics.Arcade.Sprite {
  private speed = 200;
  private moveVector: Phaser.Math.Vector2;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TextureKeys.PLAYER);
    
    scene.add.existing(this);
    scene.physics.add.existing(this);
    
    this.setCircle(16);
    this.setCollideWorldBounds(true);
    this.setDepth(10);
    
    this.moveVector = new Phaser.Math.Vector2(0, 0);
  }

  public setMovement(x: number, y: number): void {
    this.moveVector.set(x, y);
  }

  public update(): void {
    if (this.moveVector.length() > 0) {
      const normalizedVector = this.moveVector.clone().normalize();
      this.setVelocity(
        normalizedVector.x * this.speed,
        normalizedVector.y * this.speed
      );
      
      // Rotate player to face movement direction
      if (normalizedVector.length() > 0) {
        this.rotation = Math.atan2(normalizedVector.y, normalizedVector.x) + Math.PI / 2;
      }
    } else {
      this.setVelocity(0, 0);
    }
  }

  public getPosition(): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(this.x, this.y);
  }
}
