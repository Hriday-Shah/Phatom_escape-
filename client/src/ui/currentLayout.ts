import Phaser from 'phaser';
import { cssSize } from '../config/display';
import { SafeAreaManager } from '../utils/SafeAreaManager';
import { computeShellLayout, ShellLayout } from './shellLayout';

/** The shell layout for the window right now (CSS px), shared by ShellScene, GameScene and UIScene. */
export function currentShellLayout(scene: Phaser.Scene): ShellLayout {
  const { width, height } = cssSize(scene);
  return computeShellLayout(width, height, SafeAreaManager.getInsets());
}

/** Zoom a full-window camera so 1 scene unit = 1 CSS px, origin at the top-left. */
export function applyCssCamera(scene: Phaser.Scene): void {
  const { width, height } = cssSize(scene);
  const cam = scene.cameras.main;
  cam.setViewport(0, 0, scene.scale.width, scene.scale.height);
  cam.setZoom(scene.scale.width / Math.max(1, width));
  cam.centerOn(width / 2, height / 2);
}
