/**
 * R7-1: targeting along a multi-section unit. Walking (or nudging) sideways along a unit's
 * front, with the facing turned sideways as the game does, the highlight must follow the
 * section in front of the player's centre: never jump ahead, never reverse, and only change
 * once the centre is HYSTERESIS px past the current section's edge. Also: corner sections are
 * still picked diagonally, and straight on the section in front always wins.
 */
import { houseLayout } from '../data/houseLayout';
import {
  CORNER_SECTIONS, FACING_VECTORS, HYSTERESIS, Interactable, buildInteractables, frontKey, selectTarget, sightBlockers,
} from '../logic/spotTargeting';
import { FacingFilter } from '../logic/facingFilter';

/** Walk lines just in front of each multi-section unit (player centre touching the front). */
// `handover` is unused now (the enlarged kitchen has no corner section) but kept in the
// type so a future corner can hook the same walk check.
const LINES: { unit: string; axis: 'x' | 'y'; fixed: number; from: number; to: number; into: keyof typeof FACING_VECTORS; handover?: number }[] = [
  { unit: 'closet_drawers', axis: 'x', fixed: 316, from: 98, to: 210, into: 'down' },
  { unit: 'kitchen_sink_cabinet', axis: 'x', fixed: 548, from: 892, to: 1006, into: 'down' },
  { unit: 'sideboard', axis: 'y', fixed: 744, from: 357, to: 449, into: 'right' },
  { unit: 'tv_unit', axis: 'y', fixed: 744, from: 139, to: 189, into: 'right' },
  { unit: 'microwave_unit', axis: 'y', fixed: 870, from: 376, to: 454, into: 'left' },
  { unit: 'stove_drawers', axis: 'y', fixed: 1028, from: 336, to: 410, into: 'right' },
  { unit: 'sofa', axis: 'y', fixed: 506, from: 144, to: 236, into: 'left' },
  { unit: 'sink_cabinet', axis: 'x', fixed: 174, from: 836, to: 864, into: 'down' },
  { unit: 'wall_shelf', axis: 'x', fixed: 142, from: 909, to: 941, into: 'up' },
  // R9-1 front groups (separate spots sharing one front; `unit` is the FRONT_GROUPS key).
  { unit: 'study_drawers', axis: 'y', fixed: 142, from: 166, to: 296, into: 'left' },
  { unit: 'stove_counter', axis: 'y', fixed: 1028, from: 336, to: 494, into: 'right' },
  { unit: 'sofa_row', axis: 'y', fixed: 506, from: 144, to: 320, into: 'left' },
];
/** Is `t` part of line unit `u` (a sectioned unit id or a front group key)? */
const inUnit = (t: Interactable | null | undefined, u: string) => !!t && (t.unitId === u || frontKey(t) === u);

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
      // Ordinal of each spot / section along the line (front groups mix ids, so not `drawer`).
      const lineItems = items.filter((it) => inUnit(it, L.unit)).sort((p, q) => span(p, L.axis)[0] - span(q, L.axis)[0]);
      const ord = (it: Interactable) => lineItems.indexOf(it) + 1;
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
              if (t?.unitId !== 'kitchen_sink_cabinet' && !inUnit(t, L.unit)) errors.push(`${L.unit} corner at ${v}: ${t?.id}`);
              continue;
            }
            if (!t || !inUnit(t, L.unit)) { errors.push(`${L.unit} ${facingName} at ${px},${py}: got ${t?.id ?? 'none'}`); continue; }
            const [a, b] = span(t, L.axis);
            // In front: the centre is on its span (or, in a gap between spots, it is the nearest),
            // give or take the hysteresis band.
            const outOf = (it: Interactable) => { const [p0, p1] = span(it, L.axis); return v < p0 ? p0 - v : v > p1 ? v - p1 : 0; };
            const nearest = Math.min(...lineItems.filter((it) => !CORNER_SECTIONS[it.id]).map(outOf));
            if (outOf(t) > nearest + HYSTERESIS / 2 + 0.5) errors.push(`${L.unit} ${facingName} at ${v}: ${t.id} is not in front (${a}-${b})`);
            cur = t.id;
            if (seq[seq.length - 1] !== ord(t)) seq.push(ord(t));
          }
        }
        const monotonic = seq.every((d, i) => i === 0 || Math.sign(d - seq[i - 1]) === Math.sign(seq[1] - seq[0]));
        const steps = seq.every((d, i) => i === 0 || Math.abs(d - seq[i - 1]) === 1);
        if (!monotonic || !steps) errors.push(`${L.unit} walking ${dir > 0 ? '+' : '-'} facing ${facingName}: ${seq.join('>')}`);
        // Every section a player can stand in front of is reached walking either way.
        const want = lineItems.filter((it) => !CORNER_SECTIONS[it.id] && span(it, L.axis)[0] <= L.to && span(it, L.axis)[1] >= L.from);
        const missing = want.filter((it) => !seq.includes(ord(it)));
        if (missing.length && !(L.handover && facing.x > 0.5)) errors.push(`${L.unit} walking ${dir > 0 ? '+' : '-'} facing ${facingName}: never reached ${missing.map((it) => it.id).join(',')} (${seq.join('>')})`);
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
    ['kitchen_sink_cabinet', 'x', 548, 892, 1006, { x: Math.SQRT1_2, y: Math.SQRT1_2 }],
    ['study_drawers', 'y', 142, 166, 296, { x: -Math.SQRT1_2, y: Math.SQRT1_2 }],
    ['study_drawers', 'y', 142, 166, 296, { x: 0, y: 1 }],
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
      if (!it || !inUnit(it, unit)) { if (!(unit === 'kitchen_sink_cabinet' && it && CORNER_SECTIONS[it.id])) errors.push(`R8-1 ${unit} released at ${v}: ${still}`); continue; }
      const [a, b] = span(it, axis);
      if (v < a - HYSTERESIS / 2 - 0.5 || v > b + HYSTERESIS / 2 + 0.5) errors.push(`R8-1 ${unit} released at ${v} facing diagonally: ${still} is ahead (${a}-${b})`);
    }
  }
  const qa = (x: number) => selectTarget(x, 316, { x: Math.SQRT1_2, y: Math.SQRT1_2 }, items, blockers, 'closet_drawers_d1')?.id;
  if (qa(107) !== 'closet_drawers_d1') errors.push(`R8-1 QA repro: stopped at x=107 -> ${qa(107)} (want d1)`);
  if (selectTarget(121, 316, { x: Math.SQRT1_2, y: Math.SQRT1_2 }, items, blockers, 'closet_drawers_d2')?.id !== 'closet_drawers_d2') errors.push('R8-1 QA repro: stopped at x=121 not d2');
  // QA R9-1: study drawers, (142,182) facing left on drawer 1, then a tap of Down / Down+Left
  // (and Up / Up+Left) of 2..9 frames from every 2 px of the column; after release the drawer
  // in front stays. QA counted 33/88 wrong diagonal cases before grouping.
  {
    const STEP = 200 / 60; // px per frame at PLAYER_SPEED
    const studyItems = items.filter((it) => inUnit(it, 'study_drawers'));
    let cases = 0, wrong = 0; const bad: string[] = [];
    for (let y0 = 166; y0 <= 290; y0 += 2) {
      for (const [kname, k] of [['down', { x: 0, y: 1 }], ['down+left', { x: -Math.SQRT1_2, y: Math.SQRT1_2 }], ['up', { x: 0, y: -1 }], ['up+left', { x: -Math.SQRT1_2, y: -Math.SQRT1_2 }]] as const) {
        for (let frames = 2; frames <= 9; frames++) {
          const f = new FacingFilter(); f.set(-1, 0);
          let y = y0;
          let cur = selectTarget(142, y, f.facing, items, blockers, null)?.id ?? null;
          for (let i = 0; i < frames; i++) { f.update(k); y = Math.max(166, Math.min(296, y + k.y * STEP)); cur = selectTarget(142, y, f.facing, items, blockers, cur)?.id ?? null; }
          for (let i = 0; i < 30; i++) cur = selectTarget(142, y, f.facing, items, blockers, cur)?.id ?? null;
          cases++;
          const it = items.find((q) => q.id === cur);
          const [a, b] = it ? span(it, 'y') : [NaN, NaN];
          const nearest = Math.min(...studyItems.map((q) => { const [p0, p1] = span(q, 'y'); return y < p0 ? p0 - y : y > p1 ? y - p1 : 0; }));
          const out = y < a ? a - y : y > b ? y - b : 0;
          if (!it || !inUnit(it, 'study_drawers') || out > nearest + HYSTERESIS / 2 + 0.5) { wrong++; if (bad.length < 5) bad.push(`${kname} ${frames}f from ${y0} -> y ${y.toFixed(1)}: ${cur}`); }
        }
      }
    }
    if (wrong) errors.push(`R9-1 study taps: ${wrong}/${cases} wrong, e.g. ${bad.join('; ')}`);
    const tap = (k: { x: number; y: number }) => { const f = new FacingFilter(); f.set(-1, 0); let y = 182; let cur: string | null = 'study_drawer_1';
      for (let i = 0; i < 4; i++) { f.update(k); y += k.y * STEP; cur = selectTarget(142, y, f.facing, items, blockers, cur)?.id ?? null; } return cur; };
    if (tap({ x: 0, y: 1 }) !== 'study_drawer_1') errors.push(`R9-1 QA repro: tap Down at (142,182) -> ${tap({ x: 0, y: 1 })}`);
    if (tap({ x: -Math.SQRT1_2, y: Math.SQRT1_2 }) !== 'study_drawer_1') errors.push(`R9-1 QA repro: tap Down+Left at (142,182) -> ${tap({ x: -Math.SQRT1_2, y: Math.SQRT1_2 })}`);
    if (!wrong) console.log(`✓ R9-1: study drawers as one front group; QA taps (Down, Down+Left at 142,182) stay on drawer 1; ${cases} tap cases, 0 wrong`);
  }
  // R9-1 audit: in the fridge / sink corner, facing the fridge picks the fridge, facing the sink the sink.
  for (const [f, want] of [[{ x: -1, y: 0 }, 'fridge'], [{ x: 0, y: -1 }, 'fridge'], [{ x: 0, y: 1 }, 'kitchen_sink_cabinet_d4'], [{ x: 1, y: 0 }, 'kitchen_sink_cabinet_d4']] as const) {
    const t = selectTarget(884, 548, f, items, blockers, null)?.id;
    if (t !== want) errors.push(`fridge/sink corner (884,548) facing ${f.x},${f.y}: ${t} (want ${want})`);
  }
  // The enlarged kitchen has no corner sections (sink door 1 is straight-on reachable).
  if (Object.keys(CORNER_SECTIONS).length === 0) {
    console.log('✓ R9-2: no corner sections in the enlarged kitchen (sink d1 is straight-on)');
  } else {
    errors.push(`CORNER_SECTIONS has ${Object.keys(CORNER_SECTIONS).join(', ')} but this test has no standpoints for them`);
  }
  // Sink door 1 is reachable straight-on from in front of it (no longer a corner).
  {
    const t = selectTarget(995, 548, FACING_VECTORS.down, items, blockers, null)?.id;
    if (t !== 'kitchen_sink_cabinet_d1') errors.push(`sink d1 straight-on at (995,548): ${t}`);
    else console.log('✓ sink door 1 is targeted straight-on from (995,548) facing down');
  }
  if (errors.length) {
    errors.slice(0, 30).forEach((e) => console.log(`✗ ${e}`));
    throw new Error(`Targeting test failed with ${errors.length} problem(s)`);
  }
  console.log(`✓ ${LINES.length} units / front groups walked both ways, facing along, into and both diagonals: section in front, no jumps or reversals`);
  console.log('✓ QA repro (closet d1, tap right) stays on d1; corner sections picked diagonally');
  console.log('✓ R8-1: diagonal hold-and-release along the closet, sofa, sideboard and kitchen sink cabinet keeps the section in front');
  console.log('✅ TARGETING TEST PASSED');
}
