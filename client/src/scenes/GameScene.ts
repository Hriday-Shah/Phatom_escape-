import Phaser from 'phaser';
import { Player } from '../objects/Player';
import { hoodieTint } from '../lobby/lobby';
import { HidingSpotManager } from '../objects/HidingSpotManager';
import { NetSync } from '../net/NetSync';
import type { GameLink } from '../net/ColyseusLobbyService';
import { Furniture, houseLayout } from '../data/houseLayout';
import { createComposedWalls } from '../utils/wallRenderer';
import { wallBodyRects, isDoorLocked } from '../data/colliders';
import { LIGHT_OCCLUDERS, LightLayer } from '../objects/LightLayer';
import { PLAYER_BODY_RADIUS } from '../objects/Player';
import { gameDpr } from '../config/display';
import { hasDebugFlag } from '../config/debugFlags';
import { currentShellLayout, watchInsets } from '../ui/currentLayout';
import { snappedCameraZoom } from '../logic/cameraZoom';
import { onlineStartPoint } from '../logic/onlineSpawn';
import { ItemDirector } from '../items/ItemDirector';
import { FloorView } from '../objects/FloorView';
import { composeWindowRects, FLOOR_GROUND, worldPixelBounds } from '../data/houseFloors';
import type { FloorId } from '../data/houseFloors';

