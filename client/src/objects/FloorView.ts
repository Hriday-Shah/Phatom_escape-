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

/** Above mounted furniture in the ground container; below players (9+). Never reparented. */
const LIVING_STAIRS_DEPTH = 6;

export class FloorView {
  readonly ground: Phaser.GameObjects.Container;
  readonly upper: Phaser.GameObjects.Container;
  /** Scene-root layer so mountGroundFloorArt never buries the stairs. */
  readonly stairsLayer: Phaser.GameObjects.Container;
  private floor: FloorId = FLOOR_GROUND;
  private livingStairs: Phaser.GameObjects.GameObject[] = [];

  constructor(private scene: Phaser.Scene) {
    this.ground = scene.add.container(0, 0).setDepth(-3);
    this.upper = scene.add.container(0, 0).setDepth(-3).setVisible(false);
    this.stairsLayer = scene.add.container(0, 0).setDepth(LIVING_STAIRS_DEPTH);
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
    const groundOn = floor === FLOOR_GROUND;
    this.ground.setVisible(groundOn);
    this.upper.setVisible(floor === FLOOR_UPPER);
    this.stairsLayer.setVisible(groundOn);
  }

  /**
   * Living-room stairs at the old window opening. Call after mountGroundFloorArt() so
   * floor tiles and walls are not drawn on top of this placeholder.
   */
  drawLivingStairs(): void {
    if (this.livingStairs.length) return;
    const o = LIVING_STAIR_OPENING;
    const host = this.stairsLayer;
    const g = this.scene.add.graphics();
    g.fillStyle(0x5a4538, 1);
    g.fillRect(o.x, o.y - 4, o.width, o.height + 52);
    g.fillStyle(0x3d2e22, 1);
    g.fillRect(o.x + 6, o.y + 2, o.width - 12, o.height + 42);
    g.lineStyle(2, 0xc4a882, 0.95);
    for (let i = 0; i < 7; i++) {
      const y = o.y + 6 + i * 9;
      g.lineBetween(o.x + 10, y, o.x + o.width - 10, y);
    }
    g.lineStyle(3, 0xffd080, 1);
    g.strokeRect(STAIR_PAD_GROUND.x, STAIR_PAD_GROUND.y, STAIR_PAD_GROUND.width, STAIR_PAD_GROUND.height);
    g.fillStyle(0xc08040, 0.75);
    g.fillRect(STAIR_PAD_GROUND.x, STAIR_PAD_GROUND.y, STAIR_PAD_GROUND.width, STAIR_PAD_GROUND.height);
    const label = this.scene.add.text(o.x + o.width / 2, o.y + 56, 'STAIRS', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#fff0d0',
      stroke: '#201008',
      strokeThickness: 4,
      align: 'center',
    }).setOrigin(0.5, 0);
    host.add([g, label]);
    this.livingStairs = [g, label];
  }

  cameraBounds(floor: FloorId = this.floor): { x: number; y: number; width: number; height: number } {
    return floorBounds(floor);
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