/**
 * Which hiding spot (or drawer / door / cushion of a multi-section unit) the player targets.
 * Pure (no Phaser) so the game and the node reachability test share exactly the same rules.
 */
import { HidingSpot, HouseLayout } from '../data/houseLayout';
import { DRAWER_UNITS } from '../data/drawerSlices';
import { wallBodyRects } from '../data/colliders';
import { sectionWorldRect } from '../data/spotArt';

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
  /** Front group (FRONT_GROUPS) for separate spots that share one front, else undefined. */
  group?: string;
}

/**
 * Separate layout spots that sit side by side along ONE front, so for targeting they act as
 * one multi-section unit under the front rule (QA R9-1): the spot in front of the player's
 * centre wins, with hysteresis, whatever the facing. Each spot keeps its own id, name, art and
 * open state. `side` is the face the player stands at (the drawers / doors open towards it);
 * other faces are left to the other rules (e.g. the study drawers' bottom faces the closet).
 */
export const FRONT_GROUPS: Record<string, { members: string[]; side: 'top' | 'bottom' | 'left' | 'right' }> = {
  // Three one-piece drawers stacked in the study table, opening to the right.
  study_drawers: { members: ['study_drawer_1', 'study_drawer_2', 'study_drawer_3'], side: 'right' },
  // The stove and the kitchen drawers beside it share the east-wall counter front (player to their west).
  stove_counter: { members: ['stove', 'stove_drawers'], side: 'left' },
  // The sofa's cushions and the ottoman below it: one row along x=490 (the 25 px gap between
  // them is narrower than the player, so nobody stands between them).
  sofa_row: { members: ['sofa', 'ottoman'], side: 'right' },
};
const GROUP_OF = new Map(Object.entries(FRONT_GROUPS).flatMap(([g, { members }]) => members.map((m) => [m, g] as const)));

/** Max distance (world px) from the player centre to a section rect. Player radius is 16. */
export const SECTION_RANGE = 44;
/**
 * Facing cone (cos of the half-angle, 30 deg): a spot whose centre lies within this cone of the
 * way the player faces wins over nearer ones outside it. That is what lets a player pick a
 * corner drawer (kitchen sink door 1) by pushing diagonally into the corner.
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

/** World rect of section `s` of a unit (art at 2x, honoring spot.rotation / spriteOffset). */
function sectionRect(spot: HidingSpot, s: { x: number; y: number; w: number; h: number }): Rect {
  return sectionWorldRect(spot, s);
}

