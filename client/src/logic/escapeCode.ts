/**
 * The paper / escape code: the order of the four toy-car colours (matches the
 * four slots on the approved ui_paper_code_view art).
 */
import { TOY_CAR_COLOURS, ToyCarColour } from './items';
import { Rng, shuffle } from './seededRng';

export type EscapeCode = [ToyCarColour, ToyCarColour, ToyCarColour, ToyCarColour];

export const CODE_COLOURS: Record<ToyCarColour, number> = {
  red: 0xc13a3a,
  blue: 0x3a7bf2,
  violet: 0x9b6bff,
  yellow: 0xf2d13a,
};

/** Letters shown on the swatches so the code is not colour-only (R14-10). */
export const CODE_GLYPH: Record<ToyCarColour, string> = {
  red: 'R',
  blue: 'B',
  violet: 'V',
  yellow: 'Y',
};

export function makeEscapeCode(rng: Rng): EscapeCode {
  const order = shuffle(rng, [...TOY_CAR_COLOURS]);
  return order as EscapeCode;
}

export function codesEqual(a: EscapeCode, b: EscapeCode): boolean {
  return a.length === 4 && a.every((c, i) => c === b[i]);
}

/** Tap a slot: advance that car to the next colour, swapping if needed so the code stays a permutation. */
export function cycleCodeSlot(code: readonly ToyCarColour[], index: number): EscapeCode {
  const out = [...code] as EscapeCode;
  if (index < 0 || index > 3) return out;
  const cur = out[index];
  if (!cur) return out;
  const next = TOY_CAR_COLOURS[(TOY_CAR_COLOURS.indexOf(cur) + 1) % TOY_CAR_COLOURS.length]!;
  const swap = out.indexOf(next);
  out[index] = next;
  if (swap >= 0 && swap !== index) out[swap] = cur;
  return out;
}

export const CODE_CSS: Record<ToyCarColour, string> = {
  red: '#c13a3a',
  blue: '#3a7bf2',
  violet: '#9b6bff',
  yellow: '#f2d13a',
};
