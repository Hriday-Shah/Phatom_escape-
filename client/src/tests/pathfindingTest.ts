/**
 * Automated pathfinding test to verify all rooms are reachable from spawn.
 * Uses a grid-based flood-fill algorithm at the player's body size.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { houseLayout, Wall, Door } from '../data/houseLayout';
import {
  FACINGS_8, Interactable, buildInteractables, isEligible, selectTarget, sightBlockers,
} from '../logic/spotTargeting';
import {
  PLAYER_BODY_OFFSET_FRAME,
  PLAYER_BODY_RADIUS,
  PLAYER_BODY_RADIUS_FRAME,
  PLAYER_FRAME_SIZE,
  PLAYER_SPRITE_SCALE,
} from '../config/playerConfig';

// The REAL body radius Player.ts gives Arcade (setCircle(PLAYER_BODY_RADIUS_FRAME) on a
// PLAYER_SPRITE_SCALE sprite). Player.ts imports the same constants, so this can't drift.
const PLAYER_RADIUS = PLAYER_BODY_RADIUS;
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

  private doors: Door[];

  constructor(doors: Door[] = houseLayout.doors) {
    this.doors = doors;
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

        if (this.isColliding(worldX, worldY, houseLayout.walls, this.doors)) {
          this.grid[gy][gx] = false;
        }

        // Check blocking furniture
        for (const furniture of houseLayout.furniture) {
          if (furniture.blocking && this.circleRectCollision(worldX, worldY, PLAYER_RADIUS, furniture)) {
            this.grid[gy][gx] = false;
          }
        }

        // Check hiding spots (all are solid)
        for (const spot of houseLayout.hidingSpots) {
          if (this.circleRectCollision(worldX, worldY, PLAYER_RADIUS, spot)) {
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

  public countRoomCells(roomId: string, reachableCells: Set<string>): number {
    const room = houseLayout.rooms.find((r) => r.id === roomId);
    if (!room) return 0;

    let count = 0;
    const roomGridStart = this.worldToGrid(room.x + PLAYER_RADIUS, room.y + PLAYER_RADIUS);
    const roomGridEnd = this.worldToGrid(
      room.x + room.width - PLAYER_RADIUS,
      room.y + room.height - PLAYER_RADIUS
    );

    for (let gy = roomGridStart.y; gy <= roomGridEnd.y; gy++) {
      for (let gx = roomGridStart.x; gx <= roomGridEnd.x; gx++) {
        if (reachableCells.has(`${gx},${gy}`)) {
          count++;
        }
      }
    }

    return count;
  }

  private checkEscapes(reachableCells: Set<string>): string[] {
    const escapes: string[] = [];
    
    // Define the house's outer boundary (margins around all rooms)
    const minX = Math.min(...houseLayout.rooms.map((r) => r.x)) - 10;
    const minY = Math.min(...houseLayout.rooms.map((r) => r.y)) - 10;
    const maxX = Math.max(...houseLayout.rooms.map((r) => r.x + r.width)) + 10;
    const maxY = Math.max(...houseLayout.rooms.map((r) => r.y + r.height)) + 10;
    
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

  /** Is any reachable cell within `range` of (x, y)? */
  public anyReachableWithin(reachableCells: Set<string>, x: number, y: number, range: number): boolean {
    for (const key of reachableCells) {
      const [gx, gy] = key.split(',').map((v) => parseInt(v, 10));
      const wx = gx * GRID_SIZE + GRID_SIZE / 2;
      const wy = gy * GRID_SIZE + GRID_SIZE / 2;
      if (Math.hypot(wx - x, wy - y) <= range) return true;
    }
    return false;
  }

  /** Flood fill from spawn (no assertions), for the debug-unlock scenario. */
  public reachableFromSpawn(): Set<string> {
    this.buildCollisionGrid();
    return this.floodFill(SPAWN_X, SPAWN_Y);
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

    // Show per-room reachable cell counts
    console.log('\nPer-room reachable cell counts:');
    const allRooms = [...houseLayout.rooms];
    allRooms.forEach((room) => {
      const count = this.countRoomCells(room.id, reachableCells);
      console.log(`  ${room.name.padEnd(15)} (${room.id.padEnd(10)}): ${count.toString().padStart(5)} cells`);
    });
    console.log('');

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
      const count = this.countRoomCells(roomId, reachableCells);
      if (count === 0) {
        const room = houseLayout.rooms.find((r) => r.id === roomId);
        errors.push(`Room "${room?.name}" (${roomId}) is NOT reachable from spawn!`);
      } else {
        console.log(`✓ Room "${roomId}" is reachable (${count} cells)`);
      }
    }

    for (const roomId of expectedBlocked) {
      const count = this.countRoomCells(roomId, reachableCells);
      if (count > 0) {
        const room = houseLayout.rooms.find((r) => r.id === roomId);
        errors.push(`Room "${room?.name}" (${roomId}) should be locked but has ${count} reachable cells!`);
      } else {
        console.log(`✓ Room "${roomId}" is correctly blocked`);
      }
    }

    // Every individual spot / drawer / door / cushion (except the locked bedroom's) must be
    // the one the game targets from some reachable floor cell (in range, line of sight, and it
    // wins the nearest + facing choice for at least one of the 4 facings).
    console.log('\nChecking hiding spot / drawer reachability...');
    const bedroomUnits = ['study_drawer_1', 'study_drawer_2', 'study_drawer_3', 'bed', 'bedside_drawer', 'closet_drawers'];
    const items = buildInteractables(houseLayout.hidingSpots);
    const outside = items.filter((it) => !bedroomUnits.includes(it.unitId));
    console.log(`  Skipping ${items.length - outside.length} spots in the locked bedroom`);
    errors.push(...checkInteractable(this.doors, outside, ''));
    if (!errors.some((e) => e.startsWith('Spot '))) console.log(`✓ All ${outside.length} spots outside the bedroom are targetable`);

    // Main door message: GameScene.checkNearbyDoor uses a 50px radius from the door centre.
    const mainDoor = houseLayout.doors.find((d) => d.id === 'main_door');
    if (mainDoor) {
      const cx = mainDoor.x + mainDoor.width / 2;
      const cy = mainDoor.y + mainDoor.height / 2;
      if (!this.anyReachableWithin(reachableCells, cx, cy, 50)) {
        errors.push('Main door message is unreachable (no reachable cell within 50px of the door centre)');
      } else {
        console.log('✓ Main door is within message range');
      }
    }

    return { success: errors.length === 0, errors };
  }
}

