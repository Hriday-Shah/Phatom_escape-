import assert from 'node:assert/strict';
import {
  bodyTextureKey, canMove, canSeeInside, isWaiting, walkAnimKey,
} from '../logic/roundPhase';

export function runRoundPhaseTest(): void {
  assert.equal(isWaiting('player', 'hiding'), true);
  assert.equal(isWaiting('phantom', 'hiding'), false);
  assert.equal(isWaiting('player', 'search'), false);
  assert.equal(canSeeInside('player', 'hiding'), false);
  assert.equal(canSeeInside('phantom', 'hiding'), true);
  assert.equal(canSeeInside('player', 'search'), true);
  assert.equal(canSeeInside('phantom', 'search'), false);
  assert.equal(canMove('player', 'hiding'), false);
  assert.equal(canMove('phantom', 'hiding'), true);
  assert.equal(canMove('player', 'search'), true);
  assert.equal(canMove('phantom', 'ended'), false);
  assert.equal(canMove('player', 'ended'), false);
  assert.equal(canSeeInside('player', 'ended'), true);
  assert.equal(bodyTextureKey('phantom'), 'phantom');
  assert.equal(bodyTextureKey('player'), 'player');
  assert.equal(walkAnimKey('phantom', 'down'), 'phantom_walk_down');
  assert.equal(walkAnimKey('player', 'left'), 'walk_left');
  console.log('  ✓ waiting room + Phantom sprite keys follow the role and phase');
  console.log('\n✅ ROUND PHASE TEST PASSED');
}
