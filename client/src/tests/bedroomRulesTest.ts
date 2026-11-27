import assert from 'node:assert/strict';
import { canPassBedroomDoor } from '../logic/doorAccess';
import { phantomButtonState } from '../logic/phantomControls';
import {
  BEDROOM_KEY_ERROR, BEDROOM_LIMIT_ERROR, autoPlaceHiddenItems, bedroomHideError, bedroomItemCount, isBedroomSpot,
} from '../logic/bedroomHide';
import {
  PLAYER_LIGHT_RADIUS_SCALE, PHANTOM_CHASE_LIGHT_RADIUS_SCALE, lightRadiusScale, scaledLightRadius,
} from '../config/lightConfig';
import { hidingSpotList } from '../logic/itemRound';
import type { ItemKind, WorldItem } from '../logic/items';
import { losBlockers, movementBlockers, wallDoorBlockers } from '../logic/worldCollision';
import { FLOOR_GROUND } from '../data/houseFloors';

function item(kind: ItemKind, spotId: string | null, id?: string): WorldItem {
  return { id: id ?? kind, kind, spotId, x: 0, y: 0, f: 0, heldBy: null };
}

export function runBedroomRulesTest(): void {
  const bedroom = hidingSpotList().filter((s) => isBedroomSpot(s.id));
  const other = hidingSpotList().filter((s) => !isBedroomSpot(s.id));
  assert.ok(bedroom.length >= 4, 'expected several locked-bedroom spots');
  assert.ok(other.length >= 4, 'expected spots outside the bedroom');

  assert.equal(canPassBedroomDoor('phantom', false, false), true);
  assert.equal(canPassBedroomDoor('player', false, false), false);
  assert.equal(canPassBedroomDoor('player', true, false), true, 'unlocked door is open to everyone');
  assert.equal(canPassBedroomDoor('player', false, true), true);
  assert.equal(canPassBedroomDoor(null, false, false), false);

  assert.equal(bedroomHideError('battery', other[0]!.id, []), null);
  assert.equal(bedroomHideError('room_key', other[0]!.id, []), null);
  assert.equal(bedroomHideError('room_key', bedroom[0]!.id, []), BEDROOM_KEY_ERROR);
  const three = bedroom.slice(0, 3).map((s, i) => item('battery', s.id, `b${i}`));
  assert.equal(bedroomHideError('battery', bedroom[3]!.id, three), BEDROOM_LIMIT_ERROR);
  assert.equal(bedroomHideError('battery', bedroom[0]!.id, three.slice(0, 2)), null);
  const onFloor = [
    { kind: 'bullet', spotId: null, x: 250, y: 200 },
    { kind: 'stun_gun', spotId: null, x: 280, y: 200 },
    { kind: 'wire_cutter', spotId: null, x: 310, y: 200 },
  ];
  assert.equal(bedroomItemCount(onFloor), 3, 'floor drops count toward the cap');
  assert.equal(bedroomHideError('battery', bedroom[0]!.id, onFloor), BEDROOM_LIMIT_ERROR);
  assert.equal(bedroomHideError('battery', null, onFloor, { x: 250, y: 220 }), BEDROOM_LIMIT_ERROR);
  assert.equal(bedroomItemCount([{ kind: 'bullet', spotId: null, x: 250, y: 200, heldBy: 'p' }]), 0, 'held items do not count');

  const pending: WorldItem[] = [
    item('room_key', null, 'key'),
    item('battery', null, 'b1'),
    item('battery', null, 'b2'),
    item('battery', null, 'b3'),
    item('battery', null, 'b4'),
  ];
  autoPlaceHiddenItems(pending, () => 0);
  assert.ok(pending.every((i) => i.spotId), 'every leftover item received a legal spot');
  assert.ok(pending.find((i) => i.kind === 'room_key')!.spotId && !isBedroomSpot(pending.find((i) => i.kind === 'room_key')!.spotId!), 'key stayed out of the bedroom');
  assert.ok(bedroomItemCount(pending) <= 3, `bedroom held ${bedroomItemCount(pending)}`);

  const pass = movementBlockers(false, FLOOR_GROUND, true);
  const blocked = movementBlockers(false, FLOOR_GROUND, false);
  assert.ok(blocked.length > pass.length, 'the bedroom door is omitted from movement when the Phantom may pass');
  assert.equal(losBlockers(false, FLOOR_GROUND).length, wallDoorBlockers(false, FLOOR_GROUND, false).length);
  assert.ok(wallDoorBlockers(false, FLOOR_GROUND, true).length < wallDoorBlockers(false, FLOOR_GROUND, false).length);

  assert.equal(PLAYER_LIGHT_RADIUS_SCALE, 0.82);
  assert.equal(PHANTOM_CHASE_LIGHT_RADIUS_SCALE, 0.55);
  assert.equal(lightRadiusScale('player', 'search'), 0.82);
  assert.equal(lightRadiusScale('player', 'chase'), 0.82);
  assert.equal(lightRadiusScale('phantom', 'hiding'), 0.82);
  assert.equal(lightRadiusScale('phantom', 'search'), 0.82);
  assert.equal(lightRadiusScale('phantom', 'chase'), 0.55);
  assert.equal(Math.round(scaledLightRadius(200, 'phantom', 'chase')), 110);
  assert.equal(Math.round(scaledLightRadius(200, 'player', 'chase')), 164);

  assert.deepEqual(phantomButtonState('hiding'), { place: true, drop: true, catch: false });
  assert.deepEqual(phantomButtonState('chase'), { place: false, drop: false, catch: true });

  console.log('  ✓ bedroom hide rules, door pass, and light scales');
  console.log('\n✅ BEDROOM RULES TEST PASSED');
}
