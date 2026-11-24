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

export function makeEscapeCode(rng: Rng): EscapeCode {
  const order = shuffle(rng, [...TOY_CAR_COLOURS]);
  return order as EscapeCode;
}

export function codesEqual(a: EscapeCode, b: EscapeCode): boolean {
  return a.length === 4 && a.every((c, i) => c === b[i]);
}
