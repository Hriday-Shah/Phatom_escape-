/**
 * The static collision rectangles the game builds from houseLayout, in one pure module so
 * GameScene and the node-side containment test use exactly the same geometry.
 */
import { houseLayout, Wall } from './houseLayout';
import { EXTERIOR_WALL_BODY_EXTRA } from '../config/physicsConfig';

export interface Rect { x: number; y: number; width: number; height: number }

const insideAnyRoom = (px: number, py: number) =>
  houseLayout.rooms.some((r) => px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height);

/** Is the 1px strip just outside this side of the wall entirely outside every room? */
function sideIsExterior(w: Wall, side: 'top' | 'bottom' | 'left' | 'right'): boolean {
  const samples: [number, number][] = [];
  if (side === 'top' || side === 'bottom') {
    const y = side === 'top' ? w.y - 0.5 : w.y + w.height + 0.5;
    for (let x = w.x + 0.5; x < w.x + w.width; x += 2) samples.push([x, y]);
  } else {
    const x = side === 'left' ? w.x - 0.5 : w.x + w.width + 0.5;
    for (let y = w.y + 0.5; y < w.y + w.height; y += 2) samples.push([x, y]);
  }
  return samples.every(([x, y]) => !insideAnyRoom(x, y));
}

/**
 * Physics body rect for a wall: the layout rect, grown outward on every side that faces
 * outside the house (invisible bodies only; wall art uses the layout rects).
 */
export function wallBodyRect(w: Wall, extra = EXTERIOR_WALL_BODY_EXTRA): Rect {
  let { x, y, width, height } = w;
  if (sideIsExterior(w, 'top')) { y -= extra; height += extra; }
  if (sideIsExterior(w, 'bottom')) { height += extra; }
  if (sideIsExterior(w, 'left')) { x -= extra; width += extra; }
  if (sideIsExterior(w, 'right')) { width += extra; }
  return { x, y, width, height };
}

export interface StaticColliders {
  walls: Rect[];
  furniture: Rect[];
  spots: Rect[];
  /** Locked doors only (unlocked doors have no body). */
  doors: Rect[];
}

export function isDoorLocked(doorId: string, locked: boolean, debugUnlock: boolean): boolean {
  return locked && !(debugUnlock && doorId === 'bedroom_door');
}

export function getStaticColliders(debugUnlock = false, exteriorExtra = EXTERIOR_WALL_BODY_EXTRA): StaticColliders {
  return {
    walls: houseLayout.walls.map((w) => wallBodyRect(w, exteriorExtra)),
    furniture: houseLayout.furniture.filter((f) => f.blocking).map(({ x, y, width, height }) => ({ x, y, width, height })),
    spots: houseLayout.hidingSpots.map(({ x, y, width, height }) => ({ x, y, width, height })),
    doors: houseLayout.doors
      .filter((d) => isDoorLocked(d.id, d.locked, debugUnlock))
      .map(({ x, y, width, height }) => ({ x, y, width, height })),
  };
}
