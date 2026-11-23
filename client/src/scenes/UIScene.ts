import Phaser from 'phaser';
import { VirtualJoystick } from '../objects/VirtualJoystick';
import { UIControls } from '../objects/UIControls';
import { SafeAreaManager } from '../utils/SafeAreaManager';

export class UIScene extends Phaser.Scene {
  private joystick!: VirtualJoystick;
  private uiControls!: UIControls;
  private hidingSpotPrompt!: Phaser.GameObjects.Text;
  private doorMessageText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'UIScene' });
  }

  create(): void {
    // Create HUD elements at zoom 1 in this scene
    this.joystick = new VirtualJoystick(this);
    this.uiControls = new UIControls(this);

    // Hiding spot prompt
    this.hidingSpotPrompt = this.add.text(
      this.scale.width / 2,
      this.scale.height - 100,
      '',
      {
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: '#000000aa',
        padding: { x: 12, y: 8 },
      }
    )
      .setOrigin(0.5)
      .setDepth(999)
      .setVisible(false);

    // Door message
    this.doorMessageText = this.add.text(
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
      .setDepth(999)
      .setVisible(false);

    // Handle screen resize
    this.scale.on('resize', this.onResize, this);
    this.onResize();
    
    // Reposition on safe area changes
    SafeAreaManager.onInsetsChange(() => this.onResize());

    // Listen for interact button press and forward to GameScene
    this.events.on('interact', () => {
      this.scene.get('GameScene').events.emit('interact');
    });
  }

  update(): void {
    this.joystick.update();
  }

  public getJoystickDirection(): Phaser.Math.Vector2 {
    return this.joystick.getDirection();
  }

  public showHidingSpotPrompt(text: string, duration?: number): void {
    this.hidingSpotPrompt.setText(text).setVisible(true);
    
    if (duration) {
      this.time.delayedCall(duration, () => {
        this.hideHidingSpotPrompt();
      });
    }
  }

  public hideHidingSpotPrompt(): void {
    this.hidingSpotPrompt.setVisible(false);
  }

  public showDoorMessage(text: string, duration?: number): void {
    this.doorMessageText.setText(text).setVisible(true);
    
    if (duration) {
      this.time.delayedCall(duration, () => {
        this.doorMessageText.setVisible(false);
      });
    }
  }

  private onResize(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    // Position prompts in the top half to avoid controls
    // Hiding spot prompt - centered in top 60% of screen
    this.hidingSpotPrompt.setPosition(width / 2, height * 0.4);
    
    // Door message - slightly higher
    this.doorMessageText.setPosition(width / 2, height * 0.35);

    // Update UI controls and joystick
    this.uiControls.resize();
    this.joystick.resize();
  }
}
