/** Homepage settings kept in localStorage (no accounts). Pure, so it is unit-tested. */
export const NICKNAME_KEY = 'pe.nickname';
export const SOUND_KEY = 'pe.soundOn';
export const NICKNAME_MAX = 16;
export const ROOM_CODE_MAX = 6;

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const defaultStore = (): Store | null => {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } // private mode
};

/** Shown when the nickname is empty. */
export const DEFAULT_NICKNAME = 'Player';

/**
 * Invisible / direction-changing characters that could spoof or hide a name once others see it:
 * bidi embeddings and overrides (U+202A-202E), isolates (U+2066-2069), marks (U+200E-200F,
 * U+061C), zero-width space / non-joiner (U+200B-200C), word joiner and invisible operators
 * (U+2060-2064), BOM (U+FEFF), soft hyphen (U+00AD) and C0/C1 controls. The zero-width JOINER
 * (U+200D) is kept only between two emoji, where it builds a ZWJ emoji (family, flags...).
 */
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b\u200c\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g;
const PICTO = /\p{Extended_Pictographic}/u;
function stripZwj(s: string): string {
  const cps = Array.from(s);
  return cps.filter((c, i) => {
    if (c !== '\u200d') return true;
    // keep a ZWJ when an emoji (optionally + variation selector / skin tone) is on each side
    let j = i - 1;
    while (j >= 0 && /[\ufe0f\u{1f3fb}-\u{1f3ff}]/u.test(cps[j])) j--;
    return j >= 0 && PICTO.test(cps[j]) && i + 1 < cps.length && PICTO.test(cps[i + 1]);
  }).join('');
}

/** User-perceived characters (grapheme clusters): Intl.Segmenter, else a code-point fallback. */
export function graphemes(s: string): string[] {
  const Seg = (Intl as any).Segmenter;
  if (typeof Seg === 'function') {
    return Array.from(new Seg(undefined, { granularity: 'grapheme' }).segment(s), (x: any) => x.segment as string);
  }
  return fallbackGraphemes(s);
}
/** Fallback: join combining marks, variation selectors, skin tones, ZWJ sequences and flag pairs. */
export function fallbackGraphemes(s: string): string[] {
  const out: string[] = [];
  let joinNext = false;
  for (const c of Array.from(s)) {
    const extend = /[\p{M}\ufe0f\u{1f3fb}-\u{1f3ff}\u{e0020}-\u{e007f}]/u.test(c) || c === '\u200d' || joinNext;
    const flagPair = /\p{Regional_Indicator}/u.test(c) && out.length > 0
      && Array.from(out[out.length - 1]).length === 1 && /\p{Regional_Indicator}/u.test(out[out.length - 1]);
    if (out.length && (extend || flagPair)) out[out.length - 1] += c; else out.push(c);
    joinNext = c === '\u200d';
  }
  return out;
}

/**
 * The nickname as stored and typed: invisible characters stripped, whitespace collapsed,
 * leading space dropped and at most NICKNAME_MAX grapheme clusters (16 emoji fit, a ZWJ emoji
 * is never split). `trimEnd` (default) also drops trailing space; the input keeps it while typing.
 */
export function cleanNickname(raw: string, trimEnd = true): string {
  let s = stripZwj(raw.replace(INVISIBLE, '')).replace(/\s+/g, ' ').replace(/^ /, '');
  s = graphemes(s).slice(0, NICKNAME_MAX).join('');
  return trimEnd ? s.trim() : s;
}

/** The name shown to others / passed to the game: the cleaned nickname, or 'Player' when empty. */
export function displayNickname(raw: string): string {
  return cleanNickname(raw) || DEFAULT_NICKNAME;
}

/** Upper-case letters and digits only, at most ROOM_CODE_MAX. */
export function cleanRoomCode(raw: string): string {
  return codeChars(raw).slice(0, ROOM_CODE_MAX);
}
function codeChars(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
export function isFullRoomCode(code: string): boolean {
  return /^[A-Z0-9]{6}$/.test(code);
}

/**
 * Room-code input after an edit (R10-1): `value` is the field's raw value and `caret` the caret
 * position. Only what was typed is upper-cased / filtered; the caret stays where it was (mapped
 * through the filter); when the code is already full, the characters just typed (left of the
 * caret) are refused instead of dropping the last one.
 */
export function fixRoomCodeInput(value: string, caret: number): { value: string; caret: number } {
  let before = codeChars(value.slice(0, caret));
  const after = codeChars(value.slice(caret)).slice(0, ROOM_CODE_MAX);
  if (before.length + after.length > ROOM_CODE_MAX) before = before.slice(0, Math.max(0, ROOM_CODE_MAX - after.length));
  return { value: before + after, caret: before.length };
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

/** `?room=CODE` (an invite link) pre-fills the join code when it is a full code. */
export function roomFromUrl(search: string): string | null {
  const c = cleanRoomCode(new URLSearchParams(search).get('room') ?? '');
  return isFullRoomCode(c) ? c : null;
}

/** Debug lobby entries: `?lobby=host` / `?lobby=player` (with placeholder players). */
export function lobbyFromUrl(search: string): 'host' | 'player' | null {
  const v = new URLSearchParams(search).get('lobby');
  return v === 'host' || v === 'player' ? v : null;
}

/** The invite link for a room: this page with `?room=CODE`. */
export function inviteLink(code: string, loc: { origin: string; pathname: string } = window.location): string {
  return `${loc.origin}${loc.pathname}?room=${encodeURIComponent(code)}`;
}
