import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';
import { SafeAreaManager } from './utils/SafeAreaManager';

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
  
  // Create game
  const game = new Phaser.Game(gameConfig);
  
  // Handle visualViewport resize for mobile browser UI
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      game.scale.resize(window.innerWidth, window.innerHeight);
    });
    
    window.visualViewport.addEventListener('scroll', () => {
      // Prevent any scrolling effects
      window.scrollTo(0, 0);
    });
  }
  
  // Fallback resize handler
  window.addEventListener('resize', () => {
    game.scale.resize(window.innerWidth, window.innerHeight);
  });
});
