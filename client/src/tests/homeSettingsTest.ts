/** Homepage settings: nickname / room code cleaning, persistence, and the QA skip rule. */
import {
  NICKNAME_MAX, cleanNickname, cleanRoomCode, displayNickname, fallbackGraphemes, fixNicknameInput, fixRoomCodeInput, graphemes,
  inviteLink, isFullRoomCode, loadNickname, loadSoundOn, lobbyFromUrl, roomFromUrl, saveNickname, saveSoundOn, skipsHome,
} from '../home/settings';

export function runHomeSettingsTest(): void {
  console.log('\n=== HOME SETTINGS TEST ===');
  const errors: string[] = [];
  const eq = (got: unknown, want: unknown, what: string) => { if (got !== want) errors.push(`${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); };
  eq(cleanNickname('  Hri\u0007day   S  '), 'Hriday S', 'nickname trims / strips control chars');
  eq(Array.from(cleanNickname('x'.repeat(40))).length, NICKNAME_MAX, 'nickname max length');
  eq(cleanNickname('👻'.repeat(20)), '👻'.repeat(NICKNAME_MAX), 'nickname counts emoji as one');
  // R10-2: 16 grapheme clusters, ZWJ emoji never split, decomposed accents count once.
  const family = '👨\u200d👩\u200d👧\u200d👦';
  eq(cleanNickname(family.repeat(20)), family.repeat(16), '16 ZWJ family emoji fit, none split');
  eq(cleanNickname('Hriday' + '😀'.repeat(12)), 'Hriday' + '😀'.repeat(10), 'name + emoji: 16 graphemes');
  eq(cleanNickname('e\u0301'.repeat(20)), 'e\u0301'.repeat(16), 'decomposed é counts once');
  eq(cleanNickname('🇮🇳'.repeat(20)), '🇮🇳'.repeat(16), 'flags count once');
  eq(cleanNickname('👍🏽'.repeat(17)), '👍🏽'.repeat(16), 'skin tones count once');
  for (const [str, n] of [[family + 'ab', 3], ['e\u0301x', 2], ['🇮🇳🇬🇧', 2], ['👍🏽👍', 2], ['🏳️\u200d🌈x', 2]] as const) {
    eq(graphemes(str).length, n, `graphemes(${JSON.stringify(str)})`);
    eq(fallbackGraphemes(str).length, n, `fallback graphemes(${JSON.stringify(str)})`);
  }
  // Bidi / zero-width stripped (ZWJ kept only inside emoji).
  eq(cleanNickname('\u202eevil\u202c\u2066x\u2069\u200by\u200cz\u200e\u200f\ufeff\u2060\u00ad!'), 'evilxyz!', 'bidi / zero-width stripped');
  eq(cleanNickname('a\u200db'), 'ab', 'stray ZWJ stripped');
  eq(cleanNickname(' \u200b '), '', 'invisible-only name is empty');
  // Trim; empty -> 'Player'.
  eq(displayNickname('   '), 'Player', 'empty nickname -> Player');
  eq(displayNickname('\u202e\u200b'), 'Player', 'invisible nickname -> Player');
  eq(displayNickname('  Ghost  '), 'Ghost', 'nickname trimmed');
  eq(cleanNickname('Ghost ', false), 'Ghost ', 'typing keeps a trailing space');
  eq(cleanRoomCode('ab-12 c9z'), 'AB12C9', 'room code upper-case, letters/digits, max 6');
  // R10-1: caret kept on mid-string edits; a full code refuses what's typed, keeps its tail.
  // R11-3: a full nickname refuses new graphemes, keeps the caret, never drops the last one.
  const fn = (v: string, c: number) => JSON.stringify(fixNicknameInput(v, c));
  eq(fn('ABCZDEFGHIJKLMNOP', 4), JSON.stringify({ value: 'ABCDEFGHIJKLMNOP', caret: 3 }), 'full nickname: Z after C refused');
  eq(fn('ABCDEFGHIJKLMNOPQ', 17), JSON.stringify({ value: 'ABCDEFGHIJKLMNOP', caret: 16 }), 'full nickname: typing at the end refused');
  eq(fn('ABCDEFGHIJKLMNO', 15), JSON.stringify({ value: 'ABCDEFGHIJKLMNO', caret: 15 }), '15 chars untouched');
  eq(fn('AB12345CDEFGHIJKLMNOP', 7), JSON.stringify({ value: 'ABCDEFGHIJKLMNOP', caret: 2 }), 'paste into a full name refused');
  eq(fn('ABxyCD', 4), JSON.stringify({ value: 'ABxyCD', caret: 4 }), 'mid insert keeps caret');
  eq(fn('AB\u200bCD', 3), JSON.stringify({ value: 'ABCD', caret: 2 }), 'zero-width stripped, caret mapped');
  const e16 = '😀'.repeat(16);
  eq(fn('😀'.repeat(3) + '🙂' + '😀'.repeat(13), 8), JSON.stringify({ value: e16, caret: 6 }), 'full emoji name: insert refused, caret after 3 emoji');
  const fam = '👨‍👩‍👧‍👦';
  eq(fixNicknameInput(fam.repeat(16) + 'x', fam.length * 16 + 1).value, fam.repeat(16), 'full ZWJ-family name refuses x, families intact');
  eq(fn(' lead', 1), JSON.stringify({ value: 'lead', caret: 0 }), 'leading space dropped');
  eq(fn('a  b', 2), JSON.stringify({ value: 'a b', caret: 2 }), 'double space at the caret collapsed');
  const fx = (v: string, c: number) => JSON.stringify(fixRoomCodeInput(v, c));
  eq(fx('AxyBCD', 3), JSON.stringify({ value: 'AXYBCD', caret: 3 }), 'typing "xy" after A: AXYBCD, caret 3');
  eq(fx('A-BCD', 2), JSON.stringify({ value: 'ABCD', caret: 1 }), 'typed "-" dropped, caret stays');
  eq(fx('ABZCDEF', 3), JSON.stringify({ value: 'ABCDEF', caret: 2 }), 'full: typed Z refused, last char kept');
  eq(fx('ABCDEFG', 7), JSON.stringify({ value: 'ABCDEF', caret: 6 }), 'full: typing at the end refused');
  eq(fx('abc', 3), JSON.stringify({ value: 'ABC', caret: 3 }), 'lower-case upper-cased');
  eq(fx('ab12cd34', 8), JSON.stringify({ value: 'AB12CD', caret: 6 }), 'paste capped at 6');
  eq(fx('ABCD', 1), JSON.stringify({ value: 'ABCD', caret: 1 }), 'unchanged value keeps caret');
  // Join only with a full code; ?room= link pre-fills it.
  eq(isFullRoomCode('ABC12'), false, '5 chars is not a full code'); eq(isFullRoomCode('ABC123'), true, '6 chars is a full code');
  eq(roomFromUrl('?room=abc123'), 'ABC123', '?room= pre-fills the join code'); eq(roomFromUrl('?room=abc'), null, 'short ?room= ignored');
  eq(inviteLink('ABC123', { origin: 'https://x.io', pathname: '/Phatom_escape-/' }), 'https://x.io/Phatom_escape-/?room=ABC123', 'invite link');
  eq(lobbyFromUrl('?lobby=host'), 'host', '?lobby=host'); eq(lobbyFromUrl('?lobby=player'), 'player', '?lobby=player'); eq(lobbyFromUrl('?lobby=x'), null, '?lobby=x ignored');
  eq(skipsHome('?lobby=host'), false, '?lobby= shows the lobby, not the game'); eq(skipsHome('?room=ABC123'), false, '?room= shows the homepage');
  const mem = new Map<string, string>();
  const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  eq(loadNickname(store), '', 'no nickname yet');
  saveNickname('  Ghost  ', store); eq(loadNickname(store), 'Ghost', 'nickname persists');
  eq(loadSoundOn(store), true, 'sound on by default');
  saveSoundOn(false, store); eq(loadSoundOn(store), false, 'sound off persists');
  saveSoundOn(true, store); eq(loadSoundOn(store), true, 'sound on persists');
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  eq(loadNickname(broken), '', 'blocked storage: empty nickname'); eq(loadSoundOn(broken), true, 'blocked storage: sound on');
  saveNickname('x', broken); saveSoundOn(false, broken);
  for (const q of ['?debug=1', '?debug=unlock,nolight', '?spawn=kitchen&debug=1', '?spawn=kitchen', '?play']) eq(skipsHome(q), true, `skip ${q}`);
  for (const q of ['', '?', '?foo=1', '?cb=123']) eq(skipsHome(q), false, `homepage for "${q}"`);
  if (errors.length) { errors.forEach((e) => console.log('✗ ' + e)); throw new Error('Home settings test failed'); }
  console.log('✓ R10: 16 grapheme nicknames (emoji / ZWJ / accents / flags), bidi + zero-width stripped, empty -> Player; room-code caret kept and full code refuses typing; join needs 6; ?room / ?lobby;');
  console.log('✓ nickname / room code cleaning, localStorage persistence (incl. blocked storage), ?debug / ?spawn / ?play skip the homepage');
  console.log('✅ HOME SETTINGS TEST PASSED');
}
