import Phaser from 'phaser';
import { Player } from '../objects/Player';
import { VirtualJoystick } from '../objects/VirtualJoystick';
import { UIControls } from '../objects/UIControls';
import { HidingSpotManager } from '../objects/HidingSpotManager';
import { houseLayout } from '../data/houseLayout';

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private joystick!: VirtualJoystick;
  private uiControls!: UIControls;
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
  private messageText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    // Set world bounds
    this.physics.world.setBounds(0, 0, houseLayout.width, houseLayout.height);

    // Create the house
    this.createRooms();
    this.createWalls();
    this.createDoors();
    this.createFurniture();

    // Create player at entrance
    this.player = new Player(this, 300, 430);

    // Setup collisions
    this.physics.add.collider(this.player, this.wallGroup);
    this.physics.add.collider(this.player, this.doorGroup);

    // Setup camera
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setZoom(1.5);
    this.cameras.main.setBounds(0, 0, houseLayout.width, houseLayout.height);

    // Create hiding spot manager
    this.hidingSpotManager = new HidingSpotManager(this, houseLayout.hidingSpots);

    // Setup controls
    this.setupControls();

    // Create UI
    this.joystick = new VirtualJoystick(this);
    this.uiControls = new UIControls(this);

    // Door interaction message
    this.messageText = this.add.text(
      this.scale.width / 2,
      this.scale.height - 150,
      '',
      {
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: '#000000aa',
        padding: { x: 12, y: 8 },
      }
    )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(999)
      .setVisible(false);

    // Handle screen resize
    this.scale.on('resize', this.onResize, this);

    // Handle interact event
    this.events.on('interact', this.onInteract, this);
  }

  private createRooms(): void {
    houseLayout.rooms.forEach(room => {
      this.add.rectangle(
        room.x + room.width / 2,
        room.y + room.height / 2,
        room.width,
        room.height,
        room.floorColor
      ).setDepth(-2);
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

      this.wallGroup.add(wallSprite);
    });
  }

  private createDoors(): void {
    this.doorGroup = this.physics.add.staticGroup();

    houseLayout.doors.forEach(door => {
      const doorSprite = this.add.rectangle(
        door.x + door.width / 2,
        door.y + door.height / 2,
        door.width,
        door.height,
        0x8B4513
      ).setStrokeStyle(2, 0x654321);

      // Add lock indicator
      if (door.locked) {
        this.add.circle(
          door.x + door.width * 0.75,
          door.y + door.height / 2,
          3,
          0xFFD700
        ).setDepth(1);
      }

      this.doorGroup.add(doorSprite);
      (doorSprite as any).doorData = door;
    });
  }

  private createFurniture(): void {
    houseLayout.furniture.forEach(furniture => {
      if (furniture.blocking) {
        const furnitureSprite = this.add.rectangle(
          furniture.x + furniture.width / 2,
          furniture.y + furniture.height / 2,
          furniture.width,
          furniture.height,
          0x795548
        ).setStrokeStyle(2, 0x5D4037);

        this.wallGroup.add(furnitureSprite);
      }
    });
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
      this.showMessage(nearbyDoor.message || 'Locked', 2000);
      return;
    }

    // Check for hiding spot interaction
    this.hidingSpotManager.interact();
  }

  private checkNearbyDoor(): any {
    const playerPos = this.player.getPosition();
    const checkRadius = 50;

    for (const door of houseLayout.doors) {
      const doorCenter = new Phaser.Math.Vector2(
        door.x + door.width / 2,
        door.y + door.height / 2
      );
      
      if (playerPos.distance(doorCenter) < checkRadius) {
        return door;
      }
    }

    return null;
  }

  private showMessage(text: string, duration?: number): void {
    this.messageText.setText(text).setVisible(true);
    
    if (duration) {
      this.time.delayedCall(duration, () => {
        this.messageText.setVisible(false);
      });
    }
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

    // Get joystick input (overrides keyboard if active)
    const joystickDir = this.joystick.getDirection();
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

    // Update joystick
    this.joystick.update();
  }

  private onResize(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    this.messageText.setPosition(width / 2, height - 150);
    this.uiControls.resize();
    this.hidingSpotManager.resize();
  }
}
