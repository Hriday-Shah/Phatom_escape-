/**
 * R7-1: targeting along a multi-section unit. Walking (or nudging) sideways along a unit's
 * front, with the facing turned sideways as the game does, the highlight must follow the
 * section in front of the player's centre: never jump ahead, never reverse, and only change
 * once the centre is HYSTERESIS px past the current section's edge. Also: corner sections are
 * still picked diagonally, and straight on the section in front always wins.
 */
import { houseLayout } from '../data/houseLayout';
import {
  CORNER_SECTIONS, FACING_VECTORS, HYSTERESIS, Interactable, buildInteractables, selectTarget, sightBlockers,
} from '../logic/spotTargeting';

/** Walk lines just in front of each multi-section unit (player centre touching the front). */
// `handover`: past this coordinate the player also touches the kitchen sink cabinet; facing
// it (walking right into the corner) targets the cabinet, which is the unit faced and touched.
const LINES: { unit: string; axis: 'x' | 'y'; fixed: number; from: number; to: number; into: keyof typeof FACING_VECTORS; handover?: number }[] = [
  { unit: 'closet_drawers', axis: 'x', fixed: 316, from: 98, to: 210, into: 'down' },
  { unit: 'kitchen_sink_cabinet', axis: 'y', fixed: 958, from: 381, to: 483, into: 'right' },
  { unit: 'sideboard', axis: 'y', fixed: 744, from: 357, to: 449, into: 'right' },
  { unit: 'tv_unit', axis: 'y', fixed: 744, from: 139, to: 189, into: 'right' },
  { unit: 'microwave_unit', axis: 'x', fixed: 370, from: 916, to: 958, into: 'up', handover: 951 },
  { unit: 'stove_drawers', axis: 'x', fixed: 498, from: 929, to: 958, into: 'down', handover: 951 },
  { unit: 'sofa', axis: 'y', fixed: 506, from: 144, to: 236, into: 'left' },
  { unit: 'sink_cabinet', axis: 'x', fixed: 174, from: 836, to: 864, into: 'down' },
  { unit: 'wall_shelf', axis: 'x', fixed: 142, from: 909, to: 941, into: 'up' },
];