function checkBodyConstants(errors: string[]): void {
  if (PLAYER_BODY_RADIUS_FRAME * 2 + PLAYER_BODY_OFFSET_FRAME * 2 !== PLAYER_FRAME_SIZE) {
    errors.push(`Player body circle (r=${PLAYER_BODY_RADIUS_FRAME}, offset ${PLAYER_BODY_OFFSET_FRAME}) is not centred on the ${PLAYER_FRAME_SIZE}px frame`);
  }
  if (PLAYER_BODY_RADIUS !== PLAYER_BODY_RADIUS_FRAME * PLAYER_SPRITE_SCALE) {
    errors.push('PLAYER_BODY_RADIUS must equal frame radius x sprite scale');
  }
  // Player.ts must hand Arcade the shared FRAME-pixel radius (not a world-unit literal).
  const playerSrc = readFileSync(join(process.cwd(), 'src/objects/Player.ts'), 'utf-8');
  const calls = [...playerSrc.matchAll(/setCircle\(([^,)]+)/g)].map((m) => m[1].trim());
  if (!calls.includes('PLAYER_BODY_RADIUS_FRAME') || calls.some((c) => /^\d/.test(c))) {
    errors.push(`Player.ts setCircle() must use PLAYER_BODY_RADIUS_FRAME, found: ${calls.join(', ')}`);
  }
  // The player sprite is 32 world px wide; a body bigger than the sprite was QA bug N1.
  if (PLAYER_BODY_RADIUS * 2 > PLAYER_FRAME_SIZE * PLAYER_SPRITE_SCALE) {
    errors.push(`Player body (${PLAYER_BODY_RADIUS * 2}px) is bigger than the sprite`);
  }
}

