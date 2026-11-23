# Phantom Escape

A mobile-first, online multiplayer horror game that runs in the browser.

One random player becomes the Phantom. The Phantom hides key items around a top-down house, then roams while the other players search for them and try to escape. Players can team up, but only the first one out wins. If nobody escapes in time, the Phantom wins.

## Status

Planning. No game code yet.

## Tech plan

- Client: Phaser 3 + TypeScript, mobile-first, top-down
- Server: Node.js + Colyseus, authoritative rooms and state sync
- Join with a room code or link and a nickname, no accounts
- Simple horror art style
- Free hosting: the client on Cloudflare Pages, the server on Render's free tier
