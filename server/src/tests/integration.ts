/**
 * Socket-level check against a running server: PE_SERVER=http://localhost:2567 npx tsx src/tests/integration.ts
 * (clients: create / join by code, lobby sync, errors, kick, start, poses, hiding spots incl. sofa /
 * bed, heartbeat, drop + reconnect with late spot state, deliberate leave, host migration).
 */
import assert from 'node:assert/strict';
import { Client, Room } from 'colyseus.js';

const URL_ = process.env.PE_SERVER ?? 'http://localhost:2567';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
function last<T = any>(room: Room, type: string): { get: () => T | undefined } {
  let v: T | undefined; room.onMessage(type, (m: T) => { v = m; });
  return { get: () => v };
}

const a = new Client(URL_), b = new Client(URL_), c = new Client(URL_);
const host = await a.create('house', { nickname: 'Host A', colour: 'violet' });
const hostLobby = last(host, 'lobby'); const hostPoses: any[] = []; host.onMessage('poses', (m) => hostPoses.push(m));
const hostSpot = last(host, 'spot'); ['welcome', 'rejected', 'spots', 'left', 'kicked', 'hb'].forEach((t) => host.onMessage(t, () => {}));
const code = host.roomId;
assert.match(code, /^[A-Z0-9]{6}$/);
const p1 = await b.joinById(code, { nickname: 'Bee', colour: 'violet' });
const p1Lobby = last(p1, 'lobby'); const p1Rej = last(p1, 'rejected'); const p1Welcome = last(p1, 'welcome'); const p1Poses: any[] = []; p1.onMessage('poses', (m) => p1Poses.push(m));
const p1Spots = last(p1, 'spots'); const p1Spot = last(p1, 'spot'); const p1Hb = last(p1, 'hb'); ['left', 'kicked'].forEach((t) => p1.onMessage(t, () => {}));
await wait(300);
let s = p1Lobby.get()!; assert.equal(s.players.length, 2); assert.equal(s.players[0].colour, 'violet'); assert.notEqual(s.players[1].colour, 'violet');
p1.send('colour', { colour: 'violet' }); await wait(200); assert.equal(p1Rej.get().error, 'colour-taken');
p1.send('settings', { patch: { phantoms: 2 } }); await wait(200); assert.equal(p1Rej.get().error, 'not-host');
p1.send('ready', { ready: true }); host.send('settings', { patch: { phantoms: 2 } }); await wait(200);
s = hostLobby.get(); assert.equal(s.players[1].ready, true); assert.equal(s.settings.phantoms, 1); // capped: max(1, players - 1)
// not found
await assert.rejects(c.joinById('ZZZZZZ', {}), (e: any) => /not found/.test(e.message));
// kick
const p2 = await c.joinById(code, { nickname: 'Kicked' }); let kicked = false; let closeCode = 0;
p2.onMessage('kicked', () => { kicked = true; }); ['lobby', 'welcome', 'left'].forEach((t) => p2.onMessage(t, () => {})); p2.onLeave((cc) => { closeCode = cc; });
await wait(200); const kid = hostLobby.get().players.find((p: any) => p.nickname === 'Kicked').id;
host.send('kick', { id: kid }); await wait(300); assert.ok(kicked); assert.equal(closeCode, 4001); assert.equal(hostLobby.get().players.length, 2);
// start, then late join refused
host.send('start', {}); await wait(300); assert.equal(p1Lobby.get().started, true); assert.deepEqual(p1Spots.get(), { open: [] });
const st = await (await fetch(`${URL_}/rooms/${code}`)).json(); assert.equal(st.status, 'started');
await assert.rejects(new Client(URL_).joinById(code, {}), (e: any) => /locked|started/.test(e.message));
// poses + spots
p1.send('pos', { x: 300, y: 300, d: 2, m: 1 }); await wait(200);
p1.send('pos', { x: 310, y: 300, d: 2, m: 1 }); await wait(300);
const seen = hostPoses.flatMap((m) => m.p).filter((p: any) => p[0] === p1Welcome.get().selfId);
assert.ok(seen.length >= 2, JSON.stringify(hostPoses)); assert.equal(seen.at(-1)[1], 310);
host.send('spot', { id: 'kitchen_d1', open: true }); await wait(200);
assert.deepEqual(p1Spot.get(), { id: 'kitchen_d1', open: true, by: hostLobby.get().hostId });
p1.send('spot', { id: 'sofa_d1', open: true }); p1.send('spot', { id: 'bed', open: true }); await wait(200);
assert.equal(hostSpot.get().id, 'bed'); assert.equal(hostSpot.get().open, true);
// heartbeat answered
p1.send('hb', {}); await wait(200); assert.ok(p1Hb.get());
// drop (no consent) -> seat held, others see it away -> reconnect gets the late spot state
const p1Id = p1Welcome.get().selfId; const p1Session = p1.sessionId; const token = p1.reconnectionToken;
p1.connection.close(3999, 'drop'); await wait(400);
assert.equal(hostLobby.get().players.find((p: any) => p.id === p1Id)?.away, true);
host.send('spot', { id: 'sofa_d1', open: false }); host.send('spot', { id: 'study_drawer_2', open: true }); await wait(200);
const back = await new Client(URL_).reconnect(token);
const backSpots = last(back, 'spots'); const backLobby = last(back, 'lobby'); const backWelcome = last(back, 'welcome');
['poses', 'spot', 'left', 'kicked', 'hb'].forEach((t) => back.onMessage(t, () => {}));
await wait(400);
assert.equal(back.sessionId, p1Session); assert.equal(backWelcome.get()?.selfId, p1Id); // same seat
const open = new Set(backSpots.get().open);
assert.ok(open.has('kitchen_d1') && open.has('bed') && !open.has('sofa_d1'), JSON.stringify(backSpots.get()));
assert.equal(backLobby.get().players.find((p: any) => p.id === p1Id)?.away, false);
// host migration
await host.leave(); await wait(300); // deliberate: removed at once, no seat kept
s = backLobby.get(); assert.equal(s.players.length, 1); assert.equal(s.hostId, p1Id);
await back.leave(); await wait(300);
const gone = await (await fetch(`${URL_}/rooms/${code}`)).json(); assert.equal(gone.status, 'missing'); // closed once everyone left
console.log('✅ integration ok', code);
process.exit(0);
