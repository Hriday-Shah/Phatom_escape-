/**
 * Runs Phaser's REAL Arcade physics (World / Body / StaticBody / Collider source) in node
 * with minimal stand-ins for the game objects, so the containment test exercises the same
 * circle-vs-rect separation the game uses.
 */
import { createRequire } from 'module';
import type { Rect } from '../data/colliders';
import { houseLayout } from '../data/houseLayout';
import { PLAYER_BODY_OFFSET_FRAME, PLAYER_BODY_RADIUS_FRAME, PLAYER_FRAME_SIZE, PLAYER_SPRITE_SCALE } from '../config/playerConfig';
import { ARCADE_FPS, PLAYER_SPEED } from '../config/physicsConfig';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const World: any = require('phaser/src/physics/arcade/World.js');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function noop() { /* stand-in */ }

function fakeScene(): Any {
  const events = { on: noop, once: noop, off: noop, emit: noop };
  return {
    sys: {
      events,
      scale: { width: houseLayout.width, height: houseLayout.height },
      game: { config: {} },
      add: { graphics: () => ({ clear: noop, setDepth: noop }) },
    },
  };
}

function staticObject(r: Rect): Any {
  return {
    x: r.x, y: r.y, originX: 0, originY: 0, scaleX: 1, scaleY: 1, angle: 0,
    displayOriginX: 0, displayOriginY: 0,
    width: r.width, height: r.height, displayWidth: r.width, displayHeight: r.height,
    hasTransformComponent: true, active: true, body: null,
    getTopLeft(out: Any) { out.x = this.x; out.y = this.y; return out; },
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this; },
  };
}

function playerObject(x: number, y: number): Any {
  const half = PLAYER_FRAME_SIZE / 2;
  return {
    x, y, originX: 0.5, originY: 0.5, scaleX: PLAYER_SPRITE_SCALE, scaleY: PLAYER_SPRITE_SCALE, angle: 0,
    displayOriginX: half, displayOriginY: half,
    width: PLAYER_FRAME_SIZE, height: PLAYER_FRAME_SIZE,
    displayWidth: PLAYER_FRAME_SIZE * PLAYER_SPRITE_SCALE, displayHeight: PLAYER_FRAME_SIZE * PLAYER_SPRITE_SCALE,
    frame: { realWidth: PLAYER_FRAME_SIZE, realHeight: PLAYER_FRAME_SIZE },
    hasTransformComponent: true, active: true, body: null,
    setPosition(nx: number, ny: number) { this.x = nx; this.y = ny; return this; },
    getTopLeft(out: Any) { out.x = this.x - half * this.scaleX; out.y = this.y - half * this.scaleY; return out; },
  };
}

export class ArcadeSim {
  private world: Any;
  private player: Any;
  private body: Any;
  private t = 0;
  private readonly dtMs = 1000 / ARCADE_FPS;

  constructor(statics: Rect[], overlapBias: number, spawn: { x: number; y: number }) {
    this.world = new World(fakeScene(), {
      gravity: { x: 0, y: 0 }, overlapBias, fps: ARCADE_FPS, debug: false,
      width: houseLayout.width, height: houseLayout.height,
    });
    const objs = statics.map(staticObject);
    objs.forEach((o) => this.world.enableBody(o, 1 /* STATIC_BODY */));
    this.player = playerObject(spawn.x, spawn.y);
    this.world.enableBody(this.player, 0 /* DYNAMIC_BODY */);
    this.body = this.player.body;
    this.body.setCircle(PLAYER_BODY_RADIUS_FRAME, PLAYER_BODY_OFFSET_FRAME, PLAYER_BODY_OFFSET_FRAME);
    this.body.setCollideWorldBounds(true);
    this.world.addCollider(this.player, objs);
  }

  /** Teleport (like the player being at an exact previously reached position). */
  place(x: number, y: number): void {
    this.player.x = x;
    this.player.y = y;
    this.body.reset(x, y);
  }

  /** One rendered frame with input direction (dx, dy) held, as GameScene + Player do. */
  frame(dx: number, dy: number): void {
    const len = Math.hypot(dx, dy);
    if (len > 0) this.body.setVelocity((dx / len) * PLAYER_SPEED, (dy / len) * PLAYER_SPEED);
    else this.body.setVelocity(0, 0);
    this.t += this.dtMs;
    this.world.update(this.t, this.dtMs);
    this.world.postUpdate();
  }

  get x(): number { return this.player.x; }
  get y(): number { return this.player.y; }
  get bodyWidth(): number { return this.body.width; }
}
