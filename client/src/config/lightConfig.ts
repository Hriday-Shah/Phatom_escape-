/**
 * Limited-vision radii, as a fraction of the approved fx_light_mask radius
 * (208 world px). The server interest check uses the same radius the phone draws.
 */
import type { RoundPhase, RoundRole } from '../logic/roundPhase';

/** Half of fx_light_mask worldSize (416). Manifest test locks this to the art. */
export const LIGHT_MASK_RADIUS = 208;

/** Players (and the Phantom while hiding): slightly tighter than the full mask, for a spookier house. */
export const PLAYER_LIGHT_RADIUS_SCALE = 0.82;
/** Phantom during chase: a much smaller circle so they cannot sweep the house as easily. */
export const PHANTOM_CHASE_LIGHT_RADIUS_SCALE = 0.55;

export function lightRadiusScale(role: RoundRole | null, phase: RoundPhase | null): number {
  if (role === 'phantom' && phase === 'chase') return PHANTOM_CHASE_LIGHT_RADIUS_SCALE;
  return PLAYER_LIGHT_RADIUS_SCALE;
}

export function scaledLightRadius(base: number, role: RoundRole | null, phase: RoundPhase | null): number {
  return base * lightRadiusScale(role, phase);
}
