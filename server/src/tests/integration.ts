/**
 * Socket-level check against a running server: PE_SERVER=http://localhost:2567 npx tsx src/tests/integration.ts
 * (two clients: create / join by code, lobby sync, errors, kick, start, poses, drawers).
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
const hostDrawer = last(host, 'drawer'); ['welcome', 'rejected', 'drawers', 'left', 'kicked'].forEach((t) => host.onMessage(t, () => {}));
const code = host.roomId;
assert.match(code, /^[A-Z0-9]{6}$/);
const p1 = await b.joinById(code, { nickname: 'Bee', colour: 'violet' });
const p1Lobby = last(p1, 'lobby'); const p1Rej = last(p1, 'rejected'); const p1Welcome = last(p1, 'welcome'); const p1Poses: any[] = []; p1.onMessage('poses', (m) => p1Poses.push(m));
const p1Drawers = last(p1, 'drawers'); const p1Drawer = last(p1, 'drawer'); ['left', 'kicked'].forEach((t) => p1.onMessage(t, () => {}));
await wait(300);
let s = p1Lobby.get()!; assert.equal(s.players.length, 2); assert.equal(s.players[0].colour, 'violet'); assert.notEqual(s.players[1].colour, 'violet');
p1.send('colour', { colour: 'violet' }); await wait(200); assert.equal(p1Rej.get().error, 'colour-taken');
p1.send('settings', { patch: { phantoms: 2 } }); await wait(200); assert.equal(p1Rej.get().error, 'not-host');
p1.send('ready', { ready: true }); host.send('settings', { patch: { phantoms: 2 } }); await wait(200);
s = hostLobby.get(); assert.equal(s.players[1].ready, true); assert.equal(s.settings.phantoms, 2);
// not found
await assert.rejects(c.joinById('ZZZZZZ', {}), (e: any) => /not found/.test(e.message));
// kick
const p2 = await c.joinById(code, { nickname: 'Kicked' }); let kicked = false; let closeCode = 0;
p2.onMessage('kicked', () => { kicked = true; }); ['lobby', 'welcome', 'left'].forEach((t) => p2.onMessage(t, () => {})); p2.onLeave((cc) => { closeCode = cc; });
await wait(200); const kid = hostLobby.get().players.find((p: any) => p.nickname === 'Kicked').id;
host.send('kick', { id: kid }); await wait(300); assert.ok(kicked); assert.equal(closeCode, 4001); assert.equal(hostLobby.get().players.length, 2);
// start, then late join refused
host.send('start', {}); await wait(300); assert.equal(p1Lobby.get().started, true); assert.deepEqual(p1Drawers.get(), { open: [] });
const st = await (await fetch(`${URL_}/rooms/${code}`)).json(); assert.equal(st.status, 'started');
await assert.rejects(new Client(URL_).joinById(code, {}), (e: any) => /locked|started/.test(e.message));
// poses + drawers
p1.send('pos', { x: 300, y: 300, d: 2, m: 1 }); await wait(200);
p1.send('pos', { x: 310, y: 300, d: 2, m: 1 }); await wait(300);
const seen = hostPoses.flatMap((m) => m.p).filter((p: any) => p[0] === p1Welcome.get().selfId);
assert.ok(seen.length >= 2, JSON.stringify(hostPoses)); assert.equal(seen.at(-1)[1], 310);
host.send('drawer', { id: 'kitchen_d1', open: true }); await wait(200);
assert.deepEqual(p1Drawer.get(), { id: 'kitchen_d1', open: true, by: hostLobby.get().hostId });
// host migration
await host.leave(); await wait(300);
s = p1Lobby.get(); assert.equal(s.players.length, 1); assert.equal(s.hostId, p1Welcome.get().selfId);
await p1.leave(); await wait(300);
const h = await (await fetch(`${URL_}/health`)).json(); assert.equal(h.rooms, 0);
void hostDrawer;
console.log('✅ integration ok', code);
process.exit(0);
