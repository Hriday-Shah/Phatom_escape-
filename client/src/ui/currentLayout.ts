import Phaser from 'phaser';
import { cssSize, gameDpr } from '../config/display';
import { SafeAreaManager } from '../utils/SafeAreaManager';
import { computeShellLayout, ShellLayout } from './shellLayout';

/** The shell layout for the window right now (CSS px), shared by ShellScene, GameScene and UIScene. */
export function currentShellLayout(scene: Phaser.Scene): ShellLayout {
  const { width, height } = cssSize(scene);
  return computeShellLayout(width, height, SafeAreaManager.getInsets(), gameDpr(scene));
}

/** Safe-area changes for a scene, unsubscribed when the scene shuts down or is destroyed. */
export function watchInsets(scene: Phaser.Scene, cb: () => void): void {
  const off = SafeAreaManager.onInsetsChange(cb);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
  scene.events.once(Phaser.Scenes.Events.DESTROY, off);
}

/** Zoom a full-window camera so 1 scene unit = 1 CSS px, origin at the top-left. */
export function applyCssCamera(scene: Phaser.Scene): void {
  const { width, height } = cssSize(scene);
  const cam = scene.cameras.main;
  cam.setViewport(0, 0, scene.scale.width, scene.scale.height);
  cam.setZoom(scene.scale.width / Math.max(1, width));
  cam.centerOn(width / 2, height / 2);
}
