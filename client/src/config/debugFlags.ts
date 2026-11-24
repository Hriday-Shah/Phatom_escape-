/**
 * QA URL flags: `?debug=unlock`, `?debug=nolight`, `?debug=1`. Several can be combined as
 * `?debug=unlock,nolight` or `?debug=unlock&debug=nolight`.
 *
 * Flags are snapshotted once at boot. In a production build they apply only while the
 * session is offline (no live room). Online rooms ignore every `?debug` / `?qa` flag,
 * including ones added via history.replaceState before Start. Offline debug views used
 * by live checks (m.mjs, play.mjs, pd-drawers) still work on a production preview when
 * there is no server connection.
 */
const BOOT_SEARCH = typeof window !== 'undefined' ? window.location.search : '';

function isDevBuild(): boolean {
  try {
    const env = (import.meta as { env?: { DEV?: boolean; MODE?: string; VITE_QA?: string } }).env;
    if (env?.DEV) return true;
    if (env?.MODE === 'development') return true;
    if (env?.VITE_QA === '1') return true;
  } catch { /* not a Vite bundle */ }
  return false;
}

/** Set from main.startGame: true while an online room is running. */
let onlineSession = false;
export function setOnlineSession(on: boolean): void { onlineSession = on; }
export function isOnlineSession(): boolean { return onlineSession; }
export function isDevOrQaBuild(): boolean { return isDevBuild(); }

/**
 * Source for flag reads. Production online rooms always see an empty query.
 * Production offline always uses the boot snapshot when the caller omits `search`.
 * An explicit `search` is honoured only when not in a production online session
 * (unit tests, and the one-shot boot snapshot itself).
 */
function source(search?: string): string {
  if (!isDevBuild() && onlineSession) return '';
  if (search !== undefined) return search;
  return BOOT_SEARCH;
}

export function debugFlags(search?: string): Set<string> {
  const params = new URLSearchParams(source(search));
  return new Set(params.getAll('debug').flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean));
}

export function hasDebugFlag(flag: string): boolean {
  return debugFlags().has(flag);
}

export type DebugMinigameName = 'slide' | 'maze' | 'lockpick' | 'memory' | 'chase';

const DEBUG_MINIGAME_IDS: readonly DebugMinigameName[] = ['slide', 'maze', 'lockpick', 'memory', 'chase'];

/** True in a dev/QA build, or (production + offline) when a ?debug / ?qa / ?lobby flag is set. */
export function qaHooksAllowed(search?: string): boolean {
  if (isDevBuild()) return true;
  if (onlineSession) return false;
  const src = source(search);
  const params = new URLSearchParams(src);
  return debugFlags(src).size > 0 || params.has('qa') || params.has('lobby');
}

/** `?debug=minigame=slide` (also works in a comma list). `dotdash` → chase, `lock` → lockpick. */
export function debugMinigame(search?: string): DebugMinigameName | null {
  for (const f of debugFlags(search)) {
    const m = /^minigame=(.+)$/.exec(f);
    if (!m) continue;
    if (m[1] === 'dotdash') return 'chase';
    if (m[1] === 'lock') return 'lockpick';
    if ((DEBUG_MINIGAME_IDS as readonly string[]).includes(m[1])) return m[1] as DebugMinigameName;
  }
  return null;
}

/** `?debug=items` hides the controller even on a QA boot that skips the lobby. */
export function debugItems(search?: string): boolean {
  return debugFlags(search).has('items');
}

export const BOOT_QUERY = BOOT_SEARCH;
