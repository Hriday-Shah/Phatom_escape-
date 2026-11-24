import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';
import { SafeAreaManager } from './utils/SafeAreaManager';
import { currentRenderDpr } from './config/display';
import { HomeScreen } from './home/HomeScreen';
import { displayNickname, loadNickname, loadSoundOn, lobbyFromUrl, roomFromUrl, skipsHome } from './home/settings';
import type { StartInfo } from './home/HomeScreen';
import { serverFromUrl } from './net/serverConfig';

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

/** Phaser's global mute (game.sound.mute), from the homepage's persisted sound setting. */
function applySound(on: boolean): void {
  if (!game) return;
  game.registry.set('soundOn', on);
  if (game.sound) game.sound.mute = !on;
}

// Homepage first; QA / dev URLs (?debug=..., ?spawn=..., ?play) boot straight into the game.
window.addEventListener('load', () => {
  // Initialize safe area manager
  SafeAreaManager.init();

  if (skipsHome(window.location.search)) {
    startGame({ nickname: displayNickname(loadNickname()) }, false);
    return;
  }
  const home = new HomeScreen({
    onStartGame: (info) => { home.close(); startGame(info, true); },
    onSoundChange: applySound,
  });
  // Online trial: ?server=wss://... (from an invite link; remembered for this tab).
  home.open({
    room: roomFromUrl(window.location.search), lobby: lobbyFromUrl(window.location.search),
    server: serverFromUrl(window.location.search),
  });
});

const LEAVE_GAME = 'Leave the game and go back to the homepage?';

/**
 * Stage 1: the lobby's Start (or a QA URL) starts the single-player house. Back during the game
 * asks before leaving (R10-3); leaving reloads the homepage.
 */
function startGame(info: StartInfo, fromLobby: boolean): void {
  if (game) return;
  game = new Phaser.Game(gameConfig);
  // Scenes read these with this.registry.get(...).
  game.registry.set('nickname', info.nickname);
  game.registry.set('colour', info.colour ?? null);
  game.registry.set('lobbySettings', info.settings ?? null);
  // Online room (trial): GameScene adds the other players and drawer sync (net/NetSync.ts).
  game.registry.set('net', info.net ?? null);
  // History: the game is the top entry (it replaces the lobby's); Back pops it -> confirm.
  if (fromLobby) history.replaceState({ peView: 'game' }, '');
  else history.pushState({ peView: 'game' }, '');
  window.addEventListener('popstate', () => {
    if (window.confirm(LEAVE_GAME)) window.location.href = window.location.pathname; // homepage, fresh
    else history.pushState({ peView: 'game' }, '');
  });
  game.events.once(Phaser.Core.Events.READY, () => applySound(loadSoundOn()));

  // Test hook for QA/Playwright (dev builds or any ?debug=... URL only).
  // (also the ?lobby= debug entries, so the lobby -> game hand-off can be checked).
  const q = new URLSearchParams(window.location.search);
  // ?qa=1 exposes it without changing anything else (online end-to-end test).
  if (import.meta.env.DEV || q.has('debug') || q.has('lobby') || q.has('qa')) {
    (window as any).__PE_GAME__ = game;
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
  const applySizeNow = () => applySize(g);
  g.events.once(Phaser.Core.Events.READY, applySizeNow);

  // Handle visualViewport resize for mobile browser UI
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', applySizeNow);
    window.visualViewport.addEventListener('scroll', () => {
      // Prevent any scrolling effects
      window.scrollTo(0, 0);
    });
  }

  // Fallback resize handler
  window.addEventListener('resize', applySizeNow);
}
