/**
 * QA URL flags: `?debug=unlock`, `?debug=nolight`, `?debug=1`. Several can be combined as
 * `?debug=unlock,nolight` or `?debug=unlock&debug=nolight`.
 */
export function debugFlags(search: string = typeof window !== 'undefined' ? window.location.search : ''): Set<string> {
  const params = new URLSearchParams(search);
  return new Set(params.getAll('debug').flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean));
}

export function hasDebugFlag(flag: string): boolean {
  return debugFlags().has(flag);
}

export type DebugMinigameName = 'slide' | 'maze' | 'lockpick' | 'memory' | 'chase';

const DEBUG_MINIGAME_IDS: readonly DebugMinigameName[] = ['slide', 'maze', 'lockpick', 'memory', 'chase'];

/** True in a Vite dev server, or when any `?debug=` flag is present (including `minigame=`). */
export function qaHooksAllowed(search?: string): boolean {
  try {
    const env = (import.meta as { env?: { DEV?: boolean } }).env;
    if (env?.DEV) return true;
  } catch { /* not a Vite bundle */ }
  return debugFlags(search).size > 0;
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
