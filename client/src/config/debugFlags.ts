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
