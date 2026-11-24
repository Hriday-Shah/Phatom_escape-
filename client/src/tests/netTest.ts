/** Online trial (client side): server URL handling, invite links, pose interpolation. */
import assert from 'node:assert/strict';
import { SERVER_KEY, httpBase, normaliseServer, onlineInviteLink, serverFromUrl } from '../net/serverConfig';
import { GAP_MS, PoseBuffer } from '../net/interpolation';
import { dirOf } from '../net/dirOf';

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}

export function runNetTest(): void {
  console.log('Online (client): server config, invite link, interpolation');
  assert.equal(normaliseServer('wss://abc-def.trycloudflare.com'), 'wss://abc-def.trycloudflare.com');
  assert.equal(normaliseServer('https://abc-def.trycloudflare.com/'), 'wss://abc-def.trycloudflare.com');
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
  assert.equal(serverFromUrl('?server=wss%3A%2F%2Fa.trycloudflare.com&room=ABC234', st), 'wss://a.trycloudflare.com');
  assert.equal(st.m.get(SERVER_KEY), 'wss://a.trycloudflare.com');
  assert.equal(serverFromUrl('?room=ABC234', st), 'wss://a.trycloudflare.com', 'remembered for the tab');
  assert.equal(serverFromUrl('?server=', st), null, 'empty ?server= forgets it (offline)');
  assert.equal(st.m.has(SERVER_KEY), false);
  assert.equal(httpBase('wss://a.example'), 'https://a.example');
  assert.equal(httpBase('ws://localhost:2567'), 'http://localhost:2567');

  const loc = { origin: 'https://hriday-shah.github.io', pathname: '/Phatom_escape-/' };
  assert.equal(onlineInviteLink('ABC234', null, loc), 'https://hriday-shah.github.io/Phatom_escape-/?room=ABC234');
  const link = onlineInviteLink('ABC234', 'wss://a.trycloudflare.com', loc);
  assert.equal(link, 'https://hriday-shah.github.io/Phatom_escape-/?server=wss%3A%2F%2Fa.trycloudflare.com&room=ABC234');
  const q = new URL(link).searchParams;
  assert.equal(q.get('server'), 'wss://a.trycloudflare.com'); assert.equal(q.get('room'), 'ABC234');

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
  console.log('  ✓ server URL, invite link, pose buffer, direction');
}
