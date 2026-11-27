import assert from 'node:assert/strict';
import { hideInstanceAlreadyPlaced, hideVariantRequired } from '../logic/hidePlacement';

const t = (ok: boolean, msg: string) => { if (!ok) throw new Error(msg); };

t(hideVariantRequired('battery') && hideVariantRequired('toy_car'), 'car and battery need variant');
t(!hideVariantRequired('bullet'), 'bullet is single instance');

t(hideInstanceAlreadyPlaced('battery', '2', [{ kind: 'battery', variant: '2', spotId: 'x' }]), 'same battery slot');
t(!hideInstanceAlreadyPlaced('battery', '3', [{ kind: 'battery', variant: '2', spotId: 'x' }]), 'other battery slot');
t(hideInstanceAlreadyPlaced('paper_code', undefined, [{ kind: 'paper_code', spotId: 'x' }]), 'singleton kind');

export function runHidePlacementTest(): void {
  console.log('✓ hidePlacement tests passed');
}