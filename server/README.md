# Phantom Escape Server (online, stage 2)

Authoritative [Colyseus](https://colyseus.io) 0.16 server for online rooms: lobby (players, unique
colours, ready, host-only settings / kick / start, host migration, max 8), in-game sync of player
positions and every hiding spot (drawers, sofa, bed, … incl. late state for a rejoiner), and
disconnect / rejoin (a dropped player's seat, colour and host role are kept for
`RECONNECT_SECONDS`, default 45; a deliberate leave removes the player at once). No Phantom
gameplay or timers yet. Hosting: see [docs/DEPLOY-SERVER.md](../docs/DEPLOY-SERVER.md).

```
npm install            # at the repo root (npm workspaces)
npm run server         # = npm run start -w server, listens on PORT (default 2567)
npm test -w server     # room-logic unit tests
PE_SERVER=http://localhost:2567 npx tsx server/src/tests/integration.ts   # socket test vs a running server
```

- `GET /health` → `{ok, rooms, players, uptime}`; `GET /rooms/CODE` → `{status}` (open / full / started / missing).
- Rooms are keyed by their 6-character code (the Colyseus room id); the client creates with
  `create('house')` and joins with `joinById(CODE)`.
- The lobby rules are the client's own `LobbyRoom` (`client/src/lobby/lobby.ts`) and nicknames are
  cleaned with `displayNickname` (`client/src/home/settings.ts`), so online and offline behave alike.
- Allowed browser origins: `ALLOWED_ORIGINS` (comma-separated), default
  `https://hriday-shah.github.io,localhost`. Every client message is validated; movement is rate-limited and
  speed-checked; nothing personal is stored (nickname, colour and ready only, in memory).

## Pointing the game at a server

The Pages build takes its default server from the repository variable `VITE_SERVER_URL`
(empty = offline / demo mode; see docs/DEPLOY-SERVER.md). `?server=wss://HOST` overrides it for
the tab (`?server=off` forces offline); the lobby's invite link carries both:
`…/Phatom_escape-/?server=wss%3A%2F%2FHOST&room=CODE`.
