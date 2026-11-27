import type { RoundRole } from './roundPhase';

/** The Phantom can always pass the bedroom door. Players need the room key (or ?debug=unlock). */
export function canPassBedroomDoor(
  role: RoundRole | null | undefined,
  hasRoomKey = false,
  debugUnlock = false,
): boolean {
  if (debugUnlock) return true;
  if (role === 'phantom') return true;
  return hasRoomKey;
}
