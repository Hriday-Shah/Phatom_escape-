/**
 * Placeholder homepage behaviour. The markup is in index.html (#pe-home and its views), the
 * theme in home.css; this file only wires them up, so the visuals can be redesigned freely as
 * long as the element ids stay.
 *
 * History (R10-3): How to play, Story and the lobby each push a history entry, so browser /
 * Android Back returns to the homepage (and leaves the lobby). Their Back buttons go back
 * through history too.
 */
import './home.css';
import {
  cleanNickname, displayNickname, fixRoomCodeInput, isFullRoomCode, loadNickname, loadSoundOn, saveNickname,
  saveSoundOn,
} from './settings';
import { LobbyScreen } from '../lobby/LobbyScreen';
import { ColourId, LobbySettings, LocalLobbyService } from '../lobby/lobby';

export interface StartInfo { nickname: string; colour?: ColourId; settings?: LobbySettings; }

export interface HomeCallbacks {
  /** The host started the game from the lobby (stage 1: the single-player house). */
  onStartGame(info: StartInfo): void;
  /** Sound toggled (wired to Phaser's global mute). */
  onSoundChange(on: boolean): void;
}

type View = 'main' | 'howto' | 'story' | 'lobby';
const HISTORY_KEY = 'peView';

export class HomeScreen {
  private root = document.getElementById('pe-home') as HTMLElement;
  private views: Record<View, HTMLElement> = {
    main: this.el('pe-view-main'), howto: this.el('pe-view-howto'), story: this.el('pe-view-story'), lobby: this.el('pe-lobby'),
  };
  private nickname = this.el<HTMLInputElement>('pe-nickname');
  private roomCode = this.el<HTMLInputElement>('pe-room-code');
  private joinBtn = this.el<HTMLButtonElement>('pe-join-room');
  private joinMessage = this.el('pe-join-message');
  private soundBtn = this.el<HTMLButtonElement>('pe-sound-toggle');
  private soundOn = loadSoundOn();
  private lastOpener: HTMLElement | null = null;
  private lastByKeyboard = false;
  private lobby: LobbyScreen | null = null;
  private current: View = 'main';
  private ac = new AbortController();

