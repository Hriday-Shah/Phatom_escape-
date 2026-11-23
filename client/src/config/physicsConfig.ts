/**
 * Arcade physics constants shared by the game config and the node-side containment test.
 * No Phaser import, so tests can use it without a browser.
 */

/** Player walking speed in world px per second. */
export const PLAYER_SPEED = 200;

/**
 * Arcade OVERLAP_BIAS (default 4). Separation gives up on an overlap deeper than
 * (frame delta + bias); a bigger bias makes it much harder to wedge a body into a wall.
 */
export const ARCADE_OVERLAP_BIAS = 8;

/** Fixed physics step rate (Arcade default). */
export const ARCADE_FPS = 60;

/**
 * Extra thickness added to the OUTSIDE of exterior wall bodies (invisible; the wall art
 * is unchanged). With 10px walls + 24px this is >= the player's 32px diameter.
 */
export const EXTERIOR_WALL_BODY_EXTRA = 24;
