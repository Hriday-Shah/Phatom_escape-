/**
 * Furniture gap rule (QA R3-1, extended in R4-1).
 *
 * 1. Piece to wall: a gap between a solid piece (hiding spot or blocking furniture) and a
 *    wall or locked door that is narrower than the player's body lets Arcade's circle-vs-rect
 *    separation wedge the body diagonally into the wall (that is how the sofa corner leaked
 *    the player outside). So every piece must be FLUSH with a wall (touching, no overlap) or
 *    leave at least MIN_GAP of open floor. Gaps that are entirely wall (a piece flush to one
 *    wall, with another wall behind it) or entirely outside the rooms don't count.
 *
 * 2. Piece to piece next to a wall: two pieces less than MIN_GAP apart form a notch or slot.
 *    Pieces never move the player outside on their own, but if the squeezed body can reach the
 *    WALL at the end of the notch it is pressed against three solids at once, the same wedge
 *    as R3-1. A notch with a wall at one end is allowed only when:
 *      - the body fits (gap >= body diameter) and the slot ends flush at the wall, or
 *      - the gap is narrower than the body and the body's leading edge, squeezed into the
 *        mouth as far as the two corners allow, stays at least NOTCH_SAFETY short of the wall.
 *    Diagonal (corner-to-corner) gaps under MIN_GAP within MIN_GAP of a wall are not allowed.
 */
import { houseLayout, HouseLayout } from '../data/houseLayout';
import { PLAYER_BODY_RADIUS } from '../config/playerConfig';

interface R { x: number; y: number; width: number; height: number; id?: string }

/** Smallest open gap allowed: the player's diameter plus a 2px margin. */
export const MIN_GAP = PLAYER_BODY_RADIUS * 2 + 2; // 34
/** How far short of the wall a squeezed body's leading edge must stay in a notch. */
export const NOTCH_SAFETY = 8;

const inside = (px: number, py: number, r: R) => px > r.x && px < r.x + r.width && py > r.y && py < r.y + r.height;

function rectDistance(a: R, b: R): number {
  const dx = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), 0);
  const dy = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height), 0);
  return Math.hypot(dx, dy);
}

function overlaps(a: R, b: R): boolean {
  return Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) &&
    Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y);
}

/** The box between two non-overlapping rects (for a straight gap, the shared span x the gap). */
function gapBox(a: R, b: R): R {
  const xs = [Math.min(a.x + a.width, b.x + b.width), Math.max(a.x, b.x)].sort((p, q) => p - q);
  const ys = [Math.min(a.y + a.height, b.y + b.height), Math.max(a.y, b.y)].sort((p, q) => p - q);
  return { x: xs[0], y: ys[0], width: xs[1] - xs[0], height: ys[1] - ys[0] };
}

function geometry(layout: HouseLayout) {
  const walls: R[] = [
    ...layout.walls.map((w, i) => ({ ...w, id: `wall#${i}` })),
    ...layout.doors,
  ];
  const inRoom = (x: number, y: number) => layout.rooms.some((r) => inside(x, y, r));
  /** Wall, locked door or outside the house. */
  const solid = (x: number, y: number) => !inRoom(x, y) || walls.some((w) => inside(x, y, w));
  /** Does the box between a and b contain any open floor (inside a room, not inside a wall)? */
  const hasOpenFloor = (a: R, b: R) => {
    const g = gapBox(a, b);
    for (let x = g.x + 0.5; x < g.x + g.width; x += 1) {
      for (let y = g.y + 0.5; y < g.y + g.height; y += 1) {
        if (inRoom(x, y) && !walls.some((w) => inside(x, y, w))) return true;
      }
    }
    return false;
  };
  return { walls, solid, hasOpenFloor };
}

/** Distance from a notch end to the first wall straight ahead (probed on the notch midline), or null if none within MIN_GAP. */
function wallAhead(solid: (x: number, y: number) => boolean, along: 'x' | 'y', end: number, dir: 1 | -1, mid: number): number | null {
  for (let t = 0; t < MIN_GAP; t++) {
    const a = end + dir * (t + 0.5);
    if (along === 'x' ? solid(a, mid) : solid(mid, a)) return t;
  }
  return null;
}