export { snappedCameraZoom };

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private hidingSpotManager!: HidingSpotManager;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  private interactKey!: Phaser.Input.Keyboard.Key;
  private searchKey!: Phaser.Input.Keyboard.Key;
  private dropKey!: Phaser.Input.Keyboard.Key;
  private wallGroup!: Phaser.Physics.Arcade.StaticGroup;
  private doorGroup!: Phaser.Physics.Arcade.StaticGroup;
  private uiScene!: Phaser.Scene;
  private lightLayer: LightLayer | null = null;
  /** Online only (QA reads netSync.remotePositions()). */
  public netSync: NetSync | null = null;
  /** Items, Game Controller mini-game and paper-code reveal. */
  public items: ItemDirector | null = null;
  private floorView!: FloorView;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    const wb = worldPixelBounds();
    this.physics.world.setBounds(wb.x, wb.y, wb.width, wb.height);
    this.floorView = new FloorView(this);

    // Add background (dark floor covering entire world)
    // Extend beyond house bounds to prevent black strips in portrait
    const bgSize = Math.max(houseLayout.width, houseLayout.height) * 2;
    this.add.rectangle(
      houseLayout.width / 2,
      houseLayout.height / 2,
      bgSize,
      bgSize,
      0x1a1a1a
    ).setDepth(-10);

    // Create the house
    this.createRooms();
    this.createWalls();
    this.createDoors();
    this.createFurniture();

    // Create player at spawn point (supports ?spawn=kitchen for dev/screenshots)
    const spawnPoint = this.onlineSpawn(this.getSpawnPoint());
    // Hoodie colour from the lobby (registry 'colour'); no lobby -> the default cyan.
    this.player = new Player(this, spawnPoint.x, spawnPoint.y, hoodieTint(this.registry.get('colour')));
    this.player.onFloorChanged((f) => this.applyHouseFloor(f));

    // Runtime guard for QA N1: the body must be a 32px circle centred on the sprite.
    const expected = PLAYER_BODY_RADIUS * 2;
    if (Math.abs(this.player.getBodyDiameter() - expected) > 0.01) {
      throw new Error(`Player body is ${this.player.getBodyDiameter()}px wide, expected ${expected}px`);
    }

    // Setup collisions
    this.physics.add.collider(this.player.getBody(), this.wallGroup);
    this.physics.add.collider(this.player.getBody(), this.doorGroup);

    // Setup camera with dynamic zoom based on screen size
    this.updateCameraZoom();
    this.cameras.main.setBounds(0, 0, houseLayout.width, houseLayout.height);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.centerOn(this.player.x, this.player.y);

    // Create hiding spot manager
    this.hidingSpotManager = new HidingSpotManager(this, houseLayout.hidingSpots);
    this.hidingSpotManager.setWallGroup(this.wallGroup);
    this.applyHouseFloor(this.player.getFloor());
    this.mountGroundFloorArt();
    this.floorView.drawLivingStairs();

    // Limited vision (before NetSync so a reconnect pose on the upper floor does not leave
    // the light visible — applyHouseFloor toggles the layer when it already exists).
    if (!hasDebugFlag('nolight') && LightLayer.available(this)) this.createLight();

    // Targeting after Arcade has synced the sprite to this frame's body position (POST_UPDATE),
    // so the highlight never lags a frame behind the player (QA R7-1 at low frame rates).
    const target = () => {
      this.hidingSpotManager.update(this.player.getPosition(), this.player.getFacing());
      const override = this.items?.promptOverride();
      if (override) (this.uiScene as any)?.showHidingSpotPrompt?.(override);
      else if (!this.hidingSpotManager.highlighted()) {
        (this.uiScene as any)?.hideHidingSpotPrompt?.();
      }
      this.items?.updateFx();
    };
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, target);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.POST_UPDATE, target);
      this.items?.destroy();
      this.items = null;
    });
    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      this.items?.destroy();
      this.items = null;
    });

    // Online room: other players + spot sync. Offline (no 'net') is unchanged.
    const net = this.registry.get('net') as GameLink | null | undefined;
    if (net) this.netSync = new NetSync(this, net, this.player, this.hidingSpotManager);

    // Setup controls
    this.setupControls();

    // Console body under the game (ShellScene renders first), HUD above it (UIScene).
    this.scene.launch('ShellScene');
    this.scene.launch('UIScene');
    this.uiScene = this.scene.get('UIScene');

    // Handle screen resize
    this.scale.on('resize', this.onResize, this);

    // Handle interact (USE) and drop
    this.events.on('interact', this.onInteract, this);
    this.events.on('drop', this.onDrop, this);

    // Items / mini-game (after UIScene exists so the slot and overlay can be placed).
    this.items = new ItemDirector(this as any);
    this.time.delayedCall(0, () => { this.items?.attach(net ?? null); this.items?.place(); });

    // Reconcile floor-dependent layers (light, spots) after online snap poses.
    this.applyHouseFloor(this.player.getFloor());

    // Reposition on safe area changes
    watchInsets(this, () => this.onResize());
  }

  /**
   * Light radius in world px: half the fx_light_mask worldSize (416 -> 208), which is 6.5 tiles
   * (tile = manifest tileSize 16 art px x artPxPerWorldUnits 2 = 32 world px).
   */
  static lightRadius(manifest: any): number {
    const mask = manifest?.assets?.find((a: any) => a.key === LightLayer.MASK_KEY);
    if (mask?.worldSize) return mask.worldSize[0] / 2;
    return 6.5 * (manifest?.tileSize ?? 16) * (manifest?.artPxPerWorldUnits ?? 2);
  }

  private createLight(): void {
    const debugUnlock = hasDebugFlag('unlock');
    const wallsAndDoors = [
      ...houseLayout.walls,
      ...houseLayout.doors.filter((d) => isDoorLocked(d.id, d.locked, debugUnlock)),
    ];
    const furniture = LIGHT_OCCLUDERS === 'furniture' ? [
      ...houseLayout.hidingSpots,
      ...houseLayout.furniture.filter((f) => f.blocking),
    ] : [];
    this.lightLayer = new LightLayer(
      this, GameScene.lightRadius(this.cache.json.get('artManifest')), wallsAndDoors, furniture,
    );
    // After Arcade has synced the body to the sprite (POST_UPDATE), so the light never lags.
    const sync = () => this.lightLayer?.update(this.player.x, this.player.y);
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, sync);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.POST_UPDATE, sync);
      this.lightLayer?.destroy();
      this.lightLayer = null;
    });
    this.lightLayer.update(this.player.x, this.player.y, true);
  }

  /** Ground-floor art lives in the floor container; upper placeholder in its own container. */
  private mountGroundFloorArt(): void {
    const host = this.floorView.host();
    for (const child of [...this.children.list]) {
      if (!(child instanceof Phaser.GameObjects.GameObject)) continue;
      if (child === host || child === this.floorView.upper || child === this.floorView.stairsLayer) continue;
      if ((child as { depth?: number }).depth != null && (child as { depth: number }).depth >= 9) continue;
      if ((child as { depth?: number }).depth != null && (child as { depth: number }).depth <= -10) continue;
      host.add(child);
    }
  }

  private applyHouseFloor(floor: FloorId): void {
    this.floorView.showFloor(floor);
    const b = this.floorView.cameraBounds(floor);
    this.physics.world.setBounds(b.x, b.y, b.width, b.height);
    this.cameras.main.setBounds(b.x, b.y, b.width, b.height);
    this.hidingSpotManager.setActiveFloor(floor);
    if (this.lightLayer) this.lightLayer.setVisible(floor === FLOOR_GROUND);
  }

  private updateCameraZoom(): void {
    // The game display is the console's screen rect (ui/shellLayout.ts): the camera viewport,
    // in DEVICE px (CSS x render DPR), rounded to whole device px.
    const dpr = gameDpr(this);
    const scr = currentShellLayout(this).screen;
    const cam = this.cameras.main;
    cam.setViewport(Math.round(scr.x * dpr), Math.round(scr.y * dpr), Math.round(scr.w * dpr), Math.round(scr.h * dpr));
    // Close-up camera: about 280 world units on the screen's short side (roughly one room),
    // snapped so every art pixel covers the same whole number of device pixels.
    cam.setZoom(snappedCameraZoom(Math.min(cam.width, cam.height)));

    // Recenter on player if it exists
    if (this.player) {
      cam.centerOn(this.player.x, this.player.y);
    }
  }

  private createRooms(): void {
    houseLayout.rooms.forEach(room => {
      // Map room IDs to floor texture keys (floor_<room.id>)
      const floorKey = `floor_${room.id}`;
      
      if (this.textures.exists(floorKey)) {
        // Use tiled floor art (16x16 art px tiles)
        // Create at half size and scale 2x, OR full size with tileScale 2x
        this.add.tileSprite(room.x, room.y, room.width, room.height, floorKey)
          .setOrigin(0, 0)
          .setTileScale(2, 2) // Scale the tiles themselves, not the sprite
          .setDepth(-2);
      } else {
        // Fallback to colored rectangle
        this.add.rectangle(
          room.x + room.width / 2,
          room.y + room.height / 2,
          room.width,
          room.height,
          room.floorColor
        ).setDepth(-2);
      }
    });
  }

  private createWalls(): void {
    this.wallGroup = this.physics.add.staticGroup();

    // Visuals: one texture composed from the approved wall/window tiles (falls back to grey).
    const composed = createComposedWalls(
      this,
      houseLayout.width,
      houseLayout.height,
      houseLayout.walls,
      composeWindowRects(houseLayout.windows),
    );

    // Physics + line of sight: invisible bodies per layout wall rect. Exterior sides (whole or
    // partial) are grown outward (data/colliders.ts) so a body cannot be pushed outside;
    // the visible wall art still uses the layout rects.
    houseLayout.walls.forEach(layoutWall => {
      if (!composed) {
        // Grey fallback art: draw the layout rect (no body; the bodies below are invisible).
        this.add.rectangle(
          layoutWall.x + layoutWall.width / 2,
          layoutWall.y + layoutWall.height / 2,
          layoutWall.width,
          layoutWall.height,
          0x3A3A3A
        ).setDepth(-1).setStrokeStyle(1, 0x2A2A2A);
      }
      for (const wall of wallBodyRects(layoutWall)) {
        const wallSprite = this.add.rectangle(
          wall.x + wall.width / 2,
          wall.y + wall.height / 2,
          wall.width,
          wall.height,
          0x3A3A3A
        ).setDepth(-1).setVisible(false);
        wallSprite.setData('blocksSight', true); // real walls only; furniture/spot bodies don't block line of sight
        this.wallGroup.add(wallSprite);
      }
    });
  }

  private createDoors(): void {
    this.doorGroup = this.physics.add.staticGroup();

    // Check for debug unlock flag
    const debugUnlock = hasDebugFlag('unlock');

    houseLayout.doors.forEach(door => {
      // Apply debug unlock only to bedroom_door
      const isLocked = door.locked && !(debugUnlock && door.id === 'bedroom_door');
      // Map door IDs to art keys
      let textureKey = 'door'; // Default
      
      if (door.id === 'bedroom_door') {
        textureKey = isLocked ? 'door_locked' : (this.textures.exists('door_open') ? 'door_open' : 'door');
      } else if (door.id === 'main_door') {
        textureKey = 'main_door'; // main_door is always locked in stage 1
      }
      
      let doorSprite: Phaser.GameObjects.GameObject;
      
      if (this.textures.exists(textureKey)) {
        // Use art texture at 2x scale
        const image = this.add.image(door.x, door.y, textureKey)
          .setOrigin(0, 0)
          .setScale(2)
          .setDepth(0);
        doorSprite = image;
      } else {
        // Fallback to rectangle
        doorSprite = this.add.rectangle(
          door.x + door.width / 2,
          door.y + door.height / 2,
          door.width,
          door.height,
          0x8B4513
        ).setStrokeStyle(2, 0x654321);
        
        if (isLocked) {
          this.add.circle(
            door.x + door.width * 0.75,
            door.y + door.height / 2,
            3,
            0xFFD700
          ).setDepth(1);
        }
      }

      // Store modified door data. Only locked doors are solid: an unlocked door
      // (e.g. the bedroom door with ?debug=unlock) gets no physics body at all.
      // The art keeps the layout rect; the solid body is invisible and, like exterior walls,
      // grown outward on any side facing outside the house (the main door's bottom).
      // checkNearbyDoor() uses doorData (layout rect), so the message trigger is unchanged.
      const doorData = { ...door, locked: isLocked };
      (doorSprite as any).doorData = doorData;
      if (isLocked) {
        wallBodyRects(door).forEach((r, i) => {
          const body = this.add.rectangle(r.x + r.width / 2, r.y + r.height / 2, r.width, r.height, 0x000000, 0)
            .setVisible(false);
          if (i === 0) (body as any).doorData = doorData;
          this.doorGroup.add(body);
        });
      }
    });

    // The bathroom doorway is an always-open door: draw the approved open door art, no body.
    const bathroomDoor = houseLayout.openings.find(o => o.id === 'bathroom_door');
    if (bathroomDoor && this.textures.exists('door_small_open')) {
      this.add.image(bathroomDoor.x, bathroomDoor.y, 'door_small_open')
        .setOrigin(0, 0)
        .setScale(2)
        .setDepth(0);
    }
  }

  /**
   * Draw a blocking furniture sprite that may be cropped and/or rotated.
   * Collision uses a separate invisible body matching the layout rect, so a
   * cropped texture cannot inflate the physics size.
   */
  private placeFurnitureArt(furniture: Furniture, textureKey: string): void {
    const tex = this.textures.get(textureKey);
    const crop = furniture.artCrop;
    let frame: string | undefined;
    if (crop) {
      frame = `${textureKey}_${furniture.id}`;
      if (!tex.has(frame)) tex.add(frame, 0, crop.x, crop.y, crop.w, crop.h);
    }
    const rot = furniture.rotation ?? 0;
    this.add.image(
      furniture.x + furniture.width / 2,
      furniture.y + furniture.height / 2,
      textureKey,
      frame,
    )
      .setOrigin(0.5, 0.5)
      .setScale(2)
      .setAngle(rot)
      .setDepth(0);
  }

  private createFurniture(): void {
    // Map furniture IDs to texture keys from manifest
    const furnitureTextures: Record<string, string> = {
      'car_table': 'car_table',
      'dining_table': 'dining_table',
      'study_table': 'study_table',
    };
    
    houseLayout.furniture.forEach(furniture => {
      if (furniture.blocking) {
        const textureKey = furniture.texture ?? furnitureTextures[furniture.id];
        const croppedOrRotated = !!(furniture.rotation || furniture.artCrop);

        if (textureKey && this.textures.exists(textureKey) && croppedOrRotated) {
          this.placeFurnitureArt(furniture, textureKey);
          const body = this.add.rectangle(
            furniture.x + furniture.width / 2,
            furniture.y + furniture.height / 2,
            furniture.width,
            furniture.height,
            0x000000,
            0,
          );
          this.wallGroup.add(body);
        } else if (textureKey && this.textures.exists(textureKey)) {
          // Use art texture at 2x scale
          const sprite = this.add.image(furniture.x, furniture.y, textureKey)
            .setOrigin(0, 0)
            .setScale(2)
            .setDepth(0);
          this.wallGroup.add(sprite);
        } else {
          // Fallback to rectangle
          const furnitureSprite = this.add.rectangle(
            furniture.x + furniture.width / 2,
            furniture.y + furniture.height / 2,
            furniture.width,
            furniture.height,
            0x795548
          ).setStrokeStyle(2, 0x5D4037);
          this.wallGroup.add(furnitureSprite);
        }
      }
    });
    
    // Make all hiding spots solid (player interacts from adjacent position)
    houseLayout.hidingSpots.forEach(spot => {
      // Create invisible physics body for collision
      const body = this.add.rectangle(
        spot.x + spot.width / 2,
        spot.y + spot.height / 2,
        spot.width,
        spot.height,
        0x000000,
        0
      );
      this.wallGroup.add(body);
    });
  }

  /**
   * Online: spread players on a walkable grid around the spawn (label-width spacing).
   * Offline, or a dev ?spawn=, uses the spawn as is.
   */
  private onlineSpawn(p: { x: number; y: number }): { x: number; y: number } {
    const net = this.registry.get('net') as GameLink | null | undefined;
    if (!net) return p;
    const i = Math.max(0, net.players().findIndex((q) => q.id === net.selfId));
    const devSpawn = new URLSearchParams(window.location.search).has('spawn');
    return onlineStartPoint(p, i, net.selfPose(), devSpawn);
  }

  private getSpawnPoint(): { x: number; y: number } {
    // Dev-only URL param: ?spawn=kitchen (also works with ?debug=1)
    const isDev = import.meta.env.DEV;
    const params = new URLSearchParams(window.location.search);
    const hasDebug = hasDebugFlag('1');
    const spawnRoom = params.get('spawn');
    
    if ((isDev || hasDebug) && spawnRoom) {
      // Find room center
      const room = houseLayout.rooms.find(r => r.id === spawnRoom);
      if (room) {
        return {
          x: room.x + room.width / 2,
          y: room.y + room.height / 2,
        };
      }
    }
    
    // Default: entrance spawn
    return { x: 300, y: 430 };
  }

  private setupControls(): void {
    // Keyboard controls
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.interactKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.dropKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.searchKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F);
  }

  private onInteract(): void {
    if (this.items?.onUse()) return;
    // Check for door interaction
    const nearbyDoor = this.checkNearbyDoor();
    if (nearbyDoor) {
      (this.uiScene as any).showDoorMessage(nearbyDoor.message || 'Locked', 2000);
      return;
    }

    // Check for hiding spot interaction
    this.hidingSpotManager.interact();
  }

  private onDrop(): void {
    this.items?.onDrop();
  }

  private checkNearbyDoor(): any {
    const playerPos = this.player.getPosition();
    const checkRadius = 50;

    // Check against door sprites in the physics group (which have modified doorData)
    const doorSprites = this.doorGroup.getChildren();
    for (const sprite of doorSprites) {
      const doorData = (sprite as any).doorData;
      if (!doorData || !doorData.locked) continue;
      
      const doorCenter = new Phaser.Math.Vector2(
        doorData.x + doorData.width / 2,
        doorData.y + doorData.height / 2
      );
      
      if (playerPos.distance(doorCenter) < checkRadius) {
        return doorData;
      }
    }

    return null;
  }

  update(_time: number, delta: number): void {
    // While a mini-game is open the stick and USE go to it; the world keeps ticking.
    if (this.items?.open) {
      this.player.setMovement(0, 0);
      this.player.update(delta);
      this.keepSpotClearOfPrompt(delta);
      return;
    }

    // Get keyboard input
    let moveX = 0;
    let moveY = 0;

    if (this.cursors.left.isDown || this.wasd.left.isDown) {
      moveX = -1;
    } else if (this.cursors.right.isDown || this.wasd.right.isDown) {
      moveX = 1;
    }

    if (this.cursors.up.isDown || this.wasd.up.isDown) {
      moveY = -1;
    } else if (this.cursors.down.isDown || this.wasd.down.isDown) {
      moveY = 1;
    }

    // Get joystick input from UIScene (overrides keyboard if active)
    const joystickDir = (this.uiScene as any).getJoystickDirection();
    if (joystickDir.length() > 0) {
      moveX = joystickDir.x;
      moveY = joystickDir.y;
    }

    // Update player movement
    this.player.setMovement(moveX, moveY);
    this.player.update(delta);

    // Hiding spot highlights are updated at POST_UPDATE (see create), from this frame's position.
    this.keepSpotClearOfPrompt(delta);

    // Check interact key
    if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
      this.onInteract();
    }
    // Desktop DROP (R14-10).
    if (Phaser.Input.Keyboard.JustDown(this.dropKey)) {
      this.onDrop();
    }
    if (this.searchKey && Phaser.Input.Keyboard.JustDown(this.searchKey)) {
      this.items?.onSearch();
    }
  }

  /**
   * QA R4-5: on short landscape phones the top prompt can cover the far end of a tall spot
   * (the sofa) when the player stands at its lower half. While a spot is highlighted and its
   * top (with outline) would sit under the prompt, aim the camera a little higher (follow
   * offset, eased by the follow lerp) so the whole spot clears the prompt. Capped so the
   * player stays well inside the screen; back to centred when nothing is highlighted.
   */
  private keepSpotClearOfPrompt(delta = 1000 / 60): void {
    const cam = this.cameras.main;
    const spot = this.hidingSpotManager.getHighlightedBounds();
    const promptBottomCss: number = (this.uiScene as any)?.getPromptBottom?.() ?? 0;
    // Both corrections are rate-limited (QA R5-1): applying them in one go made the camera
    // jump up to a quarter of the screen on the frame the sofa became highlighted.
    const frames = Math.min(4, Math.max(0, delta) / (1000 / 60));
    let lift = 0;
    if (spot && promptBottomCss > 0) {
      const worldPerCss = gameDpr(this) / cam.zoom;
      const viewH = cam.height / cam.zoom;
      const maxLift = viewH * 0.25;
      const clearTop = (promptBottomCss + GameScene.PROMPT_CLEARANCE_CSS) * worldPerCss;
      const camTopCentred = this.player.y - viewH / 2;
      const need = camTopCentred + clearTop - spot.y;
      lift = Phaser.Math.Clamp(need, 0, maxLift);
      // The follow lerp trails the player by up to ~30 world px while walking; ease the
      // camera up out of that lag (never more than CAMERA_STEP per frame) so it can't push
      // the spot under the prompt. Only within the same lift cap.
      if (need > 0 && need <= maxLift) {
        const maxScrollY = Math.floor(spot.y - clearTop + viewH / 2 - cam.height / 2);
        if (cam.scrollY > maxScrollY) {
          cam.setScroll(cam.scrollX, Math.max(maxScrollY, cam.scrollY - GameScene.CAMERA_STEP * frames));
        }
      }
    }
    // Ease the follow offset toward the lift instead of setting it at once.
    const step = GameScene.CAMERA_STEP * frames;
    this.promptLift += Phaser.Math.Clamp(lift - this.promptLift, -step, step);
    if (Math.abs(cam.followOffset.y - this.promptLift) > 0.01) cam.setFollowOffset(0, this.promptLift);
  }

  /** Current (eased) camera lift for the prompt, in world px. */
  private promptLift = 0;

  /** Most a prompt correction may move the camera per 60 Hz frame, in world px. */
  static readonly CAMERA_STEP = 3;

  /** CSS px kept between the prompt's bottom edge and a highlighted spot. */
  static readonly PROMPT_CLEARANCE_CSS = 6;

  private onResize(): void {
    // Update camera zoom for new dimensions
    this.updateCameraZoom();
    if (this.lightLayer) {
      this.lightLayer.createTexture();
      this.lightLayer.update(this.player.x, this.player.y, true);
    }
    
    // Update hiding spot manager (prompt now in UIScene)
    this.hidingSpotManager.resize();
    this.items?.place();
  }

  public getUIScene(): Phaser.Scene {
    return this.uiScene;
  }
}
