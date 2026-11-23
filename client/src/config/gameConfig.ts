import Phaser from 'phaser';
import { GameScene } from '../scenes/GameScene';
import { PreloadScene } from '../scenes/PreloadScene';
import { UIScene } from '../scenes/UIScene';
import { currentRenderDpr } from './display';
import { ARCADE_FPS, ARCADE_OVERLAP_BIAS } from './physicsConfig';

// Render at devicePixelRatio (capped): the canvas backing store is CSS size x dpr,
// and ScaleManager zoom 1/dpr shrinks it back to CSS size. Phaser 3.90 ignores
// scale.resolution, so this is how we get crisp text and art on high-DPI screens.
const initialDpr = currentRenderDpr();

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  parent: 'game',
  backgroundColor: '#000000',
  banner: false,
  scale: {
    mode: Phaser.Scale.NONE,
    width: Math.round(window.innerWidth * initialDpr),
    height: Math.round(window.innerHeight * initialDpr),
    zoom: 1 / initialDpr,
    autoCenter: Phaser.Scale.NO_CENTER,
  },
  pixelArt: true,
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
      gravity: { x: 0, y: 0 },
      // Deeper than the default 4 so a body can't be wedged into a wall (QA R3-1);
      // the containment test runs real Arcade with this same value.
      overlapBias: ARCADE_OVERLAP_BIAS,
      fps: ARCADE_FPS,
    },
  },
  scene: [PreloadScene, GameScene, UIScene],
  render: {
    pixelArt: true,
    antialias: false,
    roundPixels: true,
  },
  input: {
    activePointers: 3,
  },
};
