import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';

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
  new Phaser.Game(gameConfig);
});
