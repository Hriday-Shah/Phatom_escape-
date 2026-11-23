import Phaser from 'phaser';
import { Player } from '../objects/Player';
import { HidingSpotManager } from '../objects/HidingSpotManager';
import { houseLayout } from '../data/houseLayout';
import { SafeAreaManager } from '../utils/SafeAreaManager';

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
    // Close-up camera: show about 250-300 world units on the short side
    // This gives a view of roughly one room around the player
    const width = this.scale.width;
    const height = this.scale.height;
    const minDimension = Math.min(width, height);
    
    // Target showing 280px of world at minimum dimension (close-up view)
    const targetZoom = minDimension / 280;
    // Clamp to reasonable bounds, allowing higher zoom on larger screens
    const zoom = Math.max(1.2, Math.min(3.0, targetZoom));
    
    this.cameras.main.setZoom(zoom);
    
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

    houseLayout.walls.forEach(wall => {
      const wallSprite = this.add.rectangle(
        wall.x + wall.width / 2,
        wall.y + wall.height / 2,
        wall.width,
        wall.height,
        0x3A3A3A
      ).setStrokeStyle(1, 0x2A2A2A);
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
      
      const doorSprite = this.add.rectangle(
        door.x + door.width / 2,
        door.y + door.height / 2,
        door.width,
        door.height,
        0x8B4513
      ).setStrokeStyle(2, 0x654321);

      // Add lock indicator
      if (isLocked) {
        this.add.circle(
          door.x + door.width * 0.75,
          door.y + door.height / 2,
          3,
          0xFFD700
        ).setDepth(1);
      }

      // Store modified door data
      const doorData = { ...door, locked: isLocked };
      this.doorGroup.add(doorSprite);
      (doorSprite as any).doorData = doorData;
    });
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
