import Phaser from 'phaser';
import { VirtualJoystick } from '../objects/VirtualJoystick';
import { UIControls } from '../objects/UIControls';
import { SafeAreaManager } from '../utils/SafeAreaManager';
import { cssSize, gameDpr, hudScale } from '../config/display';

/**
 * HUD scene. Everything here is laid out in CSS px (as in ui-layout.md); the camera
 * zooms by the render DPR so the canvas (CSS size x DPR) shows it at the right size,
 * and text renders at the same DPR so it stays crisp.
 */
export class UIScene extends Phaser.Scene {
  private joystick!: VirtualJoystick;
  private uiControls!: UIControls;
  private hidingSpotPrompt!: Phaser.GameObjects.Text;
  private doorMessageText!: Phaser.GameObjects.Text;
  private promptTimer: Phaser.Time.TimerEvent | null = null;
  private doorTimer: Phaser.Time.TimerEvent | null = null;

  private static readonly MARGIN = 16; // CSS px, added to safe-area insets

  constructor() {
    super({ key: 'UIScene' });
  }

  create(): void {
    this.applyCamera();

    // Create HUD elements at zoom 1 (CSS px) in this scene
    this.joystick = new VirtualJoystick(this);
    this.uiControls = new UIControls(this);

    const textStyle = (): Phaser.Types.GameObjects.Text.TextStyle => ({
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      fontSize: `${Math.round(18 * hudScale(this))}px`,
      color: '#ffffff',
      backgroundColor: '#000000aa',
      padding: { x: 12, y: 8 },
      resolution: gameDpr(this),
    });

    // Hiding spot prompt
    this.hidingSpotPrompt = this.add.text(0, 0, '', textStyle())
      .setOrigin(0.5, 0)
      .setDepth(999)
      .setVisible(false);

    // Door message
    this.doorMessageText = this.add.text(0, 0, '', textStyle())
      .setOrigin(0.5, 0)
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

  /** Zoom the HUD camera by the render DPR so 1 scene unit = 1 CSS px, origin at top-left. */
  private applyCamera(): void {
    const { width, height } = cssSize(this);
    const cam = this.cameras.main;
    cam.setSize(this.scale.width, this.scale.height);
    cam.setZoom(gameDpr(this));
    cam.centerOn(width / 2, height / 2);
  }

  update(): void {
    this.joystick.update();
  }

  public getJoystickDirection(): Phaser.Math.Vector2 {
    return this.joystick.getDirection();
  }

  /**
   * Show the hiding-spot prompt. Every call cancels the previous auto-hide timer, so a
   * stale timer from an older message can never blank a newer one.
   */
  public showHidingSpotPrompt(text: string, duration?: number): void {
    this.promptTimer?.remove(false);
    this.promptTimer = null;
    this.hidingSpotPrompt.setText(text).setVisible(true);

    if (duration) {
      this.promptTimer = this.time.delayedCall(duration, () => {
        this.promptTimer = null;
        this.hideHidingSpotPrompt();
      });
    }
  }

  public hideHidingSpotPrompt(): void {
    this.promptTimer?.remove(false);
    this.promptTimer = null;
    this.hidingSpotPrompt.setVisible(false);
  }

  public showDoorMessage(text: string, duration?: number): void {
    this.doorTimer?.remove(false);
    this.doorTimer = null;
    this.doorMessageText.setText(text).setVisible(true);

    if (duration) {
      this.doorTimer = this.time.delayedCall(duration, () => {
        this.doorTimer = null;
        this.doorMessageText.setVisible(false);
      });
    }
  }

  private onResize(): void {
    this.applyCamera();
    const { width, height } = cssSize(this);
    const insets = SafeAreaManager.getInsets();
    const s = hudScale(this);
    const dpr = gameDpr(this);

    // Prompts sit at the top safe edge, centred. The camera keeps the player near the
    // middle of the screen and the house starts 100 world px below the world top, so the
    // prompt never covers the player or the spot (QA N7). In landscape the item slot is
    // in the top-right corner, so keep the prompt clear of it.
    const top = insets.top + UIScene.MARGIN;
    const isPortrait = height > width;
    const slotReserve = isPortrait ? 0 : 60 * s + UIScene.MARGIN * 2 + insets.right;
    const usable = width - insets.left - insets.right - slotReserve * 2;
    const fontSize = `${Math.round(18 * s)}px`;

    for (const t of [this.hidingSpotPrompt, this.doorMessageText]) {
      t.setFontSize(fontSize);
      t.setResolution(dpr);
      t.setWordWrapWidth(Math.max(160, usable), true);
    }

    this.hidingSpotPrompt.setPosition(width / 2, top);
    this.doorMessageText.setPosition(width / 2, top + this.hidingSpotPrompt.height + 8);

    // Update UI controls and joystick
    this.uiControls.resize();
    this.joystick.resize();
  }
}
