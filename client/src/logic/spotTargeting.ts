/**
 * Which hiding spot (or drawer / door / cushion of a multi-section unit) the player targets.
 * Pure (no Phaser) so the game and the node reachability test share exactly the same rules.
 */
import { HidingSpot, HouseLayout } from '../data/houseLayout';
import { DRAWER_UNITS } from '../data/drawerSlices';
import { wallBodyRects } from '../data/colliders';

export interface Rect { x: number; y: number; width: number; height: number; }

export interface Interactable extends Rect {
  /** Unique id: the layout id for one-piece spots, `{unitId}_d{N}` for sections. */
  id: string;
  /** houseLayout hiding-spot id this belongs to (== id for one-piece spots). */
  unitId: string;
  /** Prompt text. */
  name: string;
  /** Section number (1-based), or 0 for a one-piece spot. */
  drawer: number;
  type: HidingSpot['type'];
  /**
   * One-piece spots keep their QA-verified rule: unit centre within `interactRange`.
   * Sections: the nearest point of the section rect within SECTION_RANGE (the drawers sit on
   * the front edge of thin units, so a centre rule would let the far drawers win).
   */
  rangeMode: 'center' | 'edge';
  range: number;
  /** The whole unit's layout rect (sections sit inside it); its front is what the player touches. */
  unitRect: Rect;
}

/** Max distance (world px) from the player centre to a section rect. Player radius is 16. */
export const SECTION_RANGE = 44;
/**
 * Facing cone (cos of the half-angle, 30 deg): a spot whose centre lies within this cone of the
 * way the player faces wins over nearer ones outside it. That is what lets a player pick a
 * corner drawer (microwave door 4, kitchen drawer 3) by pushing diagonally into the corner.
 */
export const FACING_CONE_COS = Math.cos(Math.PI / 6);
/** Tie-break inside a group, in world px of distance (a spot straight ahead beats one 10px nearer behind). */
export const FACING_WEIGHT = 10;

export type Facing = 'up' | 'down' | 'left' | 'right';
export const FACING_VECTORS: Record<Facing, { x: number; y: number }> = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
};
const D = Math.SQRT1_2;
/** The 8 keyboard facings (joystick facings are any unit vector). */
export const FACINGS_8: { x: number; y: number }[] = [
  ...Object.values(FACING_VECTORS),
  { x: D, y: -D }, { x: D, y: D }, { x: -D, y: D }, { x: -D, y: -D },
];

/** World rect of section `s` of a unit placed at (spot.x, spot.y) with its art at 2x. */
function sectionRect(spot: HidingSpot, s: { x: number; y: number; w: number; h: number }): Rect {
  return { x: spot.x + s.x * 2, y: spot.y + s.y * 2, width: s.w * 2, height: s.h * 2 };
}

export function buildInteractables(spots: HidingSpot[]): Interactable[] {
  const out: Interactable[] = [];
  for (const spot of spots) {
    const unit = DRAWER_UNITS[spot.id];
    if (!unit) {
      out.push({
        id: spot.id, unitId: spot.id, name: spot.name, drawer: 0, type: spot.type,
        x: spot.x, y: spot.y, width: spot.width, height: spot.height,
        rangeMode: 'center', range: spot.interactRange, unitRect: spot,
      });
      continue;
    }
    for (const s of unit.sections) {
      out.push({
        id: `${spot.id}_d${s.drawer}`, unitId: spot.id, name: s.label, drawer: s.drawer, type: spot.type,
        ...sectionRect(spot, s), rangeMode: 'edge', range: SECTION_RANGE,
        unitRect: { x: spot.x, y: spot.y, width: spot.width, height: spot.height },
      });
    }
  }
  return out;
}

/** Rects that block line of sight: the real wall bodies (furniture never blocks sight). */
export function sightBlockers(layout: HouseLayout): Rect[] {
  return layout.walls.flatMap((w) => wallBodyRects(w, undefined, layout));
}

export function distanceToRect(px: number, py: number, r: Rect): number {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.width));
  const dy = Math.max(r.y - py, 0, py - (r.y + r.height));
  return Math.hypot(dx, dy);
}

/** Segment vs axis-aligned rect (Liang-Barsky); touching counts as a hit. */
export function segmentHitsRect(x0: number, y0: number, x1: number, y1: number, r: Rect): boolean {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - r.x, r.x + r.width - x0, y0 - r.y, r.y + r.height - y0];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}

