import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';
import { SafeAreaManager } from './utils/SafeAreaManager';
import { currentRenderDpr } from './config/display';
import { HomeScreen } from './home/HomeScreen';
import { displayNickname, loadNickname, loadSoundOn, lobbyFromUrl, roomFromUrl, skipsHome } from './home/settings';
import type { StartInfo } from './home/HomeScreen';
import { serverFromUrl } from './net/serverConfig';
import { confirmLeave, hideQuitButton, showQuitButton } from './ui/QuitButton';
import { hideOverlay, setHomeHandler } from './net/NetOverlay';

// Prevent iOS Safari bounce and zoom
document.addEventListener('touchmove', (e) => {
  // The homepage's views may scroll (How to play on a short landscape phone).
  if ((e.target as Element | null)?.closest?.('.pe-screen')) return;
  e.preventDefault();
}, { passive: false });

document.addEventListener('gesturestart', (e) => {
  e.preventDefault();
});

document.addEventListener('gesturechange', (e) => {
  e.preventDefault();
});

document.addEventListener('gestureend', (e) => {
  e.preventDefault();
});

let game: Phaser.Game | null = null;
/** Undoes everything startGame attached to window / document (listeners, hooks). */
let teardown: (() => void) | null = null;
/** The homepage's server for this visit (?server= / build default; null after "Play offline"). */
let homeServer: string | null = null;
let home: HomeScreen | null = null;

/** Phaser's global mute (game.sound.mute), from the homepage's persisted sound setting. */
function applySound(on: boolean): void {
  if (!game) return;
  game.registry.set('soundOn', on);
  if (game.sound) game.sound.mute = !on;
}

function openHome(opts: Parameters<HomeScreen['open']>[0]): void {
  home = new HomeScreen({
    onStartGame: (info) => { homeServer = home?.serverInUse ?? null; home?.close(); home = null; startGame(info, true); },
    onSoundChange: applySound,
  });
  home.open(opts);
}

// Homepage first; QA / dev URLs (?debug=..., ?spawn=..., ?play) boot straight into the game.
window.addEventListener('load', () => {
  // Initialize safe area manager
  SafeAreaManager.init();
  setHomeHandler(() => void quitGame());

  if (skipsHome(window.location.search)) {
    startGame({ nickname: displayNickname(loadNickname()) }, false);
    return;
  }
  // Online: ?server=wss://... (invite link; remembered for this tab) or the build default.
  openHome({
    room: roomFromUrl(window.location.search), lobby: lobbyFromUrl(window.location.search),
    server: serverFromUrl(window.location.search, undefined, import.meta.env.VITE_SERVER_URL),
  });
});

let quitting = false;

/**
 * Leave the game: a deliberate leave of the online room (no seat kept; the server migrates the
 * host), the Phaser game destroyed in place (scenes, input, audio, canvas; every window /
 * document listener startGame added is removed), then the homepage again with focus on Create
 * room. A new game can then start without a reload.
 */
async function quitGame(): Promise<void> {
  if (!game || quitting) return;
  quitting = true;
  const g = game;
  const net = g.registry.get('net') as StartInfo['net'] | null;
  net?.leave();
  hideQuitButton();
  hideOverlay();
  teardown?.();
  teardown = null;
  await new Promise<void>((resolve) => {
    g.events.once(Phaser.Core.Events.DESTROY, () => resolve());
    g.destroy(true, false);
    // Phaser finishes destroying on its next frame; a hidden tab has none, so finish it now.
    setTimeout(() => { if (!(g as any).isDestroyed && (g as any).pendingDestroy) (g as any).runDestroy(); resolve(); }, 500);
  });
  game = null;
  delete (window as any).__PE_GAME__;
  quitting = false;
  const url = new URL(window.location.href);
  if (skipsHome(url.search)) { window.location.href = url.pathname; return; } // QA boot URL: plain homepage
  history.replaceState({}, '');
  openHome({ server: homeServer, afterGame: true });
}

