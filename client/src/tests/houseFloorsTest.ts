import assert from 'node:assert/strict';
import { houseLayout } from '../data/houseLayout';
import { buildInteractables } from '../logic/spotTargeting';
import {
  composeWindowRects,
  FLOOR_GROUND,
  FLOOR_UPPER,
  LIVING_STAIR_OPENING,
  poseInsideFloor,
  STAIR_LAND_GROUND,
  STAIR_LAND_UPPER,
} from '../data/houseFloors';
import {
  applyStairTransition,
  footOnStairPad,
  movementBlockersForFloor,
  resolveStairAfterMove,
  STAIR_PAD_GROUND,
  STAIR_PAD_UPPER,
  reconcileFloor,
} from '../logic/floorMovement';
import { canUseSpot } from '../logic/worldCollision';
import { pointBlocked, PLAYER_BODY_RADIUS } from '../logic/worldCollision';

export function runHouseFloorsTest(): void {
  console.log('House floors (S3-A): stairs, reach, ground spots');

  const spots = buildInteractables(houseLayout.hidingSpots);
  assert.equal(spots.length, 36, 'ground floor still has 36 hiding/search sections');

  const livingWin = { x: 540, y: 100, width: 160, height: 10 };
  assert.ok(
    composeWindowRects([...houseLayout.windows, livingWin]).every((w) => w.x !== livingWin.x || w.y !== livingWin.y),
    'composed walls must not paint a living-room window over the stairs',
  );
  assert.equal(
    composeWindowRects(houseLayout.windows).some((w) =>
      w.x < LIVING_STAIR_OPENING.x + LIVING_STAIR_OPENING.width &&
      w.x + w.width > LIVING_STAIR_OPENING.x),
    false,
  );

  const up = applyStairTransition({ x: STAIR_PAD_GROUND.x + 20, y: STAIR_PAD_GROUND.y + 10, f: FLOOR_GROUND });
  assert.ok(up);
  assert.equal(up!.f, FLOOR_UPPER);
  assert.equal(up!.x, STAIR_LAND_UPPER.x);
  assert.equal(up!.y, STAIR_LAND_UPPER.y);

  const down = applyStairTransition({ x: STAIR_PAD_UPPER.x + 20, y: STAIR_PAD_UPPER.y + 10, f: FLOOR_UPPER });
  assert.ok(down);
  assert.equal(down!.f, FLOOR_GROUND);

  assert.equal(
    applyStairTransition({ x: 300, y: 430, f: FLOOR_GROUND }),
    null,
    'walking on the entrance does not change floor',
  );

  const cheated = reconcileFloor(
    { x: STAIR_LAND_GROUND.x, y: STAIR_LAND_GROUND.y, f: FLOOR_GROUND },
    { x: STAIR_LAND_UPPER.x, y: STAIR_LAND_UPPER.y, f: FLOOR_UPPER },
  );
  assert.equal(cheated.f, FLOOR_GROUND, 'teleport upstairs without the stair pad is rejected');

  const sofa = spots.find((s) => s.id === 'sofa_d1') ?? spots[0]!;
  const nearSofa = { x: sofa.x + sofa.width / 2, y: sofa.y + sofa.height + 40, f: FLOOR_GROUND };
  const upstairs = { x: nearSofa.x, y: nearSofa.y, f: FLOOR_UPPER };
  assert.ok(canUseSpot(nearSofa, sofa.id), 'same-floor reach at sofa');
  assert.equal(canUseSpot(upstairs, sofa.id), false, 'upstairs cannot open ground spots');

  const groundBlockers = movementBlockersForFloor(FLOOR_GROUND);
  assert.ok(groundBlockers.length > 50);
  const upperBlockers = movementBlockersForFloor(FLOOR_UPPER);
  assert.ok(upperBlockers.length >= 4 && upperBlockers.length < groundBlockers.length);

  assert.equal(
    applyStairTransition({ x: STAIR_LAND_GROUND.x, y: STAIR_LAND_GROUND.y, f: FLOOR_GROUND }),
    null,
    'ground landing is south of the pad (no instant re-ride)',
  );

  const downSnap = resolveStairAfterMove(
    { x: STAIR_PAD_UPPER.x + 25, y: STAIR_PAD_UPPER.y + 10, f: FLOOR_UPPER },
    STAIR_LAND_GROUND.x,
    STAIR_LAND_GROUND.y,
  );
  assert.equal(downSnap.f, FLOOR_GROUND, 'server/client landing snap from upper pad');

  assert.ok(footOnStairPad(STAIR_PAD_GROUND.x + 5, STAIR_PAD_GROUND.y + 5, FLOOR_GROUND));
  assert.ok(!pointBlocked(STAIR_LAND_UPPER.x, STAIR_LAND_UPPER.y, upperBlockers, PLAYER_BODY_RADIUS));
  assert.ok(poseInsideFloor(STAIR_LAND_UPPER.x, STAIR_LAND_UPPER.y, FLOOR_UPPER, PLAYER_BODY_RADIUS));

  console.log('  ✓ stair pads, anti-teleport, 36 spots, same-floor reach');
}