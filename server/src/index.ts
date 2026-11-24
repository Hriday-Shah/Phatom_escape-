/**
 * Phantom Escape game server (stage 2). Plain Node http server + Colyseus over WebSocket.
 *   GET /health        -> {ok, rooms, players, uptime}
 *   GET /rooms/CODE    -> {status: 'open' | 'full' | 'started' | 'missing'} (friendly join errors)
 *   /matchmake/...     -> Colyseus (create 'house', joinById CODE)
 * Env: PORT (default 2567), ALLOWED_ORIGINS (origins.ts), RECONNECT_SECONDS (default 45).
 * SIGTERM / SIGINT: graceful shutdown (rooms are disposed, clients get a clean close).
 */
import http from 'node:http';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { HouseRoom, ROOMS } from './HouseRoom';
import { originAllowed } from './origins';
import { MAX_PLAYERS } from '../../client/src/lobby/lobby';

const PORT = Number(process.env.PORT ?? 2567);
const started = Date.now();

function cors(req: http.IncomingMessage): Record<string, string> {
  const origin = req.headers.origin;
  if (!origin || !originAllowed(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'OPTIONS, POST, GET',
    'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
    'Access-Control-Max-Age': '600',
    // Chrome's Private Network Access: lets the Pages site reach a server on localhost / LAN.
    'Access-Control-Allow-Private-Network': 'true',
    Vary: 'Origin',
  };
}

// Colyseus' matchmaking routes use this for their CORS headers (default would echo any origin).
matchMaker.controller.getCorsHeaders = (req: http.IncomingMessage) => cors(req) as any;

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname.startsWith('/matchmake')) return; // handled by Colyseus
  const json = (code: number, body: unknown) => {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors(req) });
    res.end(JSON.stringify(body));
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors(req)).end(); return; }
  if (url.pathname === '/health') {
    let players = 0; for (const r of ROOMS.values()) players += r.size;
    return json(200, { ok: true, rooms: ROOMS.size, players, uptime: Math.round((Date.now() - started) / 1000) });
  }
  const m = /^\/rooms\/([A-Z0-9]{6})$/.exec(url.pathname);
  if (m) {
    const r = ROOMS.get(m[1]);
    return json(200, { status: !r ? 'missing' : r.started ? 'started' : r.size >= MAX_PLAYERS ? 'full' : 'open' });
  }
  if (url.pathname === '/') return json(200, { name: 'phantom-escape-server' });
  json(404, { error: 'not found' });
});

const gameServer = new Server({
  gracefullyShutdown: false, // our own SIGTERM/SIGINT handler below
  transport: new WebSocketTransport({
    server,
    maxPayload: 2 * 1024,
    verifyClient: (info: { origin?: string }, next: (ok: boolean, code?: number) => void) => next(originAllowed(info.origin), 403),
  } as any),
});
gameServer.define('house', HouseRoom);

// Gate in front of every request handler (Colyseus' matchmaking included): matchmaking from a
// disallowed browser origin is refused before any room is created.
const handlers = server.listeners('request').slice() as ((req: http.IncomingMessage, res: http.ServerResponse) => void)[];
server.removeAllListeners('request');
server.on('request', (req: http.IncomingMessage, res: http.ServerResponse) => {
  if ((req.url ?? '').startsWith('/matchmake') && !originAllowed(req.headers.origin)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' }).end('origin not allowed');
    return;
  }
  for (const h of handlers) h(req, res);
});

gameServer.listen(PORT).then(() => console.log(`[phantom-escape] server listening on :${PORT}`));

let stopping = false;
const stop = (sig: string) => {
  if (stopping) return;
  stopping = true;
  console.log(`[phantom-escape] ${sig}: shutting down`);
  setTimeout(() => process.exit(0), 10_000).unref(); // never hang a deploy
  void gameServer.gracefullyShutdown(false).finally(() => process.exit(0));
};
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));
