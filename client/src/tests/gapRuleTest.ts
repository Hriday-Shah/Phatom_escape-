/**
 * Furniture-to-wall gap rule (QA R3-1).
 *
 * A gap between a solid piece (hiding spot or blocking furniture) and a wall or locked door
 * that is narrower than the player's body lets Arcade's circle-vs-rect separation wedge the
 * body diagonally into the wall (that is how the sofa corner leaked the player outside).
 * So every piece must be FLUSH with a wall (touching, distance 0, no overlap) or leave at
 * least MIN_GAP of open floor. Gaps that are entirely wall (a piece flush to one wall, with
 * another wall behind it) or entirely outside the rooms don't count.
 */
import { houseLayout } from '../data/houseLayout';
import { PLAYER_BODY_RADIUS } from '../config/playerConfig';

interface R { x: number; y: number; width: number; height: number; id?: string }

/** Smallest open gap allowed: the player's diameter plus a 2px margin. */
export const MIN_GAP = PLAYER_BODY_RADIUS * 2 + 2; // 34

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

/** Does the box between a and b contain any open floor (inside a room, not inside a wall)? */
function gapHasOpenFloor(a: R, b: R, walls: R[]): boolean {
  const xs = [Math.min(a.x + a.width, b.x + b.width), Math.max(a.x, b.x)].sort((p, q) => p - q);
  const ys = [Math.min(a.y + a.height, b.y + b.height), Math.max(a.y, b.y)].sort((p, q) => p - q);
  // For a straight gap one axis is the shared span (xs/ys from the overlap); include it fully.
  for (let x = xs[0] + 0.5; x < xs[1]; x += 1) {
    for (let y = ys[0] + 0.5; y < ys[1]; y += 1) {
      if (!houseLayout.rooms.some((r) => inside(x, y, r))) continue;
      if (!walls.some((w) => inside(x, y, w))) return true;
    }
  }
  return false;
}

export function findGapViolations(): string[] {
  const pieces: R[] = [
    ...houseLayout.hidingSpots,
    ...houseLayout.furniture.filter((f) => f.blocking),
  ];
  const walls: R[] = [
    ...houseLayout.walls.map((w, i) => ({ ...w, id: `wall#${i}` })),
    ...houseLayout.doors,
  ];
  const out: string[] = [];
  for (const p of pieces) {
    for (const w of walls) {
      const tag = `${p.id} vs ${w.id} {${w.x},${w.y},${w.width},${w.height}}`;
      if (overlaps(p, w)) {
        out.push(`${tag}: overlaps the wall`);
        continue;
      }
      const d = rectDistance(p, w);
      if (d > 0 && d < MIN_GAP && gapHasOpenFloor(p, w, walls)) {
        out.push(`${tag}: ${d.toFixed(1)}px gap (must be 0 or >= ${MIN_GAP})`);
      }
    }
  }
  return out;
}

export function runGapRuleTest(): void {
  console.log('=== FURNITURE GAP RULE TEST ===');
  const v = findGapViolations();
  if (v.length) {
    v.forEach((m) => console.error(`  - ${m}`));
    throw new Error(`${v.length} furniture-to-wall gap violation(s)`);
  }
  console.log(`✓ Every piece is flush with or >= ${MIN_GAP}px from every wall/door`);
  console.log('✅ GAP RULE TEST PASSED\n');
}