function pairViolation(p: R, q: R, g: ReturnType<typeof geometry>): string | null {
  if (overlaps(p, q)) return 'pieces overlap';
  const d = rectDistance(p, q);
  if (d === 0 || d >= MIN_GAP || !g.hasOpenFloor(p, q)) return null;
  const box = gapBox(p, q);
  const xShared = Math.min(p.x + p.width, q.x + q.width) - Math.max(p.x, q.x);
  const yShared = Math.min(p.y + p.height, q.y + q.height) - Math.max(p.y, q.y);
  if (xShared <= 0 && yShared <= 0) {
    // Corner-to-corner gap: not allowed within MIN_GAP of a wall.
    const near = g.walls.find((w) => rectDistance(box, w) < MIN_GAP);
    return near ? `${d.toFixed(1)}px diagonal gap within ${MIN_GAP}px of ${near.id}` : null;
  }
  // Straight gap of width d running along `along`, from `from` to `to`.
  const along: 'x' | 'y' = xShared > 0 ? 'x' : 'y';
  const from = along === 'x' ? box.x : box.y;
  const to = along === 'x' ? box.x + box.width : box.y + box.height;
  const mid = along === 'x' ? box.y + box.height / 2 : box.x + box.width / 2;
  const tFrom = wallAhead(g.solid, along, from, -1, mid);
  const tTo = wallAhead(g.solid, along, to, 1, mid);
  if (tFrom === null && tTo === null) return null; // not next to a wall
  if (tFrom !== null && tTo !== null) return null; // closed pocket: no mouth to enter from
  const t = (tFrom ?? tTo)!;
  const length = to - from;
  const r = PLAYER_BODY_RADIUS;
  if (d >= 2 * r) {
    return t === 0 ? null : `${d.toFixed(1)}px slot ends ${t}px short of a wall (must end flush)`;
  }
  const reach = r - Math.sqrt(r * r - (d / 2) * (d / 2)); // leading edge past the mouth when squeezed
  const room = length + t; // open floor from the mouth to the wall
  if (reach + NOTCH_SAFETY > room) {
    return `${d.toFixed(1)}px notch: body reaches ${reach.toFixed(1)}px in, wall is ${room.toFixed(1)}px in (needs ${NOTCH_SAFETY}px spare)`;
  }
  return null;
}

export function findGapViolations(layout: HouseLayout = houseLayout): string[] {
  const pieces: R[] = [
    ...layout.hidingSpots,
    ...layout.furniture.filter((f) => f.blocking),
  ];
  const g = geometry(layout);
  const out: string[] = [];
  for (const p of pieces) {
    for (const w of g.walls) {
      const tag = `${p.id} vs ${w.id} {${w.x},${w.y},${w.width},${w.height}}`;
      if (overlaps(p, w)) {
        out.push(`${tag}: overlaps the wall`);
        continue;
      }
      const d = rectDistance(p, w);
      if (d > 0 && d < MIN_GAP && g.hasOpenFloor(p, w)) {
        out.push(`${tag}: ${d.toFixed(1)}px gap (must be 0 or >= ${MIN_GAP})`);
      }
    }
  }
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const v = pairViolation(pieces[i], pieces[j], g);
      if (v) out.push(`${pieces[i].id} vs ${pieces[j].id}: ${v}`);
    }
  }
  return out;
}

/** Deliberately bad layouts the rule must reject (keeps the rule itself honest). */
export function badLayouts(): { name: string; expect: string; layout: HouseLayout }[] {
  const withSpot = (id: string, patch: Partial<R>): HouseLayout => ({
    ...houseLayout,
    hidingSpots: houseLayout.hidingSpots.map((s) => (s.id === id ? { ...s, ...patch } : s)),
  });
  return [
    { name: 'R3-1: sofa 20px below the living top wall', expect: 'sofa vs wall', layout: withSpot('sofa', { y: 130 }) },
    { name: 'shallow notch: ottoman 12px deep, 25px from the sofa, at the living left wall', expect: 'sofa vs ottoman: 25.0px notch', layout: withSpot('ottoman', { width: 12 }) },
    { name: 'shallow notch: ottoman 16px deep, 30px from the sofa', expect: 'sofa vs ottoman: 30.0px notch', layout: withSpot('ottoman', { y: 300, width: 16 }) },
    { name: 'slot not flush: study drawer 3 moved 6px off the left wall, 32px from the closet', expect: 'study_drawer_3 vs closet_drawers: 32.0px slot', layout: withSpot('study_drawer_3', { x: 86 }) },
    { name: 'diagonal gap at a wall: bathroom sink cabinet raised next to the wall shelf', expect: 'sink_cabinet vs wall_shelf: 13.5px diagonal', layout: withSpot('sink_cabinet', { y: 135 }) },
  ];
}

export function runGapRuleTest(): void {
  console.log('=== FURNITURE GAP RULE TEST ===');
  const v = findGapViolations();
  if (v.length) {
    v.forEach((m) => console.error(`  - ${m}`));
    throw new Error(`${v.length} furniture gap violation(s)`);
  }
  console.log(`✓ Every piece is flush with or >= ${MIN_GAP}px from every wall/door`);
  console.log(`✓ Every piece-to-piece gap under ${MIN_GAP}px next to a wall is a safe notch or flush slot`);
  for (const bad of badLayouts()) {
    const bv = findGapViolations(bad.layout);
    const hit = bv.find((m) => m.includes(bad.expect));
    if (!hit) throw new Error(`gap rule missed bad layout "${bad.name}" (expected "${bad.expect}", got ${JSON.stringify(bv)})`);
    console.log(`✓ rejects bad layout (${bad.name}): ${hit}`);
  }
  console.log('✅ GAP RULE TEST PASSED\n');
}
