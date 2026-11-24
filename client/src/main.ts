import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';
import { SafeAreaManager } from './utils/SafeAreaManager';
import { currentRenderDpr } from './config/display';
import { HomeScreen } from './home/HomeScreen';
import { loadNickname, loadSoundOn, skipsHome } from './home/settings';

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
    startGame(loadNickname());
    return;
  }
  const home = new HomeScreen({
    onCreateRoom: (nickname) => { home.close(); startGame(nickname); },
    onSoundChange: applySound,
  });
  home.open();
});

/** Stage 1: "Create room" starts the single-player house. */
function startGame(nickname: string): void {
  if (game) return;
  game = new Phaser.Game(gameConfig);
  // Scenes can read the nickname with this.registry.get('nickname').
  game.registry.set('nickname', nickname);
  game.events.once(Phaser.Core.Events.READY, () => applySound(loadSoundOn()));

  // Test hook for QA/Playwright (dev builds or any ?debug=... URL only).
  if (import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug')) {
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
