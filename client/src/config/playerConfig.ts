/**
 * Player body constants, shared by Player.ts and the node-side reachability test.
 * Kept free of Phaser imports so tests can import it without a browser.
 */

/** Player sprite frames are 16x16 art px. */
export const PLAYER_FRAME_SIZE = 16;
/** Player sprites are drawn at 2x (1 art px = 2 world units). */
export const PLAYER_SPRITE_SCALE = 2;
/**
 * Arcade body radius in UNSCALED frame pixels (what Body.setCircle expects).
 * 8 frame px x 2 scale = a 16 world-unit radius, i.e. a 32 px wide body.
 */
export const PLAYER_BODY_RADIUS_FRAME = 8;
/** Offset (frame px) that centres the circle on the 16x16 frame. */
export const PLAYER_BODY_OFFSET_FRAME = PLAYER_FRAME_SIZE / 2 - PLAYER_BODY_RADIUS_FRAME;
/** Effective collision radius in world units. */
export const PLAYER_BODY_RADIUS = PLAYER_BODY_RADIUS_FRAME * PLAYER_SPRITE_SCALE;