export function runTargetingTest(): void {
  console.log('=== TARGETING TEST (R7-1) ===');
  const items = buildInteractables(houseLayout.hidingSpots);
  const blockers = sightBlockers(houseLayout);
  const errors: string[] = [];
  const span = (it: Interactable, axis: 'x' | 'y') => (axis === 'x' ? [it.x, it.x + it.width] : [it.y, it.y + it.height]);

  for (const L of LINES) {
    for (const dir of [1, -1]) {
      const along: keyof typeof FACING_VECTORS = L.axis === 'x' ? (dir > 0 ? 'right' : 'left') : (dir > 0 ? 'down' : 'up');
      const back: keyof typeof FACING_VECTORS = ({ right: 'left', left: 'right', up: 'down', down: 'up' } as const)[along];
      const diag = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) * Math.SQRT1_2, y: (a.y + b.y) * Math.SQRT1_2 });
      // Straight along, straight into, and (QA R8-1) both diagonals into the unit.
      const FACES: [string, { x: number; y: number }][] = [
        [along, FACING_VECTORS[along]], [L.into, FACING_VECTORS[L.into]],
        [`${L.into}+${along}`, diag(FACING_VECTORS[L.into], FACING_VECTORS[along])],
        [`${L.into}+${back}`, diag(FACING_VECTORS[L.into], FACING_VECTORS[back])],
      ];
      for (const [facingName, facing] of FACES) {
        // 1 px steps with a 2 px overshoot / 1 px settle at every step (the jitter QA saw).
        let cur: string | null = null;
        const seq: number[] = [];
        const start = dir > 0 ? L.from : L.to, end = dir > 0 ? L.to : L.from;
        for (let c = start; dir > 0 ? c <= end : c >= end; c += dir) {
          for (const off of [2 * dir, 0]) {
            const v = c + off;
            const px = L.axis === 'x' ? v : L.fixed, py = L.axis === 'x' ? L.fixed : v;
            const t = selectTarget(px, py, facing, items, blockers, cur);
            // Corner rule: facing into the corner octant at the neighbour picks the corner section.
            const corner = t ? CORNER_SECTIONS[t.id] : undefined;
            if (corner) {
              if (facing.x * corner.x + facing.y * corner.y < Math.cos(Math.PI / 8) - 1e-9) errors.push(`${L.unit} ${facingName} at ${v}: corner ${t!.id} outside its window`);
              continue;
            }
            if (L.handover && facing.x > 0.5 && v > L.handover) {
              if (t?.unitId !== 'kitchen_sink_cabinet' && t?.unitId !== L.unit) errors.push(`${L.unit} corner at ${v}: ${t?.id}`);
              continue;
            }
            if (!t || t.unitId !== L.unit) { errors.push(`${L.unit} ${facingName} at ${px},${py}: got ${t?.id ?? 'none'}`); continue; }
            const [a, b] = span(t, L.axis);
            if (v < a - HYSTERESIS / 2 - 0.5 || v > b + HYSTERESIS / 2 + 0.5) errors.push(`${L.unit} ${facingName} at ${v}: ${t.id} is not in front (${a}-${b})`);
            cur = t.id;
            if (seq[seq.length - 1] !== t.drawer) seq.push(t.drawer);
          }
        }
        const monotonic = seq.every((d, i) => i === 0 || Math.sign(d - seq[i - 1]) === Math.sign(seq[1] - seq[0]));
        const steps = seq.every((d, i) => i === 0 || Math.abs(d - seq[i - 1]) === 1);
        if (!monotonic || !steps) errors.push(`${L.unit} walking ${dir > 0 ? '+' : '-'} facing ${facingName}: ${seq.join('>')}`);
        // Every section a player can stand in front of is reached walking either way.
        const want = items.filter((it) => it.unitId === L.unit && !CORNER_SECTIONS[it.id]).map((it) => it.drawer);
        const missing = want.filter((d) => !seq.includes(d));
        if (missing.length && !(L.handover && facing.x > 0.5)) errors.push(`${L.unit} walking ${dir > 0 ? '+' : '-'} facing ${facingName}: never reached d${missing.join(',d')} (${seq.join('>')})`);
      }
    }
  }
  // QA repro: at closet drawer 1, facing right after a 3-frame tap: still drawer 1 (in front).
  const r = selectTarget(107, 316, FACING_VECTORS.right, items, blockers, 'closet_drawers_d1');
  if (r?.id !== 'closet_drawers_d1') errors.push(`closet repro (107,316) facing right: ${r?.id}`);
  // QA R8-1: closet, hold Down+Right from (100,316) and release. Walk the diagonal in 1 px
  // steps (the closet blocks the down part); at every stop the section in front stays.
  for (const [unit, axis, fixed, from, to, face] of [
    ['closet_drawers', 'x', 316, 100, 210, { x: Math.SQRT1_2, y: Math.SQRT1_2 }],
    ['sofa', 'y', 506, 144, 236, { x: -Math.SQRT1_2, y: Math.SQRT1_2 }],
    ['sideboard', 'y', 744, 357, 449, { x: Math.SQRT1_2, y: Math.SQRT1_2 }],
    ['kitchen_sink_cabinet', 'y', 958, 381, 483, { x: Math.SQRT1_2, y: Math.SQRT1_2 }],
  ] as const) {
    let cur: string | null = null;
    const pos = (v: number) => (axis === 'x' ? [v, fixed] : [fixed, v]);
    for (let v = from; v <= to; v++) {
      const [px, py] = pos(v);
      cur = selectTarget(px, py, face, items, blockers, cur)?.id ?? null;
      // release: facing stays diagonal, the player stands still for 30 frames
      let still = cur;
      for (let f = 0; f < 30; f++) still = selectTarget(px, py, face, items, blockers, still)?.id ?? null;
      const it = items.find((i) => i.id === still);
      if (!it || it.unitId !== unit) { if (!(unit === 'kitchen_sink_cabinet' && it && CORNER_SECTIONS[it.id])) errors.push(`R8-1 ${unit} released at ${v}: ${still}`); continue; }
      const [a, b] = span(it, axis);
      if (v < a - HYSTERESIS / 2 - 0.5 || v > b + HYSTERESIS / 2 + 0.5) errors.push(`R8-1 ${unit} released at ${v} facing diagonally: ${still} is ahead (${a}-${b})`);
    }
  }
  const qa = (x: number) => selectTarget(x, 316, { x: Math.SQRT1_2, y: Math.SQRT1_2 }, items, blockers, 'closet_drawers_d1')?.id;
  if (qa(107) !== 'closet_drawers_d1') errors.push(`R8-1 QA repro: stopped at x=107 -> ${qa(107)} (want d1)`);
  if (selectTarget(121, 316, { x: Math.SQRT1_2, y: Math.SQRT1_2 }, items, blockers, 'closet_drawers_d2')?.id !== 'closet_drawers_d2') errors.push('R8-1 QA repro: stopped at x=121 not d2');
  // Corner windows: the whole diagonal octant (+-22.5 deg) picks the corner, outside it the neighbour.
  for (const [id, x, y, centre] of [['microwave_unit_d4', 958, 370, -45], ['stove_drawers_d3', 958, 498, 45]] as const) {
    const c = CORNER_SECTIONS[id];
    for (let deg = centre - 40; deg <= centre + 40; deg += 2.5) {
      const r = (deg * Math.PI) / 180, f = { x: Math.cos(r), y: Math.sin(r) };
      const t = selectTarget(x, y, f, items, blockers, c.neighbour)?.id;
      const inWin = Math.abs(deg - centre) <= 22.5;
      if (inWin && t !== id) errors.push(`corner ${id} at ${deg} deg: ${t}`);
      if (!inWin && t === id) errors.push(`corner ${id} steals at ${deg} deg`);
    }
  }
  // Corner sections still selectable diagonally from the neighbour's standpoint.
  for (const [id, c] of Object.entries(CORNER_SECTIONS)) {
    const pos = id.startsWith('microwave') ? [958, 370] : [958, 498];
    const t = selectTarget(pos[0], pos[1], c, items, blockers, c.neighbour);
    if (t?.id !== id) errors.push(`corner ${id} not picked diagonally from ${pos}: ${t?.id}`);
  }
  if (errors.length) {
    errors.slice(0, 30).forEach((e) => console.log(`✗ ${e}`));
    throw new Error(`Targeting test failed with ${errors.length} problem(s)`);
  }
  console.log(`✓ ${LINES.length} units walked both ways, facing along, into and both diagonals: section in front, no jumps or reversals`);
  console.log('✓ QA repro (closet d1, tap right) stays on d1; corner sections picked diagonally');
  console.log('✓ R8-1: diagonal hold-and-release along the closet, sofa, sideboard and kitchen sink cabinet keeps the section in front; corner octants pick only the corner');
  console.log('✅ TARGETING TEST PASSED');
}
