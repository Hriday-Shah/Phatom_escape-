/** Online trial (client side): server URL handling, invite links, pose interpolation. */
import assert from 'node:assert/strict';
import { SERVER_KEY, httpBase, normaliseServer, onlineInviteLink, serverFromUrl } from '../net/serverConfig';
import { GAP_MS, PoseBuffer } from '../net/interpolation';
import { dirOf, poseIntent } from '../net/dirOf';
import { reconcilePose } from '../net/reconcile';

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}

export function runNetTest(): void {
  console.log('Online (client): server config, invite link, interpolation');
  assert.equal(normaliseServer('wss://game-server.example'), 'wss://game-server.example');
  assert.equal(normaliseServer('https://game-server.example/'), 'wss://game-server.example');
  assert.equal(normaliseServer('ws://localhost:2567'), 'ws://localhost:2567');
  assert.equal(normaliseServer('http://127.0.0.1:2567'), 'ws://127.0.0.1:2567');
  assert.equal(normaliseServer('ws://evil.example'), null, 'plain ws only for localhost');
  assert.equal(normaliseServer('javascript:alert(1)'), null);
  assert.equal(normaliseServer('wss://user:pw@x.example'), null);
  assert.equal(normaliseServer(''), null);
  assert.equal(normaliseServer('not a url'), null);
  assert.equal(normaliseServer('wss://x.example/path?q=1#h'), 'wss://x.example/path');

  const st = memStore();
  assert.equal(serverFromUrl('', st), null);
  assert.equal(serverFromUrl('?server=wss%3A%2F%2Fgame.example&room=ABC234', st), 'wss://game.example');
  assert.equal(st.m.get(SERVER_KEY), 'wss://game.example');
  assert.equal(serverFromUrl('?room=ABC234', st), 'wss://game.example', 'remembered for the tab');
  assert.equal(serverFromUrl('?server=', st), null, 'empty ?server= = offline');
  assert.equal(st.m.get(SERVER_KEY), 'off');
  assert.equal(serverFromUrl('', st, 'wss://default.example'), null, 'remembered offline beats the build default');
  assert.equal(serverFromUrl('?server=wss%3A%2F%2Fgame.example', st, 'wss://default.example'), 'wss://game.example', '?server= beats the build default');
  const st2 = memStore();
  assert.equal(serverFromUrl('', st2, 'wss://default.example'), 'wss://default.example', 'build default');
  assert.equal(serverFromUrl('', st2, ''), null, 'empty build default = offline');
  assert.equal(serverFromUrl('', st2, 'javascript:x'), null);
  assert.equal(serverFromUrl('?server=off', st2, 'wss://default.example'), null, '?server=off');
  assert.equal(httpBase('wss://a.example'), 'https://a.example');
  assert.equal(httpBase('ws://localhost:2567'), 'http://localhost:2567');

  const loc = { origin: 'https://hriday-shah.github.io', pathname: '/Phatom_escape-/' };
  assert.equal(onlineInviteLink('ABC234', null, loc), 'https://hriday-shah.github.io/Phatom_escape-/?room=ABC234');
  const link = onlineInviteLink('ABC234', 'wss://game.example', loc);
  assert.equal(link, 'https://hriday-shah.github.io/Phatom_escape-/?server=wss%3A%2F%2Fgame.example&room=ABC234');
  const q = new URL(link).searchParams;
  assert.equal(q.get('server'), 'wss://game.example'); assert.equal(q.get('room'), 'ABC234');

  const b = new PoseBuffer(100);
  assert.equal(b.sample(0), null);
  b.push({ t: 1000, x: 0, y: 0, d: 2, m: 1 });
  b.push({ t: 1080, x: 16, y: 0, d: 2, m: 1 });
  b.push({ t: 1080, x: 99, y: 0, d: 2, m: 1 }); // duplicate time dropped
  assert.deepEqual(b.sample(1100), { t: 1000, x: 0, y: 0, d: 2, m: 1 });
  assert.equal(b.sample(1140)!.x, 8);
  assert.equal(b.sample(1500)!.x, 16, 'holds the newest');
  // after a pause the move starts one step before the new pose (no slow crawl)
  b.push({ t: 1080 + GAP_MS + 500, x: 40, y: 0, d: 2, m: 1 });
  const t = 1080 + GAP_MS + 500;
  assert.equal(b.sample(t - 1000 / 12 + 100)!.x, 16);
  assert.equal(b.sample(t + 100)!.x, 40);

  assert.equal(dirOf(1, 0, { x: 0, y: 1 }), 2);
  assert.equal(dirOf(-1, 0.5, { x: 0, y: 1 }), 1);
  assert.equal(dirOf(0, -1, { x: 0, y: 1 }), 3);
  assert.equal(dirOf(0, 0, { x: 0, y: 1 }), 0);
  assert.equal(dirOf(0, 0, { x: -1, y: 0 }), 1);

  // Held into a wall the stick still walks and faces the stick, not the stopped body.
  assert.deepEqual(poseIntent(0, -1, 0), { d: 3, m: 1 });
  assert.deepEqual(poseIntent(0.2, -1, 2), { d: 3, m: 1 }, 'slide along a table keeps the stick facing');
  assert.deepEqual(poseIntent(1, -0.2, 0), { d: 2, m: 1 });
  assert.deepEqual(poseIntent(0, 0, 2), { d: 2, m: 0 });

  const ack = reconcilePose([{ x: 0, y: 0 }, { x: 10, y: 0 }], { x: 10, y: 0 }, { x: 10, y: 0 });
  assert.equal(ack.dx, 0);
  assert.deepEqual(ack.pending, []);
  const nudge = reconcilePose([{ x: 10, y: 0 }, { x: 20, y: 0 }], { x: 8, y: 0 }, { x: 20, y: 0 });
  assert.equal(nudge.dx, -2);
  assert.deepEqual(nudge.pending, [{ x: 18, y: 0 }]);
  const rewind = reconcilePose([{ x: 10, y: 0 }], { x: 400, y: 0 }, { x: 30, y: 0 });
  assert.equal(rewind.dx, 0, 'a reconnect snapshot far from the last send is not a nudge');
  assert.deepEqual(rewind.pending, [{ x: 10, y: 0 }]);
  const spawn = reconcilePose([], { x: 12, y: 0 }, { x: 10, y: 0 });
  assert.equal(spawn.dx, 2);
  const farSpawn = reconcilePose([], { x: 100, y: 0 }, { x: 10, y: 0 });
  assert.equal(farSpawn.dx, 0);

  console.log('  ✓ server URL, invite link, pose buffer, direction');
}
