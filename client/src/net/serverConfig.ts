/**
 * Online trial: which game server to use. Pure (storage / location injected), unit-tested.
 *
 * The server is never hard-coded: it comes from `?server=wss://...` (an invite link carries
 * it), and is remembered for this tab in sessionStorage. No server -> the offline local mode.
 */
export const SERVER_KEY = 'pe.server';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const session = (): Store | null => {
  try { return typeof sessionStorage !== 'undefined' ? sessionStorage : null; } catch { return null; }
};

/**
 * A usable server URL (ws:// or wss://, http(s) is converted), origin only (+ path), or null.
 * Plain ws:// is accepted only for localhost (a page on https can't open it anyway).
 */
export function normaliseServer(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol === 'https:') u.protocol = 'wss:';
  else if (u.protocol === 'http:') u.protocol = 'ws:';
  if (u.protocol !== 'wss:' && u.protocol !== 'ws:') return null;
  if (u.protocol === 'ws:' && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname)) return null;
  if (u.username || u.password) return null;
  const path = u.pathname.replace(/\/+$/, '');
  return `${u.protocol}//${u.host}${path}`;
}

/** Remembered "offline" choice (`?server=` empty or `?server=off`). */
export const SERVER_OFF = 'off';

/**
 * The server for this tab, or null for the offline / demo mode:
 *  1. `?server=wss://...` (then remembered for the tab); `?server=` or `?server=off` = offline;
 *  2. else what this tab remembered;
 *  3. else the build's default (`VITE_SERVER_URL`, a GitHub Actions repository variable;
 *     empty by default, so the repo itself holds no server URL).
 */
export function serverFromUrl(search: string, store: Store | null = session(), buildDefault?: string): string | null {
  const q = new URLSearchParams(search);
  if (q.has('server')) {
    const raw = (q.get('server') ?? '').trim();
    const s = raw === '' || raw === SERVER_OFF ? null : normaliseServer(raw);
    try { store?.setItem(SERVER_KEY, s ?? SERVER_OFF); } catch { /* blocked */ }
    return s;
  }
  let remembered: string | null = null;
  try { remembered = store?.getItem(SERVER_KEY) ?? null; } catch { /* blocked */ }
  if (remembered === SERVER_OFF) return null;
  return normaliseServer(remembered) ?? normaliseServer(buildDefault);
}

/** HTTP(S) base of a ws(s) server URL (health / room status). */
export function httpBase(server: string): string {
  return server.replace(/^ws/, 'http');
}

/**
 * The invite link: this page with `?room=CODE`, plus `&server=` when the room is online, so a
 * friend only has to open the link.
 */
export function onlineInviteLink(code: string, server: string | null, loc: { origin: string; pathname: string }): string {
  const q = new URLSearchParams();
  if (server) q.set('server', server);
  q.set('room', code);
  return `${loc.origin}${loc.pathname}?${q.toString()}`;
}
