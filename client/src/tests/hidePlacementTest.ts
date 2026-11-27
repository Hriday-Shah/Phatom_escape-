import { hideInstanceAlreadyPlaced, hideVariantRequired } from '../logic/hidePlacement';

const t = (ok: boolean, msg: string) => { if (!ok) throw new Error(msg); };

t(hideVariantRequired('battery') && hideVariantRequired('toy_car'), 'car and battery need variant');
t(!hideVariantRequired('bullet'), 'bullet is single instance');

t(hideInstanceAlreadyPlaced('battery', '2', [{ kind: 'battery', variant: '2', spotId: 'x' }]), 'same battery slot');
t(!hideInstanceAlreadyPlaced('battery', '3', [{ kind: 'battery', variant: '2', spotId: 'x' }]), 'other battery slot');
t(hideInstanceAlreadyPlaced('game_controller', undefined, [{ kind: 'game_controller', spotId: 'x' }]), 'singleton kind');
t(!hideInstanceAlreadyPlaced('paper_code', undefined, [{ kind: 'paper_code', spotId: 'x' }]), 'paper code is not a hidden item');
t(hideInstanceAlreadyPlaced('stun_gun', undefined, [{ kind: 'stun_gun', spotId: null, heldBy: 'p' }]), 'held item counts');
t(hideInstanceAlreadyPlaced('stun_gun', undefined, [{ kind: 'stun_gun', spotId: null, x: 200, y: 200 }]), 'floor drop counts');

export function runHidePlacementTest(): void {
  console.log('✓ hidePlacement tests passed');
}