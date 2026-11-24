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
  cleanNickname, displayNickname, fixNicknameInput, fixRoomCodeInput, isFullRoomCode, loadNickname, loadSoundOn, saveNickname,
  saveSoundOn,
} from './settings';
import { LobbyScreen } from '../lobby/LobbyScreen';
import { ColourId, LobbyService, LobbySettings, LocalLobbyService } from '../lobby/lobby';
import { ColyseusLobbyService, GameLink, JoinError } from '../net/ColyseusLobbyService';
import { JOIN_FAILURE_TEXT } from '../net/protocol';

export interface StartInfo {
  nickname: string; colour?: ColourId; settings?: LobbySettings;
  /** Online room (trial): the connection the game keeps using; absent offline. */
  net?: GameLink;
}

const ENDED_TEXT = {
  kicked: 'The host removed you from the room.',
  disconnected: 'Lost the connection to the game server.',
};

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
  /** Online trial: the game server for this tab (?server=...), null = offline local mode. */
  private server: string | null = null;
  private busy = false;
  private homeMessage = this.el('pe-home-message');
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
  open(opts: { room?: string | null; lobby?: 'host' | 'player' | null; server?: string | null } = {}): void {
    this.root.hidden = false;
    this.server = opts.lobby ? null : opts.server ?? null; // debug lobbies stay local
    this.el('pe-online-status').textContent = this.server ? 'Online: rooms are on the game server from your invite link.' : '';
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
    if (this.busy) return;
    this.homeMessage.textContent = '';
    const name = displayNickname(this.nickname.value);
    saveNickname(cleanNickname(this.nickname.value));
    if (this.server && !debugEntry) { void this.openOnline(role, name, this.server); return; }
    // Stage 1: local room. The debug entries add placeholder players; a real Create is just you
    // (a joined room needs a placeholder host to follow).
    const svc = role === 'host'
      ? LocalLobbyService.create(name, { placeholders: debugEntry ? 2 : 0 })
      : LocalLobbyService.joinLocal(name, isFullRoomCode(this.roomCode.value) ? this.roomCode.value : 'DEBUG1', { placeholders: debugEntry ? 1 : 0 });
    this.showLobby(svc, null);
  }

  /** Online trial: create / join on the server; friendly messages when it fails. */
  private async openOnline(role: 'host' | 'player', name: string, server: string): Promise<void> {
    const msgEl = role === 'host' ? this.homeMessage : this.joinMessage;
    this.setBusy(true);
    this.homeMessage.textContent = ''; msgEl.textContent = role === 'host' ? 'Creating room…' : 'Joining room…';
    try {
      const svc = role === 'host'
        ? await ColyseusLobbyService.create(server, name)
        : await ColyseusLobbyService.join(server, this.roomCode.value, name);
      msgEl.textContent = '';
      this.setBusy(false);
      this.showLobby(svc, server);
    } catch (e) {
      this.setBusy(false);
      if (role === 'player') this.renderJoin();
      msgEl.textContent = JOIN_FAILURE_TEXT[e instanceof JoinError ? e.reason : 'unreachable'];
    }
  }

  private showLobby(svc: LobbyService, server: string | null): void {
    this.lobby?.destroy();
    this.lobby = new LobbyScreen(svc, {
      onLeave: () => {
        this.lobby = null;
        // R11-4: back on the homepage, focus Create room (not <body>).
        this.lastOpener = this.el('pe-create-room');
        if (history.state?.[HISTORY_KEY] === 'lobby') history.back(); else this.show('main');
      },
      onStart: (self, settings) => this.cb.onStartGame({
        nickname: self.nickname, colour: self.colour, settings, net: svc instanceof ColyseusLobbyService ? svc : undefined,
      }),
      onEnded: (reason) => {
        this.lobby = null;
        if (history.state?.[HISTORY_KEY] === 'lobby') history.back(); else this.show('main');
        this.homeMessage.textContent = ENDED_TEXT[reason];
      },
    }, server);
    this.go('lobby');
  }

  private setBusy(b: boolean): void {
    this.busy = b;
    (this.el('pe-create-room') as HTMLButtonElement).disabled = b;
    this.joinBtn.disabled = b || !isFullRoomCode(this.roomCode.value);
  }

  private join(): void {
    if (!isFullRoomCode(this.roomCode.value)) { this.renderJoin(); return; }
    this.openLobby('player');
  }

  // ---- inputs ----

  private fixNickname(): void {
    const el = this.nickname;
    const r = fixNicknameInput(el.value, el.selectionStart ?? el.value.length);
    if (r.value !== el.value) { el.value = r.value; el.setSelectionRange(r.caret, r.caret); }
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
    this.joinBtn.disabled = !full || this.busy;
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