/**
 * Every integer position the player body can reach from spawn (1px flood fill, touching allowed
 * like Arcade). The 4px grid above misses exact-fit slots (e.g. the 32px slot between study
 * drawer 3 and the closet), where a real player can stand.
 */
function fineReachable(doors: Door[]): Uint8Array {
  const W = houseLayout.width, H = houseLayout.height, r = PLAYER_RADIUS;
  const solids = [
    ...houseLayout.walls, ...doors, ...houseLayout.hidingSpots,
    ...houseLayout.furniture.filter((f) => f.blocking),
  ];
  const free = (x: number, y: number) => {
    for (const s of solids) {
      const dx = x - Math.max(s.x, Math.min(x, s.x + s.width));
      const dy = y - Math.max(s.y, Math.min(y, s.y + s.height));
      if (dx * dx + dy * dy < r * r) return false;
    }
    return true;
  };
  const seen = new Uint8Array(W * H);
  const queue = new Int32Array(W * H);
  let head = 0, tail = 0;
  seen[SPAWN_Y * W + SPAWN_X] = 1; queue[tail++] = SPAWN_Y * W + SPAWN_X;
  while (head < tail) {
    const i = queue[head++];
    const x = i % W, y = (i - x) / W;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (seen[j]) continue;
      seen[j] = 2; // visited (2 = blocked unless set to 1)
      if (free(nx, ny)) { seen[j] = 1; queue[tail++] = j; }
    }
  }
  return seen;
}

/**
 * For each spot, find a reachable floor position and a facing (8 directions) from which
 * selectTarget() (the exact function HidingSpotManager uses) picks it.
 */
function checkInteractable(doors: Door[], items: Interactable[], prefix: string): string[] {
  const all = buildInteractables(houseLayout.hidingSpots);
  const blockers = sightBlockers(houseLayout);
  const reach = fineReachable(doors);
  const W = houseLayout.width;
  const errs: string[] = [];
  for (const it of items) {
    const pad = it.rangeMode === 'center' ? it.range : it.range + Math.max(it.width, it.height);
    let won = false;
    for (let y = Math.max(0, Math.floor(it.y - pad)); !won && y <= it.y + it.height + pad && y < houseLayout.height; y++) {
      for (let x = Math.max(0, Math.floor(it.x - pad)); !won && x <= it.x + it.width + pad && x < W; x++) {
        if (reach[y * W + x] !== 1 || !isEligible(x, y, it, blockers)) continue;
        won = FACINGS_8.some((f) => selectTarget(x, y, f, all, blockers)?.id === it.id);
      }
    }
    if (!won) errs.push(`${prefix || 'Spot '}"${it.name}" (${it.id}) is never targeted from any reachable position`);
  }
  return errs;
}

/** With ?debug=unlock the bedroom door has no body: the bedroom and every spot must be targetable. */
function checkDebugUnlock(errors: string[]): void {
  console.log('\nChecking ?debug=unlock (bedroom door open)...');
  const doors = houseLayout.doors.filter((d) => d.id !== 'bedroom_door');
  const v = new PathfindingValidator(doors);
  const reachable = v.reachableFromSpawn();
  const bedroomCells = v.countRoomCells('bedroom', reachable);
  if (bedroomCells === 0) {
    errors.push('With the bedroom door unlocked, the bedroom is still unreachable');
  } else {
    console.log(`✓ Bedroom reachable when unlocked (${bedroomCells} cells)`);
  }
  const items = buildInteractables(houseLayout.hidingSpots);
  errors.push(...checkInteractable(doors, items, '(unlocked) '));
  if (!errors.some((e) => e.startsWith('(unlocked)'))) {
    console.log(`✓ All ${items.length} spots targetable when unlocked (${houseLayout.hidingSpots.length} units)`);
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
  checkBodyConstants(result.errors);
  checkDebugUnlock(result.errors);
  result.success = result.errors.length === 0;

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
