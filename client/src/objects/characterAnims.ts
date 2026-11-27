/**
 * Walk-cycle animations for the player and Phantom sheets (same 4×4 layout).
 */
import Phaser from 'phaser';

const DIRS = ['down', 'left', 'right', 'up'] as const;
/** Phantom frames are 24×24 art px (player frames are 16×16). */
export const PHANTOM_FRAME_SIZE = 24;

export function ensureCharacterAnims(scene: Phaser.Scene): void {
  if (scene.textures.exists('player') && !scene.anims.exists('walk_down')) {
    DIRS.forEach((dir, row) => {
      scene.anims.create({
        key: `walk_${dir}`,
        frames: scene.anims.generateFrameNumbers('player', { start: row * 4, end: row * 4 + 3 }),
        frameRate: 8,
        repeat: -1,
      });
      if (scene.textures.exists('player_tint')) {
        scene.anims.create({
          key: `walk_${dir}_tint`,
          frames: scene.anims.generateFrameNumbers('player_tint', { start: row * 4, end: row * 4 + 3 }),
          frameRate: 8,
          repeat: -1,
        });
      }
    });
  }
  if (scene.textures.exists('phantom') && !scene.anims.exists('phantom_walk_down')) {
    DIRS.forEach((dir, row) => {
      scene.anims.create({
        key: `phantom_walk_${dir}`,
        frames: scene.anims.generateFrameNumbers('phantom', { start: row * 4, end: row * 4 + 3 }),
        frameRate: 8,
        repeat: -1,
      });
    });
  }
}
