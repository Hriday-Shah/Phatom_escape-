import type { RoundRole } from './roundPhase';
import { houseLayout } from '../data/houseLayout';

/** After the key is used, or with ?debug=unlock, everyone may pass. The Phantom always may. Holding the key is not enough — it must be spent on "Open door". */
export function canPassBedroomDoor(
  role: RoundRole | null | undefined,
  bedroomUnlocked = false,
  debugUnlock = false,
): boolean {
  if (debugUnlock || bedroomUnlocked) return true;
  return role === 'phantom';
}

export const BEDROOM_DOOR_MESSAGE = 'Requires a key';
export const BEDROOM_OPEN_LABEL = 'Open door';
export const BEDROOM_DOOR_REACH = 50;

export function bedroomDoorRect() {
  const door = houseLayout.doors.find((d) => d.id === 'bedroom_door');
  if (!door) return { x: 310, y: 374, width: 80, height: 12 };
  return door;
}

export function nearBedroomDoor(x: number, y: number, reach = BEDROOM_DOOR_REACH): boolean {
  const d = bedroomDoorRect();
  const cx = d.x + d.width / 2;
  const cy = d.y + d.height / 2;
  return Math.hypot(x - cx, y - cy) < reach;
}
