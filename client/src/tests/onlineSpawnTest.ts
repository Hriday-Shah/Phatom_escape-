/** Online spawn grid: walkable, in-bounds, label-width spacing (R13-2). */
import { onlineSpawnPoint, onlineSpawnSlots, onlineStartPoint, spawnWalkable, SPAWN_SPACING, SPAWN_SLOTS } from '../logic/onlineSpawn';

export function runOnlineSpawnTest(): void {
  console.log('\n=== ONLINE SPAWN TEST ===');
  const errors: string[] = [];
  const origin = { x: 300, y: 430 };
  const slots = onlineSpawnSlots(origin);
  if (slots.length !== SPAWN_SLOTS) errors.push(`expected ${SPAWN_SLOTS} slots, got ${slots.length}`);
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!spawnWalkable(s.x, s.y)) errors.push(`slot ${i} (${s.x},${s.y}) is not walkable`);
  }
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const dx = Math.abs(slots[i].x - slots[j].x), dy = Math.abs(slots[i].y - slots[j].y);
      const d = Math.hypot(dx, dy);
      if (d < 32) errors.push(`slots ${i} and ${j} overlap (${d.toFixed(1)} px)`);
      // Same row: labels sit at the same height, so they need label-width spacing.
      if (dy < 16 && dx + 1e-6 < SPAWN_SPACING) errors.push(`slots ${i} and ${j} on one row are ${dx.toFixed(1)} px apart (need ${SPAWN_SPACING})`);
    }
  }
  // Default spawn itself must stay reachable (slot 1 is at/near the origin row).
  if (!spawnWalkable(origin.x, origin.y)) errors.push('entrance spawn is not walkable');
  const saved = onlineStartPoint(origin, 0, { x: 890, y: 165 }, false);
  if (saved.x !== 890 || saved.y !== 165) errors.push(`saved pose should win, got ${saved.x},${saved.y}`);
  const slot = onlineStartPoint(origin, 0, null, false);
  const expected = onlineSpawnPoint(origin, 0);
  if (slot.x !== expected.x || slot.y !== expected.y) errors.push('without a saved pose, start on the entrance slot');
  const dev = onlineStartPoint(origin, 0, { x: 890, y: 165 }, true);
  if (dev.x !== origin.x || dev.y !== origin.y) errors.push('a dev ?spawn= keeps the requested point');
  if (errors.length) { errors.forEach((e) => console.log('✗ ' + e)); throw new Error('Online spawn test failed'); }
  console.log(`✓ ${SPAWN_SLOTS} walkable start points, all ≥ ${SPAWN_SPACING} px apart around (300,430)`);
  console.log('✅ ONLINE SPAWN TEST PASSED');
}
