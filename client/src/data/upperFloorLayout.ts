/**
 * Hook for Hriday's real upper-floor plan (rooms, spots, furniture).
 * S3-A uses the placeholder deck in houseFloors.ts only. When the upper layout
 * lands, export a HouseLayout-shaped slice here and wire it in houseFloors.ts.
 */
import type { HouseLayout } from './houseLayout';

/** True until an approved upper layout replaces the placeholder deck. */
export const UPPER_FLOOR_LAYOUT_PENDING = true;

/**
 * Future: full upper-floor layout (rooms, walls, spots, furniture).
 * Null while pending.
 */
export const upperFloorLayout: HouseLayout | null = null;