export function hasLineOfSight(x0: number, y0: number, x1: number, y1: number, blockers: Rect[]): boolean {
  for (const b of blockers) if (segmentHitsRect(x0, y0, x1, y1, b)) return false;
  return true;
}

export function centerOf(r: Rect): { x: number; y: number } {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

/** In range of `it` and with a clear line of sight to its centre? */
export function isEligible(px: number, py: number, it: Interactable, blockers: Rect[]): boolean {
  const c = centerOf(it);
  const d = it.rangeMode === 'center' ? Math.hypot(px - c.x, py - c.y) : distanceToRect(px, py, it);
  if (it.rangeMode === 'center' ? d >= it.range : d > it.range) return false;
  return hasLineOfSight(px, py, c.x, c.y, blockers);
}

export function facingDot(px: number, py: number, facing: { x: number; y: number }, it: Interactable): number {
  const c = centerOf(it);
  const len = Math.hypot(c.x - px, c.y - py) || 1;
  return ((c.x - px) * facing.x + (c.y - py) * facing.y) / len;
}

/** Lower is better: distance to the rect, plus up to 2*FACING_WEIGHT when it is behind the player. */
export function targetScore(px: number, py: number, facing: { x: number; y: number }, it: Interactable): number {
  return distanceToRect(px, py, it) + FACING_WEIGHT * (1 - facingDot(px, py, facing, it));
}

/** Player within this many px of a unit's front counts as touching it (player radius 16). */
export const FRONT_TOUCH = 22;
/**
 * Hysteresis (world px): the current section is kept until another section's centre is this
 * much closer to the player's centre (front rule), or another spot scores this much better
 * (cone rule).
 */
export const HYSTERESIS = 6;
/**
 * Corner sections no player can stand straight in front of (the kitchen sink cabinet fills the
 * corner below / above them). They are the ONLY sections picked by facing (QA R8-1): while the
 * section in front is the corner's neighbour and the facing is within CORNER_WINDOW_DEG of the
 * corner's diagonal (its whole 45-degree keyboard / joystick octant), the corner section wins.
 * The game shows a faint hint outline on them while the player targets the neighbour.
 */
export const CORNER_WINDOW_DEG = 22.5;
/** Once picked, a corner section is kept until the facing leaves this wider window (hysteresis). */
export const CORNER_KEEP_DEG = 30;
const CORNER_WINDOW_COS = Math.cos((CORNER_WINDOW_DEG * Math.PI) / 180);
const CORNER_KEEP_COS = Math.cos((CORNER_KEEP_DEG * Math.PI) / 180);
export const CORNER_SECTIONS: Record<string, { x: number; y: number; neighbour: string }> = {
  microwave_unit_d4: { x: D, y: -D, neighbour: 'microwave_unit_d3' },
  stove_drawers_d3: { x: D, y: D, neighbour: 'stove_drawers_d2' },
};

const unitCache = new WeakMap<Interactable[], Map<string, { box: Rect; sections: Interactable[] }>>();
function sectionedUnits(items: Interactable[]): Map<string, { box: Rect; sections: Interactable[] }> {
  let m = unitCache.get(items);
  if (m) return m;
  const by = new Map<string, Interactable[]>();
  for (const it of items) if (it.drawer > 0) (by.get(it.unitId) ?? by.set(it.unitId, []).get(it.unitId)!).push(it);
  m = new Map([...by].map(([id, secs]) => [id, { box: secs[0].unitRect, sections: secs }]));
  unitCache.set(items, m);
  return m;
}

/**
 * Front rule: when the player touches or faces a multi-section unit from straight in front of
 * it (its centre projects onto the unit's front), the section the centre projects onto wins,
 * with HYSTERESIS px of stickiness at section edges, whatever the facing (straight, sideways or
 * diagonal; QA R8-1). Returns undefined when the player isn't in front of any unit.
 */
function frontSection(
  px: number, py: number, facing: { x: number; y: number }, items: Interactable[], blockers: Rect[],
  current: Interactable | null,
  out: Interactable[] = [],
): Interactable | undefined {
  // Rank: touching before merely facing, then most squarely faced, then nearest.
  // `out` receives every unit's front pick (the corner rule looks at all of them).
  let best: Interactable | undefined;
  let bestKey = Infinity;
  for (const [unitId, { box, sections }] of sectionedUnits(items)) {
    const d = distanceToRect(px, py, box);
    if (d > SECTION_RANGE) continue;
    const tol = current?.unitId === unitId ? HYSTERESIS : 0;
    const inX = px >= box.x - tol && px <= box.x + box.width + tol;
    const inY = py >= box.y - tol && py <= box.y + box.height + tol;
    if (inX === inY) continue; // off a corner (or inside): not in front
    const n = inX ? { x: 0, y: py < box.y ? 1 : -1 } : { x: px < box.x ? 1 : -1, y: 0 };
    const fd = facing.x * n.x + facing.y * n.y;
    if (d > FRONT_TOUCH && fd < 0.5) continue; // neither touching nor facing it
    const c = inX ? px : py;
    const span = (it: Interactable) => (inX ? [it.x, it.x + it.width] : [it.y, it.y + it.height]);
    // The section in front: its span contains c (else the nearest span).
    let pick: Interactable | undefined;
    let bd = Infinity;
    for (const it of sections) {
      const [a, b] = span(it);
      const dd = c < a ? a - c : c > b ? c - b : 0;
      if (dd < bd) { bd = dd; pick = it; }
    }
    // Hysteresis: keep the current section until the new one's centre is HYSTERESIS px closer
    // to the player's centre than the current one's (switches HYSTERESIS/2 px past the edge,
    // so a section whose span ends at a wall-limited reach is still reachable).
    if (pick && current?.unitId === unitId && pick !== current) {
      const mid = (it: Interactable) => { const [a, b] = span(it); return (a + b) / 2; };
      if (Math.abs(c - mid(current)) - Math.abs(c - mid(pick)) < HYSTERESIS) pick = current;
    }
    if (!pick || !isEligible(px, py, pick, blockers)) continue;
    out.push(pick);
    const key = (d <= FRONT_TOUCH ? 0 : 100) - fd * 10 + d / 100;
    if (key < bestKey) { best = pick; bestKey = key; }
  }
  return best;
}

/** Corner rule (see CORNER_SECTIONS): the corner section instead of its neighbour in front. */
function cornerOverride(
  px: number, py: number, facing: { x: number; y: number }, items: Interactable[], blockers: Rect[],
  current: Interactable | null, fronts: Interactable[],
): Interactable | null {
  for (const [id, c] of Object.entries(CORNER_SECTIONS)) {
    // The player stands in front of the corner's neighbour (in a corner the player can touch
    // two units; the neighbour need not be the top-ranked one).
    if (!fronts.some((f) => f.id === c.neighbour)) continue;
    const cos = current?.id === id ? CORNER_KEEP_COS : CORNER_WINDOW_COS;
    if (facing.x * c.x + facing.y * c.y < cos - 1e-9) continue;
    const corner = items.find((it) => it.id === id);
    if (corner && isEligible(px, py, corner, blockers)) return corner;
  }
  return null;
}

/**
 * The one spot the player targets.
 * 1. Front rule (frontSection): touching / facing a multi-section unit from straight in front,
 *    the section in front of the player's centre wins, whatever the facing (nudges and diagonal
 *    input never jump ahead). Only the two corner sections are picked by facing (cornerOverride).
 * 2. Otherwise, among eligible spots (in range, line of sight), those in the facing cone first;
 *    within the chosen group the lowest targetScore (nearest, facing breaks near-ties).
 * `currentId` (the target last frame) adds hysteresis: it is kept until another spot is
 * clearly better (HYSTERESIS px). Same function in the game (HidingSpotManager) and the
 * reachability test.
 */
export function selectTarget(
  px: number, py: number, facing: { x: number; y: number }, items: Interactable[], blockers: Rect[],
  currentId: string | null = null,
): Interactable | null {
  const current = currentId ? items.find((it) => it.id === currentId) ?? null : null;
  const fronts: Interactable[] = [];
  const front = frontSection(px, py, facing, items, blockers, current, fronts);
  if (front) return cornerOverride(px, py, facing, items, blockers, current, fronts) ?? front;
  let best: Interactable | null = null;
  let bestKey = Infinity, curKey = Infinity;
  for (const it of items) {
    if (!isEligible(px, py, it, blockers)) continue;
    const inCone = facingDot(px, py, facing, it) >= FACING_CONE_COS;
    const key = targetScore(px, py, facing, it) + (inCone ? 0 : 1e6);
    if (it === current) curKey = key;
    if (key < bestKey) { best = it; bestKey = key; }
  }
  if (current && best !== current && curKey < Infinity && (curKey >= 1e6) === (bestKey >= 1e6)
    && curKey - bestKey < HYSTERESIS) return current;
  return best;
}
