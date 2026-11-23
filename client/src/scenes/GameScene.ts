import Phaser from 'phaser';
import { Player } from '../objects/Player';
import { HidingSpotManager } from '../objects/HidingSpotManager';
import { houseLayout } from '../data/houseLayout';
import { SafeAreaManager } from '../utils/SafeAreaManager';
import { createComposedWalls } from '../utils/wallRenderer';
import { PLAYER_BODY_RADIUS } from '../objects/Player';

/** World units shown across the short side of the screen (before snapping). */
const TARGET_VIEW_WORLD = 280;

/**
 * Camera zoom in DEVICE px per world unit, snapped so that one art px (2 world units)
 * always covers a whole number of device pixels: zoom is a multiple of 0.5.
 */
export function snappedCameraZoom(shortSideDevicePx: number): number {
  const raw = shortSideDevicePx / TARGET_VIEW_WORLD;
  return Math.max(1, Math.round(raw * 2) / 2);
}

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
  private wallGroup!: Phaser.Physics.Arcade.StaticGroup;
  private doorGroup!: Phaser.Physics.Arcade.StaticGroup;
  private uiScene!: Phaser.Scene;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    // Set world bounds
    this.physics.world.setBounds(0, 0, houseLayout.width, houseLayout.height);

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
    const spawnPoint = this.getSpawnPoint();
    this.player = new Player(this, spawnPoint.x, spawnPoint.y);

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

    // Setup controls
    this.setupControls();

    // Start UIScene in parallel
    this.scene.launch('UIScene');
    this.uiScene = this.scene.get('UIScene');

    // Handle screen resize
    this.scale.on('resize', this.onResize, this);

    // Handle interact event
    this.events.on('interact', this.onInteract, this);
    
    // Reposition on safe area changes
    SafeAreaManager.onInsetsChange(() => this.onResize());
  }

  private updateCameraZoom(): void {
    // Close-up camera: about 280 world units on the short side (roughly one room).
    // scale.width/height are DEVICE px (the canvas renders at devicePixelRatio), so the
    // snapped zoom gives every art pixel the same whole number of physical pixels.
    const minDimension = Math.min(this.scale.width, this.scale.height);
    this.cameras.main.setZoom(snappedCameraZoom(minDimension));
    
    // Recenter on player if it exists
    if (this.player) {
      this.cameras.main.centerOn(this.player.x, this.player.y);
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
      houseLayout.windows,
    );

    // Physics + line of sight: one invisible body per layout wall rect.
    houseLayout.walls.forEach(wall => {
      const wallSprite = this.add.rectangle(
        wall.x + wall.width / 2,
        wall.y + wall.height / 2,
        wall.width,
        wall.height,
        0x3A3A3A
      ).setDepth(-1);
      if (composed) {
        wallSprite.setVisible(false);
      } else {
        wallSprite.setStrokeStyle(1, 0x2A2A2A);
      }
      wallSprite.setData('blocksSight', true); // real walls only; furniture/spot bodies don't block line of sight

      this.wallGroup.add(wallSprite);
    });
  }

  private createDoors(): void {
    this.doorGroup = this.physics.add.staticGroup();

    // Check for debug unlock flag
    const params = new URLSearchParams(window.location.search);
    const debugUnlock = params.get('debug') === 'unlock';

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
      const doorData = { ...door, locked: isLocked };
      (doorSprite as any).doorData = doorData;
      if (isLocked) {
        this.doorGroup.add(doorSprite);
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

  private createFurniture(): void {
    // Map furniture IDs to texture keys from manifest
    const furnitureTextures: Record<string, string> = {
      'car_table': 'car_table',
      'dining_table': 'dining_table',
      'study_table': 'study_table',
    };
    
    houseLayout.furniture.forEach(furniture => {
      if (furniture.blocking) {
        const textureKey = furnitureTextures[furniture.id];
        
        if (textureKey && this.textures.exists(textureKey)) {
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

  private getSpawnPoint(): { x: number; y: number } {
    // Dev-only URL param: ?spawn=kitchen (also works with ?debug=1)
    const isDev = import.meta.env.DEV;
    const params = new URLSearchParams(window.location.search);
    const hasDebug = params.get('debug') === '1';
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
  }

  private onInteract(): void {
    // Check for door interaction
    const nearbyDoor = this.checkNearbyDoor();
    if (nearbyDoor) {
      (this.uiScene as any).showDoorMessage(nearbyDoor.message || 'Locked', 2000);
      return;
    }

    // Check for hiding spot interaction
    this.hidingSpotManager.interact();
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

  update(): void {
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
    this.player.update();

    // Update hiding spot highlights
    this.hidingSpotManager.update(this.player.getPosition());

    // Check interact key
    if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
      this.onInteract();
    }
  }

  private onResize(): void {
    // Update camera zoom for new dimensions
    this.updateCameraZoom();
    
    // Update hiding spot manager (prompt now in UIScene)
    this.hidingSpotManager.resize();
  }

  public getUIScene(): Phaser.Scene {
    return this.uiScene;
  }
}