export function buildInteractables(spots: HidingSpot[]): Interactable[] {
  const out: Interactable[] = [];
  for (const spot of spots) {
    const unit = DRAWER_UNITS[spot.id];
    if (!unit) {
      out.push({
        id: spot.id, unitId: spot.id, name: spot.name, drawer: 0, type: spot.type,
        x: spot.x, y: spot.y, width: spot.width, height: spot.height,
        rangeMode: 'center', range: spot.interactRange, unitRect: spot, group: GROUP_OF.get(spot.id),
      });
      continue;
    }
    for (const s of unit.sections) {
      out.push({
        id: `${spot.id}_d${s.drawer}`, unitId: spot.id, name: s.label, drawer: s.drawer, type: spot.type,
        ...sectionRect(spot, s), rangeMode: 'edge', range: SECTION_RANGE,
        unitRect: { x: spot.x, y: spot.y, width: spot.width, height: spot.height }, group: GROUP_OF.get(spot.id),
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
 * Corner sections no player can stand straight in front of (a wall or a neighbour fills the
 * corner beside them). They are the ONLY sections picked by facing (QA R8-1): while the
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
  // No current corner sections: the enlarged kitchen puts a plain empty counter
  // between the sink and the east-wall units, so sink door 1 is straight-on
  // reachable. The northmost kitchen drawer can be stood in front of (flush with
  // the north wall). The microwave sits mid-wall, so none of its doors are corners.
};

/** Key of the front-rule unit an interactable belongs to: its front group, its sectioned unit, or null. */
export function frontKey(it: Interactable | null | undefined): string | null {
  if (!it) return null;
  return it.group ?? (it.drawer > 0 ? it.unitId : null);
}

type FrontUnit = { box: Rect; sections: Interactable[]; side?: 'top' | 'bottom' | 'left' | 'right' };
const unitCache = new WeakMap<Interactable[], Map<string, FrontUnit>>();
/** Front-rule units: every sectioned unit, plus each FRONT_GROUPS group (box = union of its spots). */
function sectionedUnits(items: Interactable[]): Map<string, FrontUnit> {
  let m = unitCache.get(items);
  if (m) return m;
  const by = new Map<string, Interactable[]>();
  for (const it of items) {
    const k = frontKey(it);
    if (k) (by.get(k) ?? by.set(k, []).get(k)!).push(it);
  }
  m = new Map([...by].map(([k, secs]) => {
    const rects = [...new Set(secs.map((it) => it.unitRect))];
    const x0 = Math.min(...rects.map((r) => r.x)), y0 = Math.min(...rects.map((r) => r.y));
    const x1 = Math.max(...rects.map((r) => r.x + r.width)), y1 = Math.max(...rects.map((r) => r.y + r.height));
    return [k, { box: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, sections: secs, side: FRONT_GROUPS[k]?.side }];
  }));
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
  const curKey = frontKey(current);
  for (const [unitId, { box, sections, side }] of sectionedUnits(items)) {
    const d = distanceToRect(px, py, box);
    if (d > SECTION_RANGE) continue;
    const tol = curKey === unitId ? HYSTERESIS : 0;
    const inX = px >= box.x - tol && px <= box.x + box.width + tol;
    const inY = py >= box.y - tol && py <= box.y + box.height + tol;
    if (inX === inY) continue; // off a corner (or inside): not in front
    if (side && side !== (inX ? (py < box.y ? 'top' : 'bottom') : (px < box.x ? 'left' : 'right'))) continue;
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
    if (pick && current && curKey === unitId && pick !== current) {
      const mid = (it: Interactable) => { const [a, b] = span(it); return (a + b) / 2; };
      const out = (it: Interactable) => { const [a, b] = span(it); return c < a ? a - c : c > b ? c - b : 0; };
      // ...or (unequal spans or gaps, e.g. the long stove beside a kitchen drawer, the sofa and
      // the ottoman: R9-1) once the centre is HYSTERESIS/2 px nearer the new span than the current.
      const byCentre = Math.abs(c - mid(current)) - Math.abs(c - mid(pick)) >= HYSTERESIS;
      const byEdge = out(current) - out(pick) >= HYSTERESIS / 2;
      if (!byCentre && !byEdge) pick = current;
    }
    if (!pick || !isEligible(px, py, pick, blockers)) continue;
    out.push(pick);
    const key = (d <= FRONT_TOUCH ? 0 : 100) - fd * 10 + d / 100;
    if (key < bestKey) { best = pick; bestKey = key; }
  }
  if (!best) return best;
  // A one-piece spot outside the front rule (the fridge beside the sink) that the player touches
  // from straight in front and doesn't face away from competes on the same key; if it ranks
  // better, the front rule steps aside and the facing cone decides (R9-1 audit: facing the
  // fridge in the fridge / sink corner must not pick the sink).
  for (const it of items) {
    if (frontKey(it) || it.drawer > 0) continue;
    const r = it.unitRect;
    const d = distanceToRect(px, py, r);
    if (d > FRONT_TOUCH) continue;
    const inX = px >= r.x && px <= r.x + r.width, inY = py >= r.y && py <= r.y + r.height;
    if (inX === inY) continue;
    const n = inX ? { x: 0, y: py < r.y ? 1 : -1 } : { x: px < r.x ? 1 : -1, y: 0 };
    const fd = facing.x * n.x + facing.y * n.y;
    if (fd < 0 || !isEligible(px, py, it, blockers)) continue;
    if (-fd * 10 + d / 100 < bestKey) return undefined;
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
 * 1. Front rule (frontSection): touching / facing a multi-section unit (or a FRONT_GROUPS row of
 *    separate spots) from straight in front,
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
