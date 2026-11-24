/** Homepage settings kept in localStorage (no accounts). Pure, so it is unit-tested. */
export const NICKNAME_KEY = 'pe.nickname';
export const SOUND_KEY = 'pe.soundOn';
export const NICKNAME_MAX = 16;
export const ROOM_CODE_MAX = 6;

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const defaultStore = (): Store | null => {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } // private mode
};

/** Trim, drop control characters, collapse spaces, cap at NICKNAME_MAX characters (code points). */
export function cleanNickname(raw: string): string {
  const s = raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return Array.from(s).slice(0, NICKNAME_MAX).join('');
}

/** Upper-case letters and digits only, at most ROOM_CODE_MAX. */
export function cleanRoomCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_MAX);
}

export function loadNickname(store: Store | null = defaultStore()): string {
  try { return cleanNickname(store?.getItem(NICKNAME_KEY) ?? ''); } catch { return ''; }
}
export function saveNickname(name: string, store: Store | null = defaultStore()): void {
  try { store?.setItem(NICKNAME_KEY, cleanNickname(name)); } catch { /* storage full / blocked */ }
}

/** Sound is on unless the player turned it off. */
export function loadSoundOn(store: Store | null = defaultStore()): boolean {
  try { return store?.getItem(SOUND_KEY) !== '0'; } catch { return true; }
}
export function saveSoundOn(on: boolean, store: Store | null = defaultStore()): void {
  try { store?.setItem(SOUND_KEY, on ? '1' : '0'); } catch { /* ignore */ }
}

/**
 * QA / dev URLs skip the homepage and boot straight into the game: any `?debug=...` or
 * `?spawn=...` (play.mjs, pd-drawers.mjs and the shell scripts all use them), or `?play`.
 */
export function skipsHome(search: string): boolean {
  const p = new URLSearchParams(search);
  return p.has('debug') || p.has('spawn') || p.has('play');
}
