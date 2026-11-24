/** Homepage settings: nickname / room code cleaning, persistence, and the QA skip rule. */
import {
  NICKNAME_MAX, cleanNickname, cleanRoomCode, loadNickname, loadSoundOn, saveNickname, saveSoundOn, skipsHome,
} from '../home/settings';

export function runHomeSettingsTest(): void {
  console.log('\n=== HOME SETTINGS TEST ===');
  const errors: string[] = [];
  const eq = (got: unknown, want: unknown, what: string) => { if (got !== want) errors.push(`${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); };
  eq(cleanNickname('  Hri\u0007day   S  '), 'Hriday S', 'nickname trims / strips control chars');
  eq(Array.from(cleanNickname('x'.repeat(40))).length, NICKNAME_MAX, 'nickname max length');
  eq(cleanNickname('👻'.repeat(20)), '👻'.repeat(NICKNAME_MAX), 'nickname counts emoji as one');
  eq(cleanRoomCode('ab-12 c9z'), 'AB12C9', 'room code upper-case, letters/digits, max 6');
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
  console.log('✓ nickname / room code cleaning, localStorage persistence (incl. blocked storage), ?debug / ?spawn / ?play skip the homepage');
  console.log('✅ HOME SETTINGS TEST PASSED');
}
