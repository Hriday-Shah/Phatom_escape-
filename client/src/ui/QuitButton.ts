/**
 * In-game Quit / Home button (#pe-quit) and its "Leave game?" confirm (#pe-quit-confirm, an
 * HTML <dialog> like #pe-lobby-confirm). Markup in index.html, styles in quit.css (theme from
 * the :root variables in home.css), so both can be restyled freely as long as the ids stay.
 * Placement comes from ui/shellLayout.ts quitButtonBox (game screen top-left, clear of the
 * joystick and the buttons in every layout).
 */
import './quit.css';
import { quitButtonBox, ShellLayout } from './shellLayout';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

/** Position the button for the current shell layout (UIScene calls this on every resize). */
export function placeQuitButton(layout: ShellLayout): void {
  const b = el<HTMLButtonElement>('pe-quit');
  if (!b) return;
  const q = quitButtonBox(layout);
  Object.assign(b.style, { left: `${q.x}px`, top: `${q.y}px`, width: `${q.w}px`, height: `${q.h}px` });
}

let ac: AbortController | null = null;

/** Show the button while a game runs; `onQuit` is called when it is tapped. */
export function showQuitButton(onQuit: () => void): void {
  const b = el<HTMLButtonElement>('pe-quit');
  if (!b) return;
  ac?.abort();
  ac = new AbortController();
  b.addEventListener('click', (e) => { e.preventDefault(); onQuit(); }, { signal: ac.signal });
  // Keep taps on the button from reaching the game canvas underneath.
  for (const ev of ['pointerdown', 'touchstart', 'mousedown']) b.addEventListener(ev, (e) => e.stopPropagation(), { signal: ac.signal });
  b.hidden = false;
}

export function hideQuitButton(): void {
  ac?.abort();
  ac = null;
  const b = el<HTMLButtonElement>('pe-quit');
  if (b) b.hidden = true;
  const d = el<HTMLDialogElement>('pe-quit-confirm');
  if (d?.open) d.close('cancel');
}

let pending: Promise<boolean> | null = null;

/** "Leave game?": resolves true on Leave, false on Cancel / Escape. One at a time. */
export function confirmLeave(): Promise<boolean> {
  if (pending) return pending;
  const d = el<HTMLDialogElement>('pe-quit-confirm');
  if (!d) return Promise.resolve(window.confirm('Leave the game?'));
  pending = new Promise<boolean>((resolve) => {
    d.returnValue = '';
    // Escape fires 'cancel' and closes with returnValue '' (= Cancel).
    d.addEventListener('close', () => { pending = null; resolve(d.returnValue === 'ok'); }, { once: true });
    d.showModal();
    el<HTMLButtonElement>('pe-quit-cancel')?.focus({ preventScroll: true });
  });
  return pending;
}
