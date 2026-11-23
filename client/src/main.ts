import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';
import { SafeAreaManager } from './utils/SafeAreaManager';
import { currentRenderDpr } from './config/display';

// Prevent iOS Safari bounce and zoom
document.addEventListener('touchmove', (e) => {
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

// Start the game
window.addEventListener('load', () => {
  // Initialize safe area manager
  SafeAreaManager.init();

  const game = new Phaser.Game(gameConfig);

  // Test hook for QA/Playwright (dev builds or any ?debug=... URL only).
  if (import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug')) {
    (window as any).__PE_GAME__ = game;
  }

  // Keep the backing store at CSS size x DPR (DPR can change when the window
  // moves between screens or the page is zoomed).
  const applySize = () => {
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

  game.events.once(Phaser.Core.Events.READY, applySize);

  // Handle visualViewport resize for mobile browser UI
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', applySize);
    window.visualViewport.addEventListener('scroll', () => {
      // Prevent any scrolling effects
      window.scrollTo(0, 0);
    });
  }

  // Fallback resize handler
  window.addEventListener('resize', applySize);
});
