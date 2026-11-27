/**
 * Drawer noise on a Phantom phone. Procedural circle, no art file. Size follows the
 * host's quiet / normal / loud setting. Players never receive the event.
 */
import Phaser from 'phaser';
import { rippleFor } from '../logic/roundPhase';
import type { NoisePayload } from '../net/protocol';

export function spawnNoiseRipple(scene: Phaser.Scene, noise: NoisePayload): void {
  const spec = rippleFor(noise.level);
  const g = scene.add.graphics().setDepth(100);
  const start = performance.now();
  const tick = (): void => {
    const t = (performance.now() - start) / spec.ms;
    if (t >= 1) {
      scene.events.off(Phaser.Scenes.Events.POST_UPDATE, tick);
      g.destroy();
      return;
    }
    g.clear();
    g.lineStyle(4, 0xfff2c4, spec.alpha * (1 - t));
    g.strokeCircle(noise.x, noise.y, spec.radius * (0.2 + 0.8 * t));
  };
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, tick);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, tick);
    g.destroy();
  });
}
