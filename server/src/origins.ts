/**
 * Allowed browser origins. ALLOWED_ORIGINS (comma-separated) replaces the default
 * "https://hriday-shah.github.io,localhost"; the word `localhost` allows any
 * http(s)://localhost / 127.0.0.1 / [::1] port. Requests without an Origin header (not a
 * browser, e.g. the host's health check) are allowed; this is a browser-side guard, not auth.
 */
const DEFAULT_ORIGINS = 'https://hriday-shah.github.io,localhost';
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export function parseOrigins(raw: string | undefined): { exact: Set<string>; localhost: boolean } {
  const list = (raw?.trim() ? raw : DEFAULT_ORIGINS).split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
  return { exact: new Set(list.filter((o) => o !== 'localhost')), localhost: list.includes('localhost') };
}

const CONFIG = parseOrigins(process.env.ALLOWED_ORIGINS);

export function originAllowed(origin: string | undefined, cfg = CONFIG): boolean {
  if (!origin) return true;
  return cfg.exact.has(origin) || (cfg.localhost && LOCAL.test(origin));
}
