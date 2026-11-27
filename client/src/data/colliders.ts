/**
 * The static collision rectangles the game builds from houseLayout, in one pure module so
 * GameScene and the node-side containment test use exactly the same geometry.
 */
import { houseLayout, HouseLayout } from './houseLayout';
import { EXTERIOR_WALL_BODY_EXTRA } from '../config/physicsConfig';

export interface Rect { x: number; y: number; width: number; height: number }

const insideAnyRoom = (px: number, py: number, layout: HouseLayout) =>
  layout.rooms.some((r) => px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height);

type Side = 'top' | 'bottom' | 'left' | 'right';

/**
 * Runs of a rect's side whose 1px strip just outside is outside every room, as [from, to)
 * spans along the side (x for top/bottom, y for left/right), sampled every 1px.
 */
function exteriorRuns(w: Rect, side: Side, layout: HouseLayout): [number, number][] {
  const horizontal = side === 'top' || side === 'bottom';
  const from = horizontal ? w.x : w.y;
  const to = horizontal ? w.x + w.width : w.y + w.height;
  const fixed = side === 'top' ? w.y - 0.5 : side === 'bottom' ? w.y + w.height + 0.5
    : side === 'left' ? w.x - 0.5 : w.x + w.width + 0.5;
  const runs: [number, number][] = [];
  let start: number | null = null;
  for (let a = from; a < to; a++) {
    const c = a + 0.5;
    const out = horizontal ? !insideAnyRoom(c, fixed, layout) : !insideAnyRoom(fixed, c, layout);
    if (out && start === null) start = a;
    if (!out && start !== null) { runs.push([start, a]); start = null; }
  }
  if (start !== null) runs.push([start, to]);
  return runs;
}

/**
 * Physics body rects for a wall (or a locked door): the layout rect grown outward by
 * `extra` on every side that faces outside the house, plus, for sides that face outside
 * only partly (QA R4-2: kitchen left wall at y490-560, bedroom bottom at x70-150), one
 * extra rect per outside-facing run, covering the wall and reaching `extra` outward.
 * Invisible bodies only: wall/door art uses the layout rects. Nothing grows into a room.
 * The first rect is always the (possibly grown) main body.
 */
export function wallBodyRects(w: Rect, extra = EXTERIOR_WALL_BODY_EXTRA, layout: HouseLayout = houseLayout): Rect[] {
  if (extra <= 0) return [{ x: w.x, y: w.y, width: w.width, height: w.height }];
  const sides: Side[] = ['top', 'bottom', 'left', 'right'];
  const runs = Object.fromEntries(sides.map((s) => [s, exteriorRuns(w, s, layout)])) as Record<Side, [number, number][]>;
  const full = (s: Side) => {
    const r = runs[s];
    const len = s === 'top' || s === 'bottom' ? w.width : w.height;
    return r.length === 1 && r[0][1] - r[0][0] === len;
  };
  const main = { x: w.x, y: w.y, width: w.width, height: w.height };
  if (full('top')) { main.y -= extra; main.height += extra; }
  if (full('bottom')) { main.height += extra; }
  if (full('left')) { main.x -= extra; main.width += extra; }
  if (full('right')) { main.width += extra; }
  const out: Rect[] = [main];
  for (const s of sides) {
    if (full(s)) continue;
    for (const [a, b] of runs[s]) {
      if (s === 'top') out.push({ x: a, y: w.y - extra, width: b - a, height: w.height + extra });
      if (s === 'bottom') out.push({ x: a, y: w.y, width: b - a, height: w.height + extra });
      if (s === 'left') out.push({ x: w.x - extra, y: a, width: w.width + extra, height: b - a });
      if (s === 'right') out.push({ x: w.x, y: a, width: w.width + extra, height: b - a });
    }
  }
  return out;
}

export interface StaticColliders {
  walls: Rect[];
  furniture: Rect[];
  spots: Rect[];
  /** Locked doors only (unlocked doors have no body). */
  doors: Rect[];
}

export function isDoorLocked(
  doorId: string, locked: boolean, debugUnlock: boolean, passBedroom = false,
): boolean {
  if (!locked) return false;
  if (doorId === 'bedroom_door' && (debugUnlock || passBedroom)) return false;
  return true;
}

export function getStaticColliders(
  debugUnlock = false, exteriorExtra = EXTERIOR_WALL_BODY_EXTRA, layout: HouseLayout = houseLayout,
  passBedroom = false,
): StaticColliders {
  return {
    walls: layout.walls.flatMap((w) => wallBodyRects(w, exteriorExtra, layout)),
    furniture: layout.furniture.filter((f) => f.blocking).map(({ x, y, width, height }) => ({ x, y, width, height })),
    spots: layout.hidingSpots.map(({ x, y, width, height }) => ({ x, y, width, height })),
    doors: layout.doors
      .filter((d) => isDoorLocked(d.id, d.locked, debugUnlock, passBedroom))
      .flatMap((d) => wallBodyRects(d, exteriorExtra, layout)),
  };
}
