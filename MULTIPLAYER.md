# Phantom Escape - Stage 2 Multiplayer

This branch (`feat/stage2-multiplayer-767d`) contains the complete multiplayer implementation for Phantom Escape.

## Architecture

- **Client**: Phaser 3 game (`/client`) - Browser-based game that can run standalone (Stage 1) or connect to online rooms (Stage 2)
- **Server**: Colyseus authoritative game server (`/server`) - Manages multiplayer rooms, game state, and player synchronization

## Running Locally

### 1. Start the Server

```bash
cd server
npm install
npm run dev
```

Server runs on `http://localhost:2567`

### 2. Start the Client

```bash
cd client
npm install  
npm run dev
```

Client runs on `http://localhost:5173`

### 3. Play Multiplayer

Open the client and append the server URL:
```
http://localhost:5173/?server=ws://localhost:2567
```

This will enable online mode. Create a room and share the invite link with friends!

## Deployment

### Server Deployment (Render/Heroku/Railway)

1. Deploy the `/server` directory as a Node.js service
2. Set environment variables:
   - `PORT` (Render/Heroku auto-sets this)
   - `NODE_ENV=production`
3. The server exposes:
   - WebSocket on port (for game connections)
   - `/health` endpoint for health checks
   - `/colyseus` monitor panel (dev only)

### Client Deployment (Current - Render Static Site)

Already configured in `/render.yaml`:
- Builds client as static site
- Deploys to https://phatom-escape.onrender.com/

To connect to your deployed server:
```
https://phatom-escape.onrender.com/?server=wss://your-server.onrender.com
```

## Game Features

### Lobby System
- 2-6 players per room
- 6-character room codes for easy joining
- Host controls game settings:
  - Hiding time (1-5 minutes)
  - Search time (3-10 minutes)
  - Chase time (1-3 minutes)
  - Number of Phantoms
  - Drawer noise levels
- Ready system (all players must be ready to start)

### In-Game Multiplayer
- **Real-time player synchronization** (12 FPS position updates)
- **Authoritative server** (prevents cheating)
- **Spot synchronization** (drawers, cabinets, etc.)
- **Item hiding and searching** (Phantom hides items, Players search)
- **Mini-games** (Memory, Lockpick, Chase, etc.)
- **Escape system** (Collect code papers, solve puzzle, escape)

### Reconnection Support
- Players can reconnect within 20-30 seconds if disconnected
- Room state preserved during reconnection
- Marked as "away" while reconnecting

## Technical Details

### Server (`/server`)
- **Framework**: Colyseus 0.15
- **Language**: TypeScript
- **Room Management**: HouseRoom (`src/HouseRoom.ts`)
- **Game Logic**: HouseLogic (`src/houseLogic.ts`)
- **Protocol**: JSON messages (no Schema state, manual serialization)
- **Rate Limiting**: Built-in flood protection

### Client (`/client`)
- **Game Engine**: Phaser 3
- **Network**: Colyseus.js client (`src/net/ColyseusLobbyService.ts`)
- **Offline Support**: Can play without server (Stage 1 single-player)
- **Responsive**: Touch controls for mobile, keyboard for desktop

### Protocol Messages

**Client → Server:**
- `colour` - Change player color
- `ready` - Toggle ready state
- `settings` - Update game settings (host only)
- `start` - Start game (host only)
- `pos` - Position update (x, y, direction, moving)
- `spot` - Open/close spot (drawer, etc.)
- `itemPickup` / `itemDrop` - Item interactions
- `minigameStart` / `minigameWin` / `minigameClose` - Mini-game events

**Server → Client:**
- `welcome` - Your session ID
- `lobby` - Full lobby state snapshot
- `rejected` - Action rejected with error
- `poses` - Batch position updates
- `spot` / `spots` - Spot state changes
- `round` - Game round started (items, mini-game)
- `items` - Your item inventory
- `codeReveal` - You won! Here's the escape code

## Development Workflow

1. Make changes to client or server
2. Test locally with `npm run dev` in both directories
3. Run tests:
   - Client: `npm test` (included in build)
   - Server: `npm test`
4. Build for production:
   - Client: `npm run build`
   - Server: `npm run build`

## Environment Variables

### Server
- `PORT` - Server port (default: 2567)
- `NODE_ENV` - Set to 'production' for production

### Client (Vite)
- `VITE_SERVER_URL` - Default server URL (optional, can use `?server=` instead)

## Troubleshooting

### "Cannot connect to server"
- Ensure server is running on the specified URL
- Check firewall/CORS settings
- For production, use `wss://` (not `ws://`) with HTTPS clients

### "Room not found"
- Room codes expire when all players leave
- Room codes are case-sensitive
- Codes are 6 characters long

### "Kicked from room"
- Host can kick players from lobby
- Server kicks on flooding/spam

### Players appearing as "away"
- Player disconnected but can still reconnect
- Wait 20-30 seconds before they're fully removed

## Credits

- Original Game: Phantom Escape
- Multiplayer Implementation: Stage 2 (Colyseus)
- Branch: `feat/stage2-multiplayer-767d`