  constructor(private cb: HomeCallbacks) {
    const on = (el: EventTarget, ev: string, f: (e: any) => void) => el.addEventListener(ev, f, { signal: this.ac.signal });
    this.nickname.value = loadNickname();

    // Nickname: invisible characters stripped and 16 grapheme clusters max while typing (R10-2).
    on(this.nickname, 'input', (e: InputEvent) => { if (!e.isComposing) this.fixNickname(); });
    on(this.nickname, 'compositionend', () => this.fixNickname());
    on(this.nickname, 'change', () => { this.nickname.value = cleanNickname(this.nickname.value); saveNickname(this.nickname.value); });
    on(this.nickname, 'keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') this.nickname.blur(); }); // "done" on mobile

    // Room code: only what's typed is upper-cased / filtered, caret kept, full = refuse (R10-1).
    on(this.roomCode, 'input', (e: InputEvent) => { if (!e.isComposing) this.fixRoomCode(); });
    on(this.roomCode, 'compositionend', () => this.fixRoomCode());
    on(this.roomCode, 'keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') this.join(); });

    on(this.el('pe-create-room'), 'click', () => this.openLobby('host'));
    on(this.joinBtn, 'click', () => this.join());
    on(this.el('pe-how-to-play'), 'click', (e: MouseEvent) => this.go('howto', e));
    on(this.el('pe-story'), 'click', (e: MouseEvent) => this.go('story', e));
    on(this.el('pe-howto-back'), 'click', (e: MouseEvent) => this.back(e));
    on(this.el('pe-story-back'), 'click', (e: MouseEvent) => this.back(e));
    on(this.soundBtn, 'click', () => this.setSound(!this.soundOn));
    // Escape goes back from How to play / Story.
    on(document, 'keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (this.current === 'howto' || this.current === 'story')) { this.lastByKeyboard = true; history.back(); }
    });
    on(window, 'popstate', (e: PopStateEvent) => this.onPop(e.state));
    this.renderSound();
    this.renderJoin();
  }

  /** Show the homepage; `room` pre-fills the join code (?room=CODE); `lobby` opens a debug lobby. */
  open(opts: { room?: string | null; lobby?: 'host' | 'player' | null } = {}): void {
    this.root.hidden = false;
    // The homepage is the base entry; views push on top of it.
    history.replaceState({ ...(history.state ?? {}), [HISTORY_KEY]: 'main' }, '');
    this.show('main');
    if (opts.room) { this.roomCode.value = opts.room; this.renderJoin(); }
    if (opts.lobby) this.openLobby(opts.lobby, true);
  }

  /** Remove the homepage (and its listeners) once the game starts. */
  close(): void {
    this.ac.abort();
    this.lobby?.destroy();
    (document.activeElement as HTMLElement | null)?.blur?.(); // dismiss a mobile keyboard
    this.root.hidden = true;
    this.root.remove();
  }

  // ---- views & history ----

  private go(view: View, e?: MouseEvent): void {
    this.lastOpener = (e?.currentTarget as HTMLElement) ?? null;
    this.lastByKeyboard = !!e && e.detail === 0; // a click from Enter / Space has detail 0
    history.pushState({ ...(history.state ?? {}), [HISTORY_KEY]: view }, '');
    this.show(view);
  }

  /** On-screen Back: same as the browser's (our entry is on top), else just show main. */
  private back(e?: MouseEvent): void {
    this.lastByKeyboard = !!e && e.detail === 0;
    if (history.state?.[HISTORY_KEY] && history.state[HISTORY_KEY] !== 'main') history.back();
    else this.show('main');
  }

  private onPop(state: any): void {
    const view: View = state?.[HISTORY_KEY] ?? 'main';
    // Back out of the lobby leaves the room (its onLeave then shows main; history is already popped).
    if (this.current === 'lobby' && view !== 'lobby' && this.lobby) { this.lobby.leave(); return; }
    if (view === 'lobby' && !this.lobby) { history.back(); return; } // forward into a room already left
    this.show(view);
  }

  private show(view: View): void {
    this.current = view;
    for (const [k, el] of Object.entries(this.views)) el.hidden = k !== view;
    if (view !== 'main') this.views[view].scrollTop = 0;
    // Keyboard users land on the view's first control and back on the opener on return; after
    // a pointer, focus moves silently to the view (no ring: :focus-visible only, R10).
    if (view === 'main') {
      if (this.lastOpener?.isConnected && !this.lastOpener.closest('[hidden]')) this.lastOpener.focus({ preventScroll: true });
    } else if (this.lastByKeyboard) {
      this.views[view].querySelector<HTMLElement>('button:not([disabled]), select, input')?.focus({ preventScroll: true });
    } else {
      this.views[view].setAttribute('tabindex', '-1');
      this.views[view].focus({ preventScroll: true });
    }
  }

  // ---- lobby ----

  private openLobby(role: 'host' | 'player', debugEntry = false): void {
    const name = displayNickname(this.nickname.value);
    saveNickname(cleanNickname(this.nickname.value));
    // Stage 1: local room. The debug entries add placeholder players; a real Create is just you
    // (a joined room needs a placeholder host to follow).
    const svc = role === 'host'
      ? LocalLobbyService.create(name, { placeholders: debugEntry ? 2 : 0 })
      : LocalLobbyService.joinLocal(name, isFullRoomCode(this.roomCode.value) ? this.roomCode.value : 'DEBUG1', { placeholders: debugEntry ? 1 : 0 });
    this.lobby?.destroy();
    this.lobby = new LobbyScreen(svc, {
      onLeave: () => {
        this.lobby = null;
        if (history.state?.[HISTORY_KEY] === 'lobby') history.back(); else this.show('main');
      },
      onStart: (self, settings) => this.cb.onStartGame({ nickname: self.nickname, colour: self.colour, settings }),
    });
    this.go('lobby');
  }

  private join(): void {
    if (!isFullRoomCode(this.roomCode.value)) { this.renderJoin(); return; }
    this.openLobby('player');
  }

  // ---- inputs ----

  private fixNickname(): void {
    const el = this.nickname;
    const caret = el.selectionStart ?? el.value.length;
    const fixed = cleanNickname(el.value, false);
    if (fixed !== el.value) {
      const before = cleanNickname(el.value.slice(0, caret), false).length;
      el.value = fixed;
      const c = Math.min(before, fixed.length);
      el.setSelectionRange(c, c);
    }
    saveNickname(cleanNickname(el.value));
  }

  private fixRoomCode(): void {
    const el = this.roomCode;
    const r = fixRoomCodeInput(el.value, el.selectionStart ?? el.value.length);
    if (r.value !== el.value) { el.value = r.value; el.setSelectionRange(r.caret, r.caret); }
    this.renderJoin();
  }

  /** Join is enabled only with a full 6-character code. */
  private renderJoin(): void {
    const full = isFullRoomCode(this.roomCode.value);
    this.joinBtn.disabled = !full;
    this.joinMessage.textContent = full ? '' : 'Enter a 6-character code to join.';
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
