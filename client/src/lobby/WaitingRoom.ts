/**
 * Lobby-style waiting room for non-Phantoms during hiding. Markup: #pe-waiting in index.html.
 */
import './waiting.css';

function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node;
}

export function showWaitingRoom(clock: string): void {
  const root = el('pe-waiting');
  el('pe-waiting-clock').textContent = clock;
  root.hidden = false;
}

export function updateWaitingClock(clock: string): void {
  const node = document.getElementById('pe-waiting-clock');
  if (node) node.textContent = clock;
}

export function hideWaitingRoom(): void {
  const root = document.getElementById('pe-waiting');
  if (root) root.hidden = true;
}

export function waitingRoomOpen(): boolean {
  const root = document.getElementById('pe-waiting');
  return !!root && !root.hidden;
}
