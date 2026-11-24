/** Placeholder lobby logic: colours unique, kick, host-only settings / start, ready, leave. */
import { DEFAULT_SETTINGS, LobbyRoom, LocalLobbyService, MAX_PLAYERS, PLAYER_COLOURS, SETTING_LIMITS, makeRoomCode } from '../lobby/lobby';

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
  room.state.players.forEach((p) => room.setReady(p.id, true)); t(room.allReady(), 'all ready');
  // Settings only by the host, validated.
  const r2 = room.updateSettings(a, { roundMinutes: 10 });
  t(!r2.ok && r2.error === 'not-host' && room.state.settings.roundMinutes === DEFAULT_SETTINGS.roundMinutes, 'player cannot change settings');
  t(room.updateSettings(host, { roundMinutes: 10, phantoms: 2, drawerNoise: 'loud', hideSeconds: 45 }).ok, 'host changes settings');
  t(room.state.settings.roundMinutes === 10 && room.state.settings.phantoms === 2 && room.state.settings.drawerNoise === 'loud', 'settings applied');
  t(!room.updateSettings(host, { roundMinutes: SETTING_LIMITS.roundMinutes.max + 1 }).ok, 'out-of-range refused');
  t(!room.updateSettings(host, { hideSeconds: 20 }).ok, 'off-step refused');
  t(!room.updateSettings(host, { drawerNoise: 'deafening' as any }).ok, 'unknown noise refused');
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
  t(svc.setColour('pink').ok && svc.getState().players[0].colour === 'pink' && changes === 1, 'setColour notifies');
  t(!svc.setColour(st.players[1].colour).ok, 'service refuses a taken colour');
  t(svc.kick(st.players[2].id).ok && svc.getState().players.length === 2, 'service kick');
  t(svc.updateSettings({ phantoms: 3 }).ok, 'service host settings');
  st.players[0].nickname = 'mutated'; t(svc.getState().players[0].nickname === 'Me', 'getState returns copies');
  off(); svc.setReady(true); t(changes === 4, 'unsubscribe stops notifications');
  const ply = LocalLobbyService.joinLocal('<b>Me</b>', 'JOIN42', { placeholders: 1 });
  const ps = ply.getState();
  t(ps.selfId !== ps.hostId && ps.code === 'JOIN42' && ps.players.length === 3, 'player service: placeholder host + 1 + me');
  t(!ply.updateSettings({ roundMinutes: 5 }).ok, 'player service cannot change settings');
  t(!ply.start().ok && !ply.kick(ps.hostId).ok, 'player service cannot start or kick');
  t(ply.setReady(true).ok && ply.getState().players.find((p) => p.id === ps.selfId)!.ready, 'player ready');
  ply.leave(); t(!ply.getState().players.some((p) => p.id === ps.selfId) && !ply.setReady(false).ok, 'leave removes me; no actions after');
  t(/^[A-HJ-NP-Z2-9]{6}$/.test(makeRoomCode()), 'room code: 6 chars, no lookalikes');

  if (errors.length) { errors.forEach((e) => console.log('✗ ' + e)); throw new Error(`Lobby test failed with ${errors.length} problem(s)`); }
  console.log('✓ colours unique (8 max, taken refused, freed on kick), ready, settings and start host-only and validated, kick rules, host hand-over, service notifies');
  console.log('✅ LOBBY TEST PASSED');
}