/** Tapped Quit, or browser Back: ask first (Cancel resumes the game). */
async function askToLeave(): Promise<boolean> {
  const g = game;
  if (!g) return false;
  const scene = g.scene.getScene('GameScene');
  // Offline: the house pauses while the question is up. Online it keeps running (others move).
  const pause = !g.registry.get('net') && scene?.sys.isActive();
  if (pause) g.scene.pause('GameScene');
  // Keys go to the dialog (Phaser would swallow Space / arrows), and none stay held after it.
  const kb = g.input.keyboard;
  if (kb) kb.enabled = false;
  const leave = await confirmLeave();
  if (!leave && game === g) {
    if (kb) kb.enabled = true;
    g.scene.getScenes(true).forEach((sc) => sc.input?.keyboard?.resetKeys());
    if (pause) g.scene.resume('GameScene');
  }
  if (leave) await quitGame();
  return leave;
}

/**
 * The lobby's Start (or a QA URL) starts the house. The Quit / Home button and browser Back
 * both ask before leaving; leaving tears the game down in place (quitGame).
 */
function startGame(info: StartInfo, fromLobby: boolean): void {
  if (game) return;
  game = new Phaser.Game(gameConfig);
  // Scenes read these with this.registry.get(...).
  game.registry.set('nickname', info.nickname);
  game.registry.set('colour', info.colour ?? null);
  game.registry.set('lobbySettings', info.settings ?? null);
  game.registry.set('fromLobby', fromLobby);
  game.registry.set('roundSeed', info.seed ?? info.nickname ?? 'local');
  // Online room: GameScene adds the other players and hiding-spot sync (net/NetSync.ts).
  game.registry.set('net', info.net ?? null);
  if (info.net) info.net.inGame = true; // connection ends now show the in-game end screen
  const ac = new AbortController();
  const on = (t: EventTarget, ev: string, f: (e: any) => void) => t.addEventListener(ev, f, { signal: ac.signal });
  // History: the game is the top entry (it replaces the lobby's); Back pops it -> confirm.
  if (fromLobby) history.replaceState({ peView: 'game' }, '');
  else history.pushState({ peView: 'game' }, '');
  on(window, 'popstate', () => {
    if (!game || quitting) return;
    history.pushState({ peView: 'game' }, ''); // stay on the game unless they confirm
    void askToLeave();
  });
  showQuitButton(() => void askToLeave());
  game.events.once(Phaser.Core.Events.READY, () => applySound(loadSoundOn()));

  // Test hook for QA/Playwright (dev builds or any ?debug=... URL only).
  // (also the ?lobby= debug entries, so the lobby -> game hand-off can be checked).
  const q = new URLSearchParams(window.location.search);
  // ?qa=1 exposes it without changing anything else (online end-to-end test).
  if (import.meta.env.DEV || q.has('debug') || q.has('lobby') || q.has('qa')) {
    (window as any).__PE_GAME__ = game;
    // Leak checks after Quit (listeners left behind, canvases).
    (window as any).__PE_STATS__ = () => ({
      game: !!game, safeAreaListeners: SafeAreaManager.listenerCount(), canvases: document.querySelectorAll('canvas').length,
    });
  }

  // Keep the backing store at CSS size x DPR (DPR can change when the window
  // moves between screens or the page is zoomed).
  const applySize = (game: Phaser.Game) => {
    const dpr = currentRenderDpr();
    const w = window.innerWidth;
    const h = window.innerHeight;
    game.scale.zoom = 1 / dpr;
    game.scale.resize(Math.round(w * dpr), Math.round(h * dpr));
    const canvas = game.canvas;
    if (canvas) {
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
  };

  const g = game;
  const applySizeNow = () => { if (!quitting) applySize(g); };
  g.events.once(Phaser.Core.Events.READY, applySizeNow);

  // Handle visualViewport resize for mobile browser UI
  if (window.visualViewport) {
    on(window.visualViewport, 'resize', applySizeNow);
    // Prevent any scrolling effects
    on(window.visualViewport, 'scroll', () => window.scrollTo(0, 0));
  }

  // Fallback resize handler
  on(window, 'resize', applySizeNow);
  teardown = () => ac.abort();
}
