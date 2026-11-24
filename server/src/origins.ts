/**
 * Allowed browser origins: the GitHub Pages site and local dev / preview. Extra origins can be
 * added with PE_ALLOWED_ORIGINS (comma-separated). Requests without an Origin header (not a
 * browser, e.g. the health check) are allowed; this is a browser-side guard, not auth.
 */
const FIXED = ['https://hriday-shah.github.io'];
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const EXTRA = (process.env.PE_ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  return FIXED.includes(origin) || EXTRA.includes(origin) || LOCAL.test(origin);
}
