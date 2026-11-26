/**
 * Draws the placeholder upper deck and living-room stairs. Toggles which container
 * is visible for the active floor (ground vs upper placeholder).
 */
import Phaser from 'phaser';
import {
  FLOOR_GROUND,
  FLOOR_UPPER,
  type FloorId,
  UPPER_DECK,
  LIVING_STAIR_OPENING,
  floorBounds,
} from '../data/houseFloors';
import { STAIR_PAD_GROUND, STAIR_PAD_UPPER } from '../logic/floorMovement';

export class FloorView {
  readonly ground: Phaser.GameObjects.Container;
  readonly upper: Phaser.GameObjects.Container;
  private floor: FloorId = FLOOR_GROUND;

  constructor(private scene: Phaser.Scene) {
    this.ground = scene.add.container(0, 0).setDepth(-3);
    this.upper = scene.add.container(0, 0).setDepth(-3).setVisible(false);
    this.drawStairs();
    this.drawUpperPlaceholder();
  }

  host(): Phaser.GameObjects.Container {
    return this.ground;
  }

  getFloor(): FloorId {
    return this.floor;
  }

  showFloor(floor: FloorId): void {
    this.floor = floor;
    this.ground.setVisible(floor === FLOOR_GROUND);
    this.upper.setVisible(floor === FLOOR_UPPER);
  }

  cameraBounds(floor: FloorId = this.floor): { x: number; y: number; width: number; height: number } {
    return floorBounds(floor);
  }

  private drawStairs(): void {
    const g = this.scene.add.graphics();
    const o = LIVING_STAIR_OPENING;
    // Temporary stair graphic at the old window opening.
    g.fillStyle(0x4a3a2a, 1);
    g.fillRect(o.x, o.y - 8, o.width, o.height + 36);
    g.lineStyle(2, 0x8a6a4a, 1);
    for (let i = 0; i < 5; i++) {
      const y = o.y + 6 + i * 7;
      g.lineBetween(o.x + 8, y, o.x + o.width - 8, y);
    }
  g.fillStyle(0x6a5040, 0.9);
    g.fillRect(STAIR_PAD_GROUND.x, STAIR_PAD_GROUND.y, STAIR_PAD_GROUND.width, STAIR_PAD_GROUND.height);
    const label = this.scene.add.text(o.x + o.width / 2, o.y + 44, 'STAIRS (placeholder)', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '11px',
      color: '#c8b0a0',
      align: 'center',
    }).setOrigin(0.5, 0);
    this.ground.add([g, label]);
  }

  private drawUpperPlaceholder(): void {
    const d = UPPER_DECK;
    const floor = this.scene.add.rectangle(d.x + d.width / 2, d.y + d.height / 2, d.width, d.height, 0x7a6455)
      .setDepth(-2);
    const border = this.scene.add.graphics();
    border.lineStyle(3, 0x5a4538, 1);
    border.strokeRect(d.x, d.y, d.width, d.height);
    const title = this.scene.add.text(d.x + d.width / 2, d.y + 12, 'Upper floor — layout TBD', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '12px',
      color: '#e8d8c8',
      align: 'center',
    }).setOrigin(0.5, 0);
    const pad = this.scene.add.rectangle(
      STAIR_PAD_UPPER.x + STAIR_PAD_UPPER.width / 2,
      STAIR_PAD_UPPER.y + STAIR_PAD_UPPER.height / 2,
      STAIR_PAD_UPPER.width,
      STAIR_PAD_UPPER.height,
      0x6a5040,
      0.85,
    );
    this.upper.add([floor, border, title, pad]);
  }
}