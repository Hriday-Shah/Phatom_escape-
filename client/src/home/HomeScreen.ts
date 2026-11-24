/**
 * Placeholder homepage behaviour. The markup is in index.html (#pe-home and its views), the
 * theme in home.css; this file only wires them up, so the visuals can be redesigned freely as
 * long as the element ids stay.
 */
import './home.css';
import {
  NICKNAME_MAX, cleanNickname, cleanRoomCode, loadNickname, loadSoundOn, saveNickname, saveSoundOn,
} from './settings';

export const JOIN_COMING_SOON = 'Joining rooms is coming in stage 2';

export interface HomeCallbacks {
  /** Create room (stage 1: start the single-player house). */
  onCreateRoom(nickname: string): void;
  /** Sound toggled (wired to Phaser's global mute). */
  onSoundChange(on: boolean): void;
}

type View = 'main' | 'howto' | 'story';

export class HomeScreen {
  private root = document.getElementById('pe-home') as HTMLElement;
  private views: Record<View, HTMLElement> = {
    main: this.el('pe-view-main'), howto: this.el('pe-view-howto'), story: this.el('pe-view-story'),
  };
  private nickname = this.el<HTMLInputElement>('pe-nickname');
  private roomCode = this.el<HTMLInputElement>('pe-room-code');
  private joinMessage = this.el('pe-join-message');
  private soundBtn = this.el<HTMLButtonElement>('pe-sound-toggle');
  private soundOn = loadSoundOn();
  private lastOpener: HTMLElement | null = null;

  constructor(private cb: HomeCallbacks) {
    this.nickname.maxLength = NICKNAME_MAX;
    this.nickname.value = loadNickname();

    this.nickname.addEventListener('input', () => saveNickname(this.nickname.value));
    this.nickname.addEventListener('change', () => { this.nickname.value = cleanNickname(this.nickname.value); saveNickname(this.nickname.value); });
    this.nickname.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.nickname.blur(); }); // "done" on mobile

    // Letters / digits only, upper-cased, capped at ROOM_CODE_MAX (no maxlength: a typed '-' would eat a slot).
    this.roomCode.addEventListener('input', () => { this.roomCode.value = cleanRoomCode(this.roomCode.value); });
    this.roomCode.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.join(); });

    this.el('pe-create-room').addEventListener('click', () => this.create());
    this.el('pe-join-room').addEventListener('click', () => this.join());
    this.el('pe-how-to-play').addEventListener('click', (e) => this.show('howto', e.currentTarget as HTMLElement));
    this.el('pe-story').addEventListener('click', (e) => this.show('story', e.currentTarget as HTMLElement));
    this.el('pe-howto-back').addEventListener('click', () => this.show('main'));
    this.el('pe-story-back').addEventListener('click', () => this.show('main'));
    this.soundBtn.addEventListener('click', () => this.setSound(!this.soundOn));
    // Escape goes back from a secondary view.
    document.addEventListener('keydown', this.onKey);
    this.renderSound();
  }

  open(): void {
    this.root.hidden = false;
    this.show('main');
  }

  /** Remove the homepage (and its listeners) once the game starts. */
  close(): void {
    document.removeEventListener('keydown', this.onKey);
    (document.activeElement as HTMLElement | null)?.blur?.(); // dismiss a mobile keyboard
    this.root.hidden = true;
    this.root.remove();
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.views.main.hidden) this.show('main');
  };

  private show(view: View, opener?: HTMLElement): void {
    if (opener) this.lastOpener = opener;
    for (const [k, el] of Object.entries(this.views)) el.hidden = k !== view;
    // Keyboard users land on the view's first control, and back where they were on return.
    if (view === 'main') this.lastOpener?.focus({ preventScroll: true });
    else this.views[view].querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
    if (view !== 'main') this.views[view].scrollTop = 0;
  }

  private create(): void {
    const name = cleanNickname(this.nickname.value);
    saveNickname(name);
    this.cb.onCreateRoom(name);
  }

  private join(): void {
    this.joinMessage.textContent = JOIN_COMING_SOON;
  }

  private setSound(on: boolean): void {
    this.soundOn = on;
    saveSoundOn(on);
    this.renderSound();
    this.cb.onSoundChange(on);
  }

  private renderSound(): void {
    this.soundBtn.setAttribute('aria-pressed', String(this.soundOn));
    this.soundBtn.textContent = `Sound: ${this.soundOn ? 'On' : 'Off'}`;
  }

  private el<T extends HTMLElement = HTMLElement>(id: string): T {
    const e = document.getElementById(id);
    if (!e) throw new Error(`homepage element #${id} missing from index.html`);
    return e as T;
  }
}
