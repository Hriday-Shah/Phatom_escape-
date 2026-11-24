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
  production dependencies, copies `server/src` plus the three pure client modules it shares
  (`client/src/lobby/lobby.ts`, `client/src/home/settings.ts`, `client/src/config/physicsConfig.ts`).
  No client assets or media go into the image (`.dockerignore`). Runs as the `node` user.
- `render.yaml`: Render Blueprint, free plan, Singapore, Docker, health check `/health`.
- `fly.toml`: the Fly.io equivalent (Singapore, health check `/health`, never auto-stopped).
- Server env (all optional):
  - `PORT`: set by the host (Render: 10000); 2567 locally.
  - `ALLOWED_ORIGINS`: comma-separated browser origins; default `https://hriday-shah.github.io,localhost`
    (`localhost` = any localhost port). The Blueprint sets `https://hriday-shah.github.io` only.
  - `RECONNECT_SECONDS`: how long a dropped player's seat is kept (default 45).
- `GET /health` → `{ok, rooms, players, uptime}` (the host's health check).
- Graceful shutdown: on `SIGTERM` (deploys, restarts) rooms are disposed and clients get a clean
  close; the process exits within 10 s.

## Client: `VITE_SERVER_URL`

The client reads its default server from the build-time env var `VITE_SERVER_URL`. The Pages
build should pass the **repository variable** of the same name; nothing is hard-coded in the repo.
That needs this addition to the Build step's `env:` in `.github/workflows/deploy-pages.yml`
(not included in the PR: the bot's token may not edit workflow files; Hriday adds it once):

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

## Steps for Hriday (sign-up and settings; nothing here was done for you)

1. **Sign up at Render**: <https://dashboard.render.com/register> → "GitHub" (sign in with your
   GitHub account) → verify the email if asked. No card is needed for the free plan.
2. **Create the service from the Blueprint**: Dashboard → **New** → **Blueprint** → connect
   GitHub when asked and allow access to `Hriday-Shah/Phatom_escape-` only → pick the repo, branch
   `main` → Render reads `render.yaml` and shows **phantom-escape-server** (Free, Singapore) →
   **Apply** / **Deploy Blueprint**. (Manual alternative: New → Web Service → the repo → Language
   *Docker* → Region *Singapore* → Instance type *Free* → Health Check Path `/health` → env vars
   `ALLOWED_ORIGINS=https://hriday-shah.github.io`, `RECONNECT_SECONDS=45`.)
3. Wait for the first deploy to say **Live**, then copy the service URL from the top of the page,
   e.g. `https://phantom-escape-server-xxxx.onrender.com`. Check `https://…onrender.com/health`
   shows `{"ok":true,…}`.
4. **Add the workflow line** above (GitHub → the repo → `.github/workflows/deploy-pages.yml` →
   pencil icon → add the `VITE_SERVER_URL:` line under `VITE_BASE_PATH:` → Commit to `main`).
5. **Set the repo variable**: GitHub → the repo → **Settings** → **Secrets and variables** →
   **Actions** → **Variables** tab → **New repository variable** → Name `VITE_SERVER_URL`,
   Value `wss://phantom-escape-server-xxxx.onrender.com` (same host, `wss://`, no trailing slash).
6. **Redeploy the site**: Actions → "Deploy to GitHub Pages" → **Run workflow** (or push to main).
   The homepage then says "Online: Create and Join use real rooms on the game server."
7. Send the URL (step 3) back so the live end-to-end test can run against it.

To go back to offline mode, delete the variable (or empty it) and re-run the Pages workflow.

## Local

```
npm install && npm run server                     # ws://localhost:2567
open http://localhost:5173/Phatom_escape-/?server=ws://localhost:2567
```
