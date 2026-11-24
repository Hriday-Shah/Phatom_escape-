import Phaser from 'phaser';
import { VirtualJoystick } from '../objects/VirtualJoystick';
import { UIControls } from '../objects/UIControls';
import { SafeAreaManager } from '../utils/SafeAreaManager';
import { cssSize, gameDpr } from '../config/display';
import { applyCssCamera, currentShellLayout } from '../ui/currentLayout';
import { ShellLayout } from '../ui/shellLayout';

/**
 * HUD scene, above the game and its darkness: the console's buttons and joystick knob
 * (ShellScene draws the static body under the game) and, inside the game screen, the
 * prompt, the door message and the item slot. Laid out in CSS px from ui/shellLayout.ts;
 * the camera zooms by the render DPR and text renders at the same DPR so it stays crisp.
 */
export class UIScene extends Phaser.Scene {
  private joystick!: VirtualJoystick;
  private uiControls!: UIControls;
  private hidingSpotPrompt!: Phaser.GameObjects.Text;
  private doorMessageText!: Phaser.GameObjects.Text;
  private promptTimer: Phaser.Time.TimerEvent | null = null;
  private doorTimer: Phaser.Time.TimerEvent | null = null;

  private layout!: ShellLayout;

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
      fontSize: '18px',
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

  private applyCamera(): void {
    applyCssCamera(this);
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
    this.stackDoorMessage();

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
    this.stackDoorMessage();
  }

  /** Bottom edge of the visible prompt in CSS px FROM THE GAME SCREEN'S TOP, or 0 when hidden. */
  public getPromptBottom(): number {
    if (!this.hidingSpotPrompt.visible) return 0;
    return this.hidingSpotPrompt.y + this.hidingSpotPrompt.height - this.layout.screen.y;
  }

  /** Current shell layout (CSS px), for GameScene and tests. */
  public getLayout(): ShellLayout {
    return this.layout;
  }

  public showDoorMessage(text: string, duration?: number): void {
    this.doorTimer?.remove(false);
    this.doorTimer = null;
    this.doorMessageText.setText(text).setVisible(true);
    this.stackDoorMessage();

    if (duration) {
      this.doorTimer = this.time.delayedCall(duration, () => {
        this.doorTimer = null;
        this.doorMessageText.setVisible(false);
      });
    }
  }

  /**
   * Door message slot: just below the prompt (using its CURRENT height, multi-line safe)
   * while the prompt is visible, else the top slot where the prompt would be (QA R4-4).
   */
  private stackDoorMessage(): void {
    const p = this.hidingSpotPrompt, d = this.doorMessageText;
    // Centred, but with the left edge on a whole CSS px so the text stays crisp.
    const snap = (t: Phaser.GameObjects.Text) => t.setX(Math.round(this.promptCenterX - t.width / 2) + t.width / 2);
    snap(p);
    snap(d);
    d.setY(p.visible ? p.y + p.height + 8 : p.y);
  }

  private promptCenterX = 0;

  private onResize(): void {
    this.applyCamera();
    this.layout = currentShellLayout(this);
    const scr = this.layout.screen;
    const dpr = gameDpr(this);
    const { width, height } = cssSize(this);

    // Prompt + door message: centred at the top of the game screen, clear of the item slot.
    this.uiControls.resize(this.layout);
    this.joystick.resize(this.layout);
    const slot = this.uiControls.getItemSlotBounds();
    const pad = 2 * this.layout.s;
    const reserve = scr.x + scr.w - slot.x + pad; // item slot width + margins, mirrored
    const usable = scr.w - reserve * 2;
    const narrow = usable < 160;
    const fontPx = Math.min(width, height) >= 600 ? 24 : 18;
    for (const t of [this.hidingSpotPrompt, this.doorMessageText]) {
      t.setFontSize(`${fontPx}px`);
      t.setResolution(dpr);
      // Too narrow beside the slot (small portrait screens): wrap under it instead.
      t.setWordWrapWidth(Math.max(120, narrow ? scr.w - pad * 4 : usable), true);
    }
    const top = narrow ? slot.y + slot.height + pad : scr.y + pad * 2;
    this.promptCenterX = Math.round(scr.x + scr.w / 2);
    this.hidingSpotPrompt.setPosition(this.promptCenterX, Math.round(top));
    this.stackDoorMessage();
  }
}
