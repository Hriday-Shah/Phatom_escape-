/**
 * Automated pathfinding test to verify all rooms are reachable from spawn.
 * Uses a grid-based flood-fill algorithm at the player's body size.
 */

import { houseLayout, Wall, Door } from '../data/houseLayout';

const PLAYER_RADIUS = 16; // Must match Player.ts setCircle(16)
const GRID_SIZE = 4; // Grid resolution (smaller = more accurate but slower)
const SPAWN_X = 300;
const SPAWN_Y = 430;

interface Point {
  x: number;
  y: number;
}

class PathfindingValidator {
  private grid: boolean[][]; // true = walkable, false = blocked
  private width: number;
  private height: number;
  private gridWidth: number;
  private gridHeight: number;

  constructor() {
    this.width = houseLayout.width;
    this.height = houseLayout.height;
    this.gridWidth = Math.ceil(this.width / GRID_SIZE);
    this.gridHeight = Math.ceil(this.height / GRID_SIZE);
    this.grid = Array(this.gridHeight)
      .fill(null)
      .map(() => Array(this.gridWidth).fill(true));
  }

  private worldToGrid(x: number, y: number): Point {
    return {
      x: Math.floor(x / GRID_SIZE),
      y: Math.floor(y / GRID_SIZE),
    };
  }

  private isColliding(worldX: number, worldY: number, walls: Wall[], doors: Door[]): boolean {
    // Check if a circle at (worldX, worldY) with PLAYER_RADIUS collides with any wall or door
    for (const wall of walls) {
      if (this.circleRectCollision(worldX, worldY, PLAYER_RADIUS, wall)) {
        return true;
      }
    }
    for (const door of doors) {
      if (this.circleRectCollision(worldX, worldY, PLAYER_RADIUS, door)) {
        return true;
      }
    }
    return false;
  }

