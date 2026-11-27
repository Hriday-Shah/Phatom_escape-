import Phaser from 'phaser';
import { minimapBox, quitButtonBox, snapToDevice } from '../ui/shellLayout';
import { MinimapView } from '../ui/MinimapView';
import type { MinimapFrame } from '../logic/minimap';
import { placeQuitButton } from '../ui/QuitButton';
import { VirtualJoystick } from '../objects/VirtualJoystick';
import { UIControls } from '../objects/UIControls';
import { cssSize, gameDpr } from '../config/display';
import { applyCssCamera, currentShellLayout, watchInsets } from '../ui/currentLayout';
import { ShellLayout } from '../ui/shellLayout';
import { RealDeadline } from '../logic/realTimer';

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
  private phaseText!: Phaser.GameObjects.Text;
  /** Auto-hide deadlines on real time, polled in update() (see realTimer.ts). */
  private promptDeadline = new RealDeadline();
  private doorDeadline = new RealDeadline();

  private layout!: ShellLayout;
  private minimap!: MinimapView;

  constructor() {
    super({ key: 'UIScene' });
  }

  create(): void {
    this.applyCamera();

    // Create HUD elements at zoom 1 (CSS px) in this scene
    this.joystick = new VirtualJoystick(this);
    this.uiControls = new UIControls(this);
    this.minimap = new MinimapView(this);

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

    // Phase name and time left (online). Real time, refreshed by GameScene.
    this.phaseText = this.add.text(0, 0, '', {
      ...textStyle(),
      fontSize: '16px',
      align: 'center',
    }).setOrigin(0.5, 1).setDepth(1000).setVisible(false);

    // Handle screen resize
    this.scale.on('resize', this.onResize, this);
    this.onResize();

    // Reposition on safe area changes
    watchInsets(this, () => this.onResize());

    // Listen for interact (USE) and drop and forward to GameScene
    this.events.on('interact', () => {
      this.scene.get('GameScene').events.emit('interact');
    });
    this.events.on('drop', () => {
      this.scene.get('GameScene').events.emit('drop');
    });
  }

  private applyCamera(): void {
    applyCssCamera(this);
  }

  update(): void {
    this.joystick.update();
    if (this.promptDeadline.due()) this.hideHidingSpotPrompt();
    if (this.doorDeadline.due()) {
      this.doorMessageText.setVisible(false);
      this.stackDoorMessage();
    }
  }

  public getJoystickDirection(): Phaser.Math.Vector2 {
    return this.joystick.getDirection();
  }

  /**
   * Show the hiding-spot prompt. Every call cancels the previous auto-hide deadline, so a
   * stale one from an older message can never blank a newer one.
   */
  public showHidingSpotPrompt(text: string, duration?: number): void {
    this.promptDeadline.clear();
    this.hidingSpotPrompt.setText(text).setVisible(true);
    this.stackDoorMessage();
    if (duration) this.promptDeadline.set(duration);
  }

  public hideHidingSpotPrompt(): void {
    this.promptDeadline.clear();
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

  public setHeldItem(key: string | null): void {
    this.uiControls.setHeldItem(key);
  }

  public getItemSlotBounds(): Phaser.Geom.Rectangle {
    return this.uiControls.getItemSlotBounds();
  }

  /** Fogged floor and teammate bearings. Hidden poses are not passed in. */
  public setMinimap(frame: MinimapFrame): void {
    this.minimap?.setFrame(frame);
  }

  /** Online phase line. Empty hides it. Offline never sets this. */
  public setPhaseLine(text: string): void {
    // GameScene can ask during its own create, before this scene's text exists.
    if (!this.phaseText) return;
    const show = text.length > 0;
    this.phaseText.setText(text).setVisible(show);
    if (show) this.placePhaseLine();
  }

  public showDoorMessage(text: string, duration?: number): void {
    this.doorDeadline.clear();
    this.doorMessageText.setText(text).setVisible(true);
    this.stackDoorMessage();
    if (duration) this.doorDeadline.set(duration);
  }

  /**
   * Door message slot: just below the prompt (using its CURRENT height, multi-line safe)
   * while the prompt is visible, else the top slot where the prompt would be (QA R4-4).
   */
  private stackDoorMessage(): void {
    const p = this.hidingSpotPrompt, d = this.doorMessageText;
    // Centred, but with the left edge on a whole device px so the text stays crisp.
    const dpr = gameDpr(this);
    const snap = (t: Phaser.GameObjects.Text) => t.setX(snapToDevice(this.promptCenterX - t.width / 2, dpr) + t.width / 2);
    snap(p);
    snap(d);
    d.setY(snapToDevice(p.visible ? p.y + p.height + 8 : p.y, dpr));
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
    // Quit / Home (HTML #pe-quit) in the screen's top-left corner, mirroring the item slot.
    placeQuitButton(this.layout);
    const quit = quitButtonBox(this.layout);
    // Item slot / quit button width + margins, mirrored, so the centred prompt clears both.
    const reserve = Math.max(scr.x + scr.w - slot.x, quit.x + quit.w - scr.x) + pad;
    const usable = scr.w - reserve * 2;
    const narrow = usable < 160;
    const fontPx = Math.min(width, height) >= 600 ? 24 : 18;
    for (const t of [this.hidingSpotPrompt, this.doorMessageText, this.phaseText]) {
      t.setFontSize(`${fontPx}px`);
      t.setResolution(dpr);
      // Too narrow beside the slot (small portrait screens): wrap under it instead.
      t.setWordWrapWidth(Math.max(120, narrow ? scr.w - pad * 4 : usable), true);
    }
    const top = narrow ? Math.max(slot.y + slot.height, quit.y + quit.h) + pad : scr.y + pad * 2;
    this.promptCenterX = snapToDevice(scr.x + scr.w / 2, dpr);
    this.hidingSpotPrompt.setPosition(this.promptCenterX, snapToDevice(top, dpr));
    this.stackDoorMessage();
    this.placePhaseLine();
    this.minimap?.layout();
  }

  /** Just above the minimap, so the phase line does not sit on the circle. */
  private placePhaseLine(): void {
    if (!this.phaseText || !this.layout) return;
    const scr = this.layout.screen;
    const dpr = gameDpr(this);
    const map = minimapBox(this.layout);
    this.phaseText.setX(snapToDevice(scr.x + scr.w / 2, dpr));
    this.phaseText.setY(snapToDevice(Math.min(scr.y + scr.h - 8, map.y - 6), dpr));
  }
}
