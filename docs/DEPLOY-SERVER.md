# Deploying the game server (free cloud host)

The online mode needs the Colyseus server in `server/` running somewhere public over `wss://`.
The site on GitHub Pages stays static; it only needs to know the server's URL at build time.

## Recommended host: Render (free web service)

Checked 24 Nov 2026:

| Host | Free terms | WebSockets | Sleep | Card | Verdict |
| --- | --- | --- | --- | --- | --- |
| [Render](https://render.com/docs/free) | 750 instance hours / month (one service all month), 0.1 CPU / 512 MB | yes ([docs](https://render.com/docs/websocket)) | after 15 min with **no inbound HTTP request or WebSocket message**; ~1 min to wake ([changelog, Feb 2026](https://render.com/changelog/free-web-services-now-remain-active-while-receiving-websocket-messages)) | **not needed** | **pick** |
| [Fly.io](https://docs.fly.io/about/free-plan) | Free plan: $5 of usage / month **with a card** (without: $1 once, 7 days) | yes | none if `auto_stop_machines = "off"` | needed for ongoing use | runner-up |
| [Koyeb](https://www.koyeb.com/docs/reference/instances) | 1 free instance, 0.1 vCPU / 512 MB, Frankfurt or Washington only | yes | scales to zero after 1 h with no traffic | **required** ([FAQ](https://www.koyeb.com/docs/faqs/pricing)) | no |
| [Railway](https://docs.railway.com/pricing/free-plan) | $1 of usage / month (≈100 MB RAM all month); $5 30-day trial | yes | after 5–10 min without outbound traffic | not needed | too small |

Why Render: no card, WebSockets on the free plan, a Singapore region (closest to India), and
since Feb 2026 live WebSocket traffic keeps the service awake, so a room in play is never put to
sleep. The game sends a heartbeat every 3 s while connected (`hb`), so even an idle lobby counts
as traffic. When nobody has been connected for 15 minutes it sleeps; the next Create / Join wakes
it (the homepage shows "Waking up the game server…" and still offers "Play offline instead").

Free-tier caveats: Render may restart free services at any time and every deploy restarts it;
rooms live in memory, so a restart ends the rooms in play (players get "Connection lost" and go
back home). `render.yaml` only redeploys when server code changes (`buildFilter`).

Runner-up, Fly.io: always on and no sleep at all, but its free allowance needs a card on file
(it moves to pay-as-you-go automatically if usage goes over $5 in a month). `fly.toml` is ready.

## What's in the repo

- `Dockerfile` (build context = repo root): Node 22 Alpine, installs only the server workspace's
  production dependencies, copies `server/src` plus the pure client modules the server imports
  (`client/src/lobby/lobby.ts`, `client/src/home/settings.ts`, `client/src/config/physicsConfig.ts`,
  `client/src/config/playerConfig.ts`, `client/src/data/`, `client/src/logic/`,
  `client/src/ui/phantomHideSlots.ts`). `npm run check:docker-client` (also run inside the image build)
  verifies every server import is copied before deploy.
  No client assets, Phaser scenes, or media go into the image (`.dockerignore`). Runs as the `node` user.
  There is no start-command override: the image runs `node --import tsx src/index.ts` in `/app/server`.
  Render injects `PORT` (10000 on a web service); the process listens on that.
- `render.yaml`: Render Blueprint, free plan, Singapore, Docker, health check `/health`.
  Its service name is `phantom-escape-server`, which is a different host from the live service
  `phatom-escape` (`https://phatom-escape.onrender.com`). A static site cannot be switched to Docker.
  Keep that URL by creating a web service whose name is exactly `phatom-escape`. Do not apply this
  Blueprint if that hostname must stay.
- `fly.toml`: the Fly.io equivalent (Singapore, health check `/health`, never auto-stopped).
- Server env (all optional):
  - `PORT`: set by the host (Render: 10000); 2567 locally.
  - `ALLOWED_ORIGINS`: comma-separated browser origins; default `https://hriday-shah.github.io,localhost`
    (`localhost` = any localhost port). The Blueprint sets `https://hriday-shah.github.io` only.
  - `RECONNECT_SECONDS`: how long a dropped player's seat is kept (default 30).
- `GET /health` → `{ok, rooms, players, uptime}` (the host's health check).
- Graceful shutdown: on `SIGTERM` (deploys, restarts) rooms are disposed and clients get a clean
  close; the process exits within 10 s.

## Client: `VITE_SERVER_URL`

The client reads its default server from the build-time env var `VITE_SERVER_URL`. The Pages
build passes the **repository variable** of the same name; the URL is not hard-coded in the repo.
`.github/workflows/deploy-pages.yml` sets it on the Build step:

```yaml
      - name: Build
        run: npm run build
        env:
          VITE_BASE_PATH: /Phatom_escape-/
          # Default game server (wss://...); empty / unset = offline / demo mode.
          VITE_SERVER_URL: ${{ vars.VITE_SERVER_URL }}
```

An unset variable expands to an empty string, so the line is safe to add before the server exists.

- Empty / not set (the default): offline / demo mode, as today.
- `wss://….onrender.com`: Create and Join use real rooms on that server.
- `?server=wss://…` in the page URL still overrides it for the tab; `?server=off` forces offline.
  Invite links carry the server and the room code.

Deploying `main` does not include the two-player movement fix. That is
[pull request 34](https://github.com/Hriday-Shah/Phatom_escape-/pull/34) on
`cursor/fix-two-player-movement-f410`, and it is not merged. Leave it unmerged until it is reviewed.
A server deploy of `main` will not have that fix.

## Steps for Hriday (sign-up and settings; nothing here was done for you)

1. **Sign up at Render**: <https://dashboard.render.com/register> → "GitHub" (sign in with your
   GitHub account) → verify the email if asked. No card is needed for the free plan.
2. **Use the existing host** `https://phatom-escape.onrender.com`. That name is already taken by
   the static site, and a static site cannot be changed into a Docker web service. Rename or delete
   the static site so the name `phatom-escape` is free, then **New** → **Web Service** → repo
   `Hriday-Shah/Phatom_escape-`, branch `main` (after the image fix is on `main`) → Language
   **Docker** → Name `phatom-escape` → Region **Singapore** → Instance type **Free** → leave
   **Docker Command** empty → Health Check Path `/health` → env
   `ALLOWED_ORIGINS=https://hriday-shah.github.io`, `RECONNECT_SECONDS=30`. Do not apply the
   Blueprint: `render.yaml` would create `phantom-escape-server`, a different URL.
3. Wait for the first deploy to say **Live**. Check `https://phatom-escape.onrender.com/health`
   shows `{"ok":true,…}`. The site root should be JSON `{"name":"phantom-escape-server"}`, not the game page.
4. **Merge the image fix to `main`** so the Pages workflow contains the `VITE_SERVER_URL` line above.
   Until that is on `main`, setting the variable does nothing: the current Pages build never reads it.
5. **Set the repo variable**: GitHub → the repo → **Settings** → **Secrets and variables** →
   **Actions** → **Variables** tab → **New repository variable** → Name `VITE_SERVER_URL`,
   Value `wss://phatom-escape.onrender.com` (same host, `wss://`, no path, no trailing slash).
6. **Redeploy the site**: Actions → "Deploy to GitHub Pages" → **Run workflow** (or push to main).
   The homepage then says "Online: Create and Join use real rooms on the game server."
7. Send the URL (step 3) back so the live end-to-end test can run against it.

To go back to offline mode, delete the variable (or empty it) and re-run the Pages workflow.

## Local

```
npm install && npm run server                     # ws://localhost:2567
open http://localhost:5173/Phatom_escape-/?server=ws://localhost:2567
```