  private circleRectCollision(
    cx: number,
    cy: number,
    radius: number,
    rect: { x: number; y: number; width: number; height: number }
  ): boolean {
    // Find the closest point on the rectangle to the circle
    const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.width));
    const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.height));

    // Calculate distance from circle center to closest point
    const dx = cx - closestX;
    const dy = cy - closestY;
    const distanceSquared = dx * dx + dy * dy;

    return distanceSquared < radius * radius;
  }

  public buildCollisionGrid(): void {
    // Mark all cells that would cause collision
    for (let gy = 0; gy < this.gridHeight; gy++) {
      for (let gx = 0; gx < this.gridWidth; gx++) {
        const worldX = gx * GRID_SIZE + GRID_SIZE / 2;
        const worldY = gy * GRID_SIZE + GRID_SIZE / 2;

        if (this.isColliding(worldX, worldY, houseLayout.walls, houseLayout.doors)) {
          this.grid[gy][gx] = false;
        }

        // Check blocking furniture
        for (const furniture of houseLayout.furniture) {
          if (furniture.blocking && this.circleRectCollision(worldX, worldY, PLAYER_RADIUS, furniture)) {
            this.grid[gy][gx] = false;
          }
        }
      }
    }
  }

  public floodFill(startX: number, startY: number): Set<string> {
    const startGrid = this.worldToGrid(startX, startY);
    const visited = new Set<string>();
    const queue: Point[] = [startGrid];

    if (!this.grid[startGrid.y]?.[startGrid.x]) {
      throw new Error(`Spawn point (${startX}, ${startY}) is blocked!`);
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      const key = `${current.x},${current.y}`;

      if (visited.has(key)) continue;
      visited.add(key);

      // Check 4 directions
      const neighbors = [
        { x: current.x - 1, y: current.y },
        { x: current.x + 1, y: current.y },
        { x: current.x, y: current.y - 1 },
        { x: current.x, y: current.y + 1 },
      ];

      for (const neighbor of neighbors) {
        if (
          neighbor.x >= 0 &&
          neighbor.x < this.gridWidth &&
          neighbor.y >= 0 &&
          neighbor.y < this.gridHeight &&
          this.grid[neighbor.y][neighbor.x] &&
          !visited.has(`${neighbor.x},${neighbor.y}`)
        ) {
          queue.push(neighbor);
        }
      }
    }

    return visited;
  }

  public isRoomReachable(roomId: string, reachableCells: Set<string>): boolean {
    const room = houseLayout.rooms.find((r) => r.id === roomId);
    if (!room) return false;

    // Check if any cell in the room is reachable
    const roomGridStart = this.worldToGrid(room.x + PLAYER_RADIUS, room.y + PLAYER_RADIUS);
    const roomGridEnd = this.worldToGrid(
      room.x + room.width - PLAYER_RADIUS,
      room.y + room.height - PLAYER_RADIUS
    );

    for (let gy = roomGridStart.y; gy <= roomGridEnd.y; gy++) {
      for (let gx = roomGridStart.x; gx <= roomGridEnd.x; gx++) {
        if (reachableCells.has(`${gx},${gy}`)) {
          return true;
        }
      }
    }

    return false;
  }

  private checkEscapes(reachableCells: Set<string>): string[] {
    const escapes: string[] = [];
    
    // Define the house's outer boundary (margins around all rooms)
    const minX = 60; // 10px before leftmost room (bedroom at x=70)
    const minY = 90; // 10px before topmost room (bathroom/living at y=100)
    const maxX = 1030; // 10px after rightmost room (kitchen at x=1020)
    const maxY = 570; // 10px after bottommost room (kitchen at y=560)
    
    // Check if any reachable cell is outside the boundary
    for (const key of reachableCells) {
      const [gxStr, gyStr] = key.split(',');
      const gx = parseInt(gxStr, 10);
      const gy = parseInt(gyStr, 10);
      
      const worldX = gx * GRID_SIZE + GRID_SIZE / 2;
      const worldY = gy * GRID_SIZE + GRID_SIZE / 2;
      
      if (worldX < minX || worldX > maxX || worldY < minY || worldY > maxY) {
        escapes.push(`Cell at (${worldX.toFixed(0)}, ${worldY.toFixed(0)}) is outside house boundary!`);
      }
    }
    
    return escapes;
  }

  public validateLayout(): { success: boolean; errors: string[] } {
    const errors: string[] = [];

    console.log('Building collision grid...');
    this.buildCollisionGrid();

    console.log('Running flood-fill from spawn point...');
    let reachableCells: Set<string>;
    try {
      reachableCells = this.floodFill(SPAWN_X, SPAWN_Y);
    } catch (error) {
      errors.push((error as Error).message);
      return { success: false, errors };
    }

    console.log(`Found ${reachableCells.size} reachable cells`);

    // Check for escapes outside the house
    console.log('Checking for escapes outside house boundary...');
    const escapes = this.checkEscapes(reachableCells);
    if (escapes.length > 0) {
      errors.push(`Player can escape outside the house! Found ${escapes.length} escape points:`);
      escapes.slice(0, 5).forEach((escape) => {
        errors.push(`  - ${escape}`);
      });
      if (escapes.length > 5) {
        errors.push(`  ... and ${escapes.length - 5} more`);
      }
    } else {
      console.log('✓ No escapes found - house boundary is sealed');
    }

    // Rooms that should be reachable (bedroom is locked)
    const expectedReachable = ['entrance', 'living', 'dining', 'foyer', 'bathroom', 'kitchen'];
    const expectedBlocked = ['bedroom'];

    for (const roomId of expectedReachable) {
      if (!this.isRoomReachable(roomId, reachableCells)) {
        const room = houseLayout.rooms.find((r) => r.id === roomId);
        errors.push(`Room "${room?.name}" (${roomId}) is NOT reachable from spawn!`);
      } else {
        console.log(`✓ Room "${roomId}" is reachable`);
      }
    }

    for (const roomId of expectedBlocked) {
      if (this.isRoomReachable(roomId, reachableCells)) {
        const room = houseLayout.rooms.find((r) => r.id === roomId);
        errors.push(`Room "${room?.name}" (${roomId}) should be locked but is reachable!`);
      } else {
        console.log(`✓ Room "${roomId}" is correctly blocked`);
      }
    }

    return { success: errors.length === 0, errors };
  }
}

export function runPathfindingTest(): void {
  console.log('=== PATHFINDING TEST ===');
  console.log(`Player radius: ${PLAYER_RADIUS}px`);
  console.log(`Spawn point: (${SPAWN_X}, ${SPAWN_Y})`);
  console.log(`Grid size: ${GRID_SIZE}px`);
  console.log('');

  const validator = new PathfindingValidator();
  const result = validator.validateLayout();

  console.log('');
  if (result.success) {
    console.log('✅ PATHFINDING TEST PASSED');
    console.log('All expected rooms are reachable, and locked rooms are blocked.');
  } else {
    console.error('❌ PATHFINDING TEST FAILED');
    result.errors.forEach((error) => console.error(`  - ${error}`));
    throw new Error('Pathfinding validation failed');
  }
}
