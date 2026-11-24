/** World units shown across the short side of the game screen (before snapping). */
export const TARGET_VIEW_WORLD = 280;

/**
 * Camera zoom in DEVICE px per world unit, snapped so that one art px (2 world units)
 * always covers a whole number of device pixels: zoom is a multiple of 0.5.
 */
export function snappedCameraZoom(shortSideDevicePx: number): number {
  const raw = shortSideDevicePx / TARGET_VIEW_WORLD;
  return Math.max(1, Math.round(raw * 2) / 2);
}
