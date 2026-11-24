/**
 * Online connection UI (markup: #pe-net-overlay / #pe-net-toast in index.html, styles in
 * net.css): "Reconnecting…" while a dropped connection retries, "Connection lost" with
 * Back to home when it can't, and short notices. Only text is set (textContent).
 */
import './net.css';
import type { EndReason, GameLink } from './ColyseusLobbyService';

const el = (id: string) => document.getElementById(id);

export function showReconnecting(): void {
  const o = el('pe-net-overlay'); if (!o) return;
  el('pe-net-title')!.textContent = 'Connection lost: reconnecting…';
  el('pe-net-detail')!.textContent = 'Your place in the room is kept for about 30 seconds.';
  el('pe-net-home')!.hidden = true;
  o.dataset.state = 'reconnecting';
  o.hidden = false;
}

export function hideOverlay(): void { const o = el('pe-net-overlay'); if (o) o.hidden = true; }

const END_TEXT: Record<EndReason, [string, string]> = {
  lost: ['Connection lost', "Couldn't reconnect in time. The game goes on without you."],
  closed: ['Room closed', 'The game server closed the room.'],
  kicked: ['Removed from the room', 'The host removed you from the room.'],
};

let goHome: () => void = () => { window.location.href = window.location.pathname; };
/** main.ts: Back to home tears the game down in place and reopens the homepage (no reload). */
export function setHomeHandler(fn: () => void): void { goHome = fn; }

/** Final screen; Back to home returns to the homepage. */
export function showEnded(reason: EndReason): void {
  const o = el('pe-net-overlay'); if (!o) return;
  const [title, detail] = END_TEXT[reason];
  el('pe-net-title')!.textContent = title;
  el('pe-net-detail')!.textContent = detail;
  const home = el('pe-net-home') as HTMLButtonElement;
  home.hidden = false;
  home.onclick = () => { hideOverlay(); goHome(); };
  // The game is over for this player: no Quit / "Leave game?" over the end screen.
  const d = el('pe-quit-confirm') as HTMLDialogElement | null;
  if (d?.open) d.close('cancel');
  const q = el('pe-quit'); if (q) q.hidden = true;
  o.dataset.state = 'ended';
  o.hidden = false;
  home.focus({ preventScroll: true });
}

let toastTimer = 0;
export function netToast(text: string, ms = 3500): void {
  const t = el('pe-net-toast'); if (!t) return;
  t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { t.hidden = true; }, ms);
}

/**
 * Wire a connection to the overlay: Reconnecting… in the lobby and the game; the end screen
 * only in the game (in the lobby, the lobby screen sends you home with a message instead).
 */
export function bindNetOverlay(link: GameLink & { inGame: boolean }): void {
  link.onStatus((s) => (s === 'reconnecting' ? showReconnecting() : hideOverlay()));
  link.onEnd((r) => { if (link.inGame) showEnded(r); else hideOverlay(); });
}
