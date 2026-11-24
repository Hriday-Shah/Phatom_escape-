# Phantom Escape Server (online trial)

Authoritative [Colyseus](https://colyseus.io) 0.16 server for online rooms. Trial scope: lobby
(players, unique colours, ready, host-only settings / kick / start, host migration, max 8) and
in-game sync of player positions and drawer open / close. No Phantom gameplay or timers yet.

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
- Allowed browser origins: `https://hriday-shah.github.io` and localhost (add more with
  `PE_ALLOWED_ORIGINS=a,b`). Every client message is validated; movement is rate-limited and
  speed-checked; nothing personal is stored (nickname, colour and ready only, in memory).

## Pointing the game at a server

The client never has a server built in. Open the game with `?server=wss://HOST` (remembered for
the tab); the lobby's invite link then carries both: `…/Phatom_escape-/?server=wss%3A%2F%2FHOST&room=CODE`.
Without `?server=` the game stays in the offline (this device only) mode.
