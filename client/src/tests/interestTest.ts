/**
 * Interest and minimap rules (stage 3). A hidden x,y must not survive in the
 * wire payload or in the pose map a phone keeps. Bearings are a sector, not a
 * point on the map.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LIGHT_MASK_RADIUS } from '../config/lightConfig';
import { FLOOR_GROUND, FLOOR_UPPER } from '../data/houseFloors';
import {
  authoritativePoseMap, bearingSector, filterIncomingPoses, liveMessages, messageLeaksPoint,
  minimapWire, posesForViewer, readBearings, teammateBearings, type InterestActor, type InterestPhase,
} from '../logic/interest';
import { arrowAnchor, floorToMinimap, pushReveal, revealCovers } from '../logic/minimap';
import { minimapBox } from '../ui/shellLayout';
import { computeShellLayout } from '../ui/shellLayout';

const chase: InterestPhase = {
  phase: 'chase',
  roles: [
    { id: 'me', role: 'player' },
    { id: 'mate', role: 'player' },
    { id: 'ph', role: 'phantom' },
    { id: 'up', role: 'player' },
  ],
};

const me: InterestActor = { id: 'me', role: 'player', x: 400, y: 400, f: FLOOR_GROUND, d: 2, m: 0 };
const mate: InterestActor = { id: 'mate', role: 'player', x: 440, y: 420, f: FLOOR_GROUND, d: 2, m: 1 };
const phantom: InterestActor = { id: 'ph', role: 'phantom', x: 408.5, y: 401.5, f: FLOOR_GROUND, d: 0, m: 0 };
const upstairs: InterestActor = { id: 'up', role: 'player', x: 420, y: 380, f: FLOOR_UPPER, d: 0, m: 0 };
const far: InterestActor = { id: 'mate', role: 'player', x: 900.5, y: 700.5, f: FLOOR_GROUND, d: 1, m: 1 };

export function runInterestTest(): void {
  console.log('Interest and minimap');
  const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public/assets/manifest.json'), 'utf8'));
  const mask = manifest.assets.find((a: { key: string }) => a.key === 'fx_light_mask');
  assert.equal(mask.worldSize[0] / 2, LIGHT_MASK_RADIUS, 'server light radius matches the approved mask');

  const actors = [me, mate, phantom, upstairs];
  const visible = posesForViewer(me, actors, 'chase');
  assert.ok(visible.some((row) => row[0] === 'mate' && row[1] === 440 && row[2] === 420), 'teammate in the light is included');
  assert.equal(visible.some((row) => row[0] === 'ph'), false, 'a player snapshot has no Phantom pose');
  assert.equal(visible.some((row) => row[0] === 'up'), false, 'a cross-floor pose is omitted');

  const bearings = teammateBearings(me, actors, 'chase');
  assert.ok(bearings.some((row) => row[0] === 'mate'));
  assert.equal(bearings.some((row) => row[0] === 'ph'), false, 'never an arrow toward a Phantom');
  assert.equal(bearings.some((row) => row[0] === 'up'), false, 'no arrow to another floor');
  assert.deepEqual(teammateBearings({ ...me, role: 'phantom' }, actors, 'chase'), [], 'a Phantom gets no arrows');

  // The live messages a phone would receive once the teammate has left the light.
  const still = posesForViewer(me, [me, far, phantom, upstairs], 'chase');
  const wire = liveMessages(still, ['mate'], teammateBearings(me, [me, far, phantom, upstairs], 'chase'));
  assert.equal(wire.poses.p.some((row) => row[0] === 'mate'), false);
  assert.deepEqual(wire.poses.drop, ['mate']);
  assert.equal(messageLeaksPoint(wire, phantom.x, phantom.y), false, 'Phantom x,y must not be sent');
  assert.equal(messageLeaksPoint(wire, upstairs.x, upstairs.y), false, 'cross-floor x,y must not be sent');
  assert.equal(messageLeaksPoint(wire, far.x, far.y), false, 'a hidden teammate x,y must not be sent');
  assert.equal(wire.map.b.some((row) => row[0] === 'mate'), true, 'the bearing remains without coordinates');
  for (const row of wire.map.b) assert.equal(row.length, 2);
  assert.equal(JSON.stringify(wire.map).includes('"x"'), false);
  assert.equal(Object.keys(minimapWire(bearings)).join(), 'b');

  // A bad payload that tacks coordinates onto a bearing must not be remembered.
  const leaked = readBearings({ b: [['mate', 2, far.x, far.y], ['ph', 1], ['nope', 1.5]] });
  assert.deepEqual(leaked, [['mate', 2], ['ph', 1]], 'only id and sector are kept');
  assert.equal(leaked.every((row) => row.length === 2), true);
  assert.equal(messageLeaksPoint(leaked, far.x, far.y), false, 'minimap memory drops hidden coordinates');

  const phase = chase;
  const raw = [
    [me.id, me.x, me.y, 2, 0, 0],
    [phantom.id, phantom.x, phantom.y, 0, 0, 0],
    [upstairs.id, upstairs.x, upstairs.y, 0, 0, 1],
    [far.id, far.x, far.y, 1, 1, 0],
    [mate.id, mate.x, mate.y, 2, 1, 0],
  ] as const;
  const kept = filterIncomingPoses(raw, 'me', phase);
  assert.equal(messageLeaksPoint(kept, phantom.x, phantom.y), false);
  assert.equal(messageLeaksPoint(kept, upstairs.x, upstairs.y), false);
  assert.equal(messageLeaksPoint(kept, far.x, far.y), false);
  assert.ok(kept.some((row) => row[0] === 'mate'));

  const prev = new Map(raw.map((row) => [row[0], [row[0], row[1], row[2], row[3], row[4], row[5]] as [string, number, number, number, number, number]]));
  const next = authoritativePoseMap(prev, { p: kept, drop: [] }, 'me', phase);
  assert.equal(next.has('ph'), false);
  assert.equal(next.has('up'), false);
  assert.equal(next.has('mate'), true);
  assert.equal(messageLeaksPoint([...next.values()], phantom.x, phantom.y), false);

  const near = bearingSector(10, 0);
  const away = bearingSector(400, 0);
  assert.equal(near, away, 'bearing ignores distance');
  const box = { x: 0, y: 0, w: 80, h: 80 };
  const arrow = arrowAnchor(40, 40, 40, near!);
  const plotted = floorToMinimap(FLOOR_GROUND, 900.5, 400, box);
  assert.ok(Math.hypot(arrow.x - plotted.x, arrow.y - plotted.y) > 8, 'the arrow is not a map sprite at their x,y');
  assert.deepEqual(arrow, arrowAnchor(40, 40, 40, away!), 'same sector, same arrow, any distance');

  let stamps = pushReveal([], FLOOR_GROUND, 400, 400, 80);
  assert.equal(revealCovers(stamps, FLOOR_GROUND, 450, 400), true);
  assert.equal(revealCovers(stamps, FLOOR_GROUND, 900, 400), false, 'unseen floor stays dark');
  assert.equal(revealCovers(stamps, FLOOR_UPPER, 400, 400), false, 'the other floor is not revealed');
  const again = pushReveal(stamps, FLOOR_GROUND, 900, 500, 40);
  assert.equal(revealCovers(again, FLOOR_GROUND, 450, 400), true, 'seen-this-round stays lit');
  assert.equal(revealCovers(again, FLOOR_GROUND, 900, 500), true);

  const portrait = minimapBox(computeShellLayout(390, 844, { top: 0, right: 0, bottom: 0, left: 0 }, 2));
  const landscape = minimapBox(computeShellLayout(844, 390, { top: 0, right: 0, bottom: 0, left: 0 }, 2));
  assert.ok(portrait.w > 0 && landscape.w > 0);
  assert.ok(portrait.y > landscape.y || portrait.x !== landscape.x, 'portrait and landscape place the circle with the screen');

  console.log('  ✓ poses, bearings, hidden coordinates, fog');
}
