/** Placeholder lobby logic: colours unique, kick, host-only settings / start, ready, leave. */
import { DEFAULT_SETTINGS, LobbyRoom, LocalLobbyService, MAX_PLAYERS, NUMERIC_SETTINGS, PLACEHOLDER_HOST_NAME, PLAYER_COLOURS, SETTING_LIMITS, clampSetting, makeRoomCode, validSettings, hoodieTint, DEFAULT_HOODIE_TINT, maxPhantoms, parseSettingInput, placeholderName } from '../lobby/lobby';

export function runLobbyTest(): void {
  console.log('\n=== LOBBY TEST ===');
  const errors: string[] = [];
  const t = (cond: boolean, what: string) => { if (!cond) errors.push(what); };

  const room = new LobbyRoom('ABC123', 'Host');
  const host = room.hostId;
  const a = room.add('A').id, b = room.add('B').id;
  const colours = () => room.state.players.map((p) => p.colour);
  t(new Set(colours()).size === 3, 'new players get distinct colours');
  t(room.state.players[0].colour === 'cyan' && room.state.players[1].colour === 'orange', 'first free colours in order');
  // Colour uniqueness.
  const r1 = room.setColour(a, 'cyan');
  t(!r1.ok && r1.error === 'colour-taken', 'taken colour refused');
  t(room.setColour(a, 'pink').ok && room.state.players[1].colour === 'pink', 'free colour accepted');
  t(room.setColour(b, 'orange').ok, 'released colour can be taken');
  t(new Set(colours()).size === colours().length, 'colours stay unique');
  t(!room.freeColours().includes('pink') && room.freeColours().length === 5, 'freeColours excludes taken');
  // Fill the room: 8 players max, all distinct colours.
  for (let i = room.state.players.length; i < MAX_PLAYERS; i++) room.add(`P${i}`);
  t(new Set(colours()).size === PLAYER_COLOURS.length, '8 players, 8 distinct colours');
  let full = false; try { room.add('extra'); } catch { full = true; }
  t(full, 'a 9th player is refused');
  // Ready.
  t(room.setReady(a, true).ok && room.state.players.find((p) => p.id === a)!.ready, 'ready on');
  t(room.setReady(a, false).ok && !room.state.players.find((p) => p.id === a)!.ready, 'ready off');
  t(!room.allReady(), 'not all ready');
  room.state.players.forEach((p) => room.setReady(p.id, p.id !== host)); t(room.allReady(), 'host not counted: Start needs no host Ready');
  room.setReady(a, false);
  room.state.players.forEach((p) => room.setReady(p.id, true)); t(room.allReady(), 'all ready');
  // Settings: defaults and ranges as specified.
  const spec: Record<string, [number, number, number]> = {
    hidingMinutes: [5, 1, 10], searchMinutes: [5, 1, 10], chaseMinutes: [20, 5, 40], stunSeconds: [30, 10, 60],
    reloadMinutes: [5, 1, 10], sneakSeconds: [10, 5, 20], sneakCooldownSeconds: [30, 10, 90], phantoms: [1, 1, 3],
  };
  t(NUMERIC_SETTINGS.length === Object.keys(spec).length, 'eight numeric settings');
  for (const d of NUMERIC_SETTINGS) {
    const [def, min, max] = spec[d.key] ?? [NaN, NaN, NaN];
    t(d.default === def && d.min === min && d.max === max, `${d.key}: default ${def}, ${min}-${max} (got ${d.default}, ${d.min}-${d.max})`);
    t((DEFAULT_SETTINGS as any)[d.key] === def, `${d.key} default in DEFAULT_SETTINGS`);
    t((d.max - d.min) % d.step === 0 && d.default === clampSetting(d, d.default), `${d.key}: range is a whole number of steps`);
  }
  t(DEFAULT_SETTINGS.drawerNoise === 'normal', 'drawer noise default normal');
  // Clamping to the ranges (and snapping to the step).
  const cl = (patch: object) => validSettings(DEFAULT_SETTINGS, patch as any);
  t(cl({ chaseMinutes: 99 })?.chaseMinutes === 40 && cl({ chaseMinutes: 0 })?.chaseMinutes === 5, 'chase clamped to 5-40');
  t(cl({ hidingMinutes: -3 })?.hidingMinutes === 1 && cl({ searchMinutes: 11 })?.searchMinutes === 10, 'hiding / search clamped to 1-10');
  t(cl({ stunSeconds: 5 })?.stunSeconds === 10 && cl({ stunSeconds: 61 })?.stunSeconds === 60 && cl({ stunSeconds: 33 })?.stunSeconds === 35, 'stun clamped to 10-60, snapped to 5 s');
  t(cl({ reloadMinutes: 1e9 })?.reloadMinutes === 10 && cl({ reloadMinutes: 2.4 })?.reloadMinutes === 2, 'reload clamped and rounded');
  t(cl({ sneakSeconds: 1 })?.sneakSeconds === 5 && cl({ sneakSeconds: 25 })?.sneakSeconds === 20, 'sneak clamped to 5-20');
  t(cl({ sneakCooldownSeconds: 0 })?.sneakCooldownSeconds === 10 && cl({ sneakCooldownSeconds: 500 })?.sneakCooldownSeconds === 90, 'sneak cooldown clamped to 10-90');
  t(cl({ phantoms: 7 })?.phantoms === 3 && cl({ phantoms: 0 })?.phantoms === 1, 'phantoms clamped to 1-3');
  t(cl({ stunSeconds: NaN }) === null && cl({ stunSeconds: Infinity }) === null && cl({ stunSeconds: '30' }) === null, 'non-numbers refused');
  t(cl({ drawerNoise: 'deafening' }) === null && cl({ bogus: 1 }) === null, 'unknown noise / key refused');
  // Settings only by the host.
  const r2 = room.updateSettings(a, { chaseMinutes: 30 });
  t(!r2.ok && r2.error === 'not-host' && room.state.settings.chaseMinutes === DEFAULT_SETTINGS.chaseMinutes, 'player cannot change settings');
  t(room.updateSettings(host, { chaseMinutes: 30, phantoms: 2, drawerNoise: 'loud', stunSeconds: 45, sneakCooldownSeconds: 60 }).ok, 'host changes settings');
  const ss = room.state.settings;
  t(ss.chaseMinutes === 30 && ss.phantoms === 2 && ss.drawerNoise === 'loud' && ss.stunSeconds === 45 && ss.sneakCooldownSeconds === 60 && ss.hidingMinutes === 5, 'settings applied, others unchanged');
  t(room.updateSettings(host, { chaseMinutes: SETTING_LIMITS.chaseMinutes.max + 10 }).ok && room.state.settings.chaseMinutes === 40, 'host out-of-range value clamped');
  t(!room.updateSettings(host, { drawerNoise: 'deafening' as any }).ok && room.state.settings.drawerNoise === 'loud', 'unknown noise refused, state unchanged');
  // Kick: host only, not self.
  const r3 = room.kick(a, b); t(!r3.ok && r3.error === 'not-host', 'player cannot kick');
  const r4 = room.kick(host, host); t(!r4.ok && r4.error === 'cannot-kick-self', 'host cannot kick self');
  const n = room.state.players.length;
  t(room.kick(host, b).ok && room.state.players.length === n - 1 && !room.state.players.some((p) => p.id === b), 'host kicks');
  t(!room.kick(host, b).ok, 'kicking twice fails');
  t(room.freeColours().length === 1, "a kicked player's colour is free again");
  // Start: host only.
  t(!room.start(a).ok && !room.state.started, 'player cannot start');
  t(room.start(host).ok && room.state.started, 'host starts');
  // Host leaving hands over.
  const room2 = new LobbyRoom('XYZ789', 'H'); const c = room2.add('C').id;
  room2.leave(room2.hostId); t(room2.hostId === c && room2.state.players[0].isHost, 'host leaves -> next player is host');

  // Service (what the screen uses): acts as self, notifies, local placeholders.
  const svc = LocalLobbyService.create('Me', { code: 'ROOM01', placeholders: 2 });
  let changes = 0; const off = svc.onChange(() => changes++);
  const st = svc.getState();
  t(st.players.length === 3 && st.selfId === st.hostId && st.players.filter((p) => p.placeholder).length === 2, 'host service with 2 placeholders');
  t(!svc.allReady(), 'service: one placeholder is not ready');
  t(svc.setColour('pink').ok && svc.getState().players[0].colour === 'pink' && changes === 1, 'setColour notifies');
  t(!svc.setColour(st.players[1].colour).ok, 'service refuses a taken colour');
  t(svc.kick(st.players[2].id).ok && svc.getState().players.length === 2, 'service kick');
  t(svc.allReady(), 'service: kicking the unready player -> all ready');
  t(svc.updateSettings({ phantoms: 3 }).ok, 'service host settings'); t(svc.getState().players.every((p) => !p.placeholder || p.nickname.startsWith('Demo player')), 'host-side demo names');
  st.players[0].nickname = 'mutated'; t(svc.getState().players[0].nickname === 'Me', 'getState returns copies');
  off(); svc.setReady(true); t(changes === 4, 'unsubscribe stops notifications');
  const ply = LocalLobbyService.joinLocal('<b>Me</b>', 'JOIN42', { placeholders: 1 });
  const ps = ply.getState();
  t(ps.selfId !== ps.hostId && ps.code === 'JOIN42' && ps.players.length === 3, 'player service: placeholder host + 1 + me');
  t(!ply.updateSettings({ hidingMinutes: 3 }).ok && ply.getState().settings.hidingMinutes === 5, 'player service cannot change settings');
  t(ps.players[0].nickname === PLACEHOLDER_HOST_NAME && PLACEHOLDER_HOST_NAME === 'Demo host' && ps.players[1].nickname.startsWith('Demo player'), 'demo placeholder names');
  t(!ply.start().ok && !ply.kick(ps.hostId).ok, 'player service cannot start or kick');
  t(ply.setReady(true).ok && ply.getState().players.find((p) => p.id === ps.selfId)!.ready, 'player ready');
  ply.leave(); t(!ply.getState().players.some((p) => p.id === ps.selfId) && !ply.setReady(false).ok, 'leave removes me; no actions after');
  // Hoodie tint from the registry colour.
  t(hoodieTint('orange') === 0xf28c28 && hoodieTint('silver') === 0xa9b4c8, 'hoodie tint from lobby colour');
  t(hoodieTint(null) === DEFAULT_HOODIE_TINT && hoodieTint(undefined) === 0x5fd3e6 && hoodieTint('mauve') === 0x5fd3e6, 'no / unknown colour -> default cyan');
  t(/^[A-HJ-NP-Z2-9]{6}$/.test(makeRoomCode()), 'room code: 6 chars, no lookalikes');

  // ---- R11 ----
  // R11-2: the host is always ready; count / confirm consider only the other players.
  const solo = LocalLobbyService.create('Solo');
  t(solo.allReady() && solo.getState().players[0].ready, 'R11-2 host alone: ready, starts without asking');
  t(solo.setReady(false).ok && solo.getState().players[0].ready, 'R11-2 host Ready toggle is a no-op');
  const hr = LocalLobbyService.create('H', { placeholders: 2 });
  t(!hr.allReady() && hr.getState().players[0].ready, 'R11-2 host ready, a placeholder not -> confirm');
  // R11-5 Phantoms cap = max(1, players - 1), re-clamped on join / leave / kick / edit.
  t(maxPhantoms(0) === 1 && maxPhantoms(1) === 1 && maxPhantoms(2) === 1 && maxPhantoms(3) === 2 && maxPhantoms(4) === 3 && maxPhantoms(8) === 3, 'maxPhantoms');
  const cp = LocalLobbyService.create('H', { placeholders: 3 }); // 4 players -> cap 3
  t(cp.updateSettings({ phantoms: 3 }).ok && cp.getState().settings.phantoms === 3, 'cap: 4 players allow 3 Phantoms');
  const ids = cp.getState().players.map((p) => p.id);
  cp.kick(ids[3]); t(cp.getState().settings.phantoms === 2, 'cap: kick to 3 players -> 2 Phantoms');
  cp.kick(ids[2]); t(cp.getState().settings.phantoms === 1, 'cap: 2 players -> 1 Phantom');
  t(cp.updateSettings({ phantoms: 3 }).ok && cp.getState().settings.phantoms === 1, 'cap: asking for 3 with 2 players gives 1');
  const one = LocalLobbyService.create('H');
  t(one.updateSettings({ phantoms: 2 }).ok && one.getState().settings.phantoms === 1, 'cap: host alone -> 1');
  const jp = LocalLobbyService.joinLocal('Me', 'CAP123', { placeholders: 2 }); // 4 players
  t(jp.getState().players.length === 4, 'joinLocal 4 players');
  const room4 = new LobbyRoom('CAP999', 'H'); room4.add('a'); room4.add('b'); room4.add('c');
  room4.updateSettings(room4.hostId, { phantoms: 3 }); room4.leave(room4.state.players[3].id); room4.capPhantoms();
  t(room4.state.settings.phantoms === 2, 'LobbyRoom.capPhantoms after a leave');
  // Empty / invalid setting input reverts (null), never clamps '' -> 0 -> min.
  t(parseSettingInput('') === null && parseSettingInput('  ') === null && parseSettingInput('abc') === null && parseSettingInput('Infinity') === null && parseSettingInput(undefined) === null, 'parseSettingInput rejects empty / junk');
  t(parseSettingInput('7') === 7 && parseSettingInput('2.5') === 2.5, 'parseSettingInput numbers');
  const rv = LocalLobbyService.create('H'); rv.updateSettings({ chaseMinutes: 30 });
  t(!rv.updateSettings({ chaseMinutes: Number.NaN }).ok && rv.getState().settings.chaseMinutes === 30, 'invalid value refused, previous kept');
  // Unique placeholder names.
  t(placeholderName([]) === 'Demo player 2' && placeholderName(['Demo player 2', 'Demo player 3']) === 'Demo player 4' && placeholderName(['Demo player 3']) === 'Demo player 2', 'placeholderName');
  const many = LocalLobbyService.create('Demo player 2', { placeholders: 7 });
  const nm = many.getState().players.map((p) => p.nickname);
  t(nm.length === 8 && new Set(nm).size === 8, `7 placeholders: unique names ${JSON.stringify(nm)}`);
  const mj = LocalLobbyService.joinLocal('Me', 'MANY12', { placeholders: 6 }).getState().players.map((p) => p.nickname);
  t(new Set(mj).size === mj.length && mj.length === 8, 'joinLocal: unique names');

  if (errors.length) { errors.forEach((e) => console.log('✗ ' + e)); throw new Error(`Lobby test failed with ${errors.length} problem(s)`); }
  console.log('✓ R11: host always ready, Phantoms cap + re-clamp, invalid input reverts, unique demo names; settings defaults, ranges and clamping; colours unique (8 max, taken refused, freed on kick), ready, settings and start host-only and validated, kick rules, host hand-over, service notifies');
  console.log('✅ LOBBY TEST PASSED');
}
