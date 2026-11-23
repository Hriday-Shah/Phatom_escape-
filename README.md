# Phantom Escape

A mobile-first, online multiplayer horror game that runs in the browser.

One random player becomes the Phantom. The Phantom hides key items around a top-down house, then roams while the other players search for them and try to escape. Players can team up, but only the first one out wins. If nobody escapes in time, the Phantom wins.

## Status

**Stage 1 Complete** - Single-player gameplay with full house exploration and hiding spots. No networking yet.

## Project Structure

This is a monorepo organized with npm workspaces:

- **`client/`** - Phaser 3 + TypeScript browser game (Vite)
- **`server/`** - Placeholder for Colyseus authoritative server (Stage 2)
- **`packages/shared/`** - Shared types between client and server (Stage 2)

## Getting Started

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm 7+ (for workspaces support)

### Installation

```bash
npm install
```

### Development

Run the client in development mode:

```bash
npm run dev
```

This starts the Vite dev server at `http://localhost:3000` with hot reload.

### Build

Build the client for production:

```bash
npm run build
```

The static files are output to `client/dist/` and can be hosted on any static file server.

### Preview Production Build

Preview the production build locally:

```bash
npm run preview
```

## Controls

### Mobile (Touch)

- **Virtual Joystick** (left side of screen): Touch and drag to move the player
- **E Button** (right side): Interact with nearby hiding spots or doors

### Desktop (Keyboard)

- **WASD** or **Arrow Keys**: Move the player
- **E**: Interact with nearby hiding spots or doors

### Buttons (Right Side)

- **E / Interact**: Active - opens hiding spots and attempts to open doors
- **Drop**, **Sneak**, **Shoot**: Visible but disabled (Stage 2+)

## Gameplay (Stage 1)

- Explore the house by walking through rooms and doorways
- Walls and furniture block your movement
- The **bedroom door** (top left) is locked and requires a key (Stage 2)
- The **main door** (entrance) won't open yet (Stage 2)
- Approach any hiding spot and press **E** (or tap the button) to open it
- All hiding spots are currently empty but can be populated with items in later stages

## House Layout

The house floor plan is defined in `client/src/data/houseLayout.ts` as structured TypeScript data.

### Rooms

- **Bedroom** (top left): Study table with 3 drawers, bed, bedside drawer, closet
- **Entrance** (center left): Car table, main door (locked)
- **Living Room** (center): Sofa, ottoman, TV unit
- **Dining Area** (center bottom): Dining table, sideboard
- **Bathroom** (top right): Sink cabinet, wall shelf
- **Foyer** (middle right): Connects living room to bathroom and kitchen
- **Kitchen** (bottom right): Fridge, stove, microwave unit, sink cabinets

### Hiding Spots

All objects with `*` in the floor plan comments are interactive hiding spots:

**Bedroom:**
- Study table (3 drawers) - split into 3 separate spots
- Bed
- Bedside drawer
- Closet drawers

**Living/Dining:**
- Sofa
- Ottoman
- TV unit
- Sideboard

**Bathroom:**
- Sink cabinet
- Wall shelf

**Kitchen:**
- Microwave unit
- Kitchen sink cabinet
- Stove
- Stove-side drawers
- Fridge

### Doors and Openings

**Doors (interactable, locked in Stage 1):**
- Bedroom door (locked, needs key)
- Main entrance door (won't open yet)

**Open doorways/connections:**
- Entrance → Living room
- Living room → Foyer
- Foyer → Kitchen
- Bathroom door (open)

## Placeholder Art

All visuals are **procedurally generated placeholder shapes** to make it easy for a designer to replace them with real assets.

### Texture Keys

The game uses these texture keys (defined in `client/src/config/textureKeys.ts`):

**Player:**
- `player` - Blue circle with direction indicator

**Floors:**
- `floor_bedroom`, `floor_entrance`, `floor_living`, `floor_bathroom`, `floor_kitchen`

**Walls & Doors:**
- `wall` - Dark gray blocks
- `door_locked` - Brown door with gold lock
- `door_open` - Transparent brown door

**Furniture (Hiding Spots):**
- `drawer`, `drawer_open` - Brown drawers
- `closet`, `closet_open` - Dark brown closets
- `cabinet`, `cabinet_open` - Medium wood cabinets
- `bed` - Purple bed
- `sofa` - Gray sofa
- `fridge`, `fridge_open` - White/silver fridge
- `stove` - Dark blue/gray stove

**Furniture (Blocking):**
- `table` - Brown table

**UI:**
- `joystick_base`, `joystick_thumb` - Semi-transparent circles
- `button`, `button_disabled` - Blue active / Gray disabled

All textures are generated in `client/src/config/textureGenerator.ts`. To replace with real assets:

1. Add image files to `client/public/assets/` (e.g., `player.png`, `drawer.png`)
2. Update `PreloadScene.ts` to load images instead of generating textures:
   ```typescript
   this.load.image('player', 'assets/player.png');
   this.load.image('drawer', 'assets/drawer.png');
   // etc.
   ```
3. Remove or comment out `TextureGenerator.generateAll(this)`

## Floor Plan Reference

The original floor plan is in `docs/floor-plan.svg` (1060×760 units). All game coordinates and layout data are based on this SVG.

## Mobile-First Features

- **Responsive layout**: Works in portrait and landscape orientations
- **No page scroll or zoom**: Touch events are handled to prevent browser default behaviors
- **Safe area support**: UI respects device notches and system UI via `viewport-fit=cover`
- **Touch-optimized controls**: Large virtual joystick and buttons
- **Resize handling**: Game scales and repositions UI elements on orientation changes

## Deploy

### GitHub Pages (Current Setup)

The repo is configured to deploy automatically to GitHub Pages using GitHub Actions.

**Setup:**

1. Go to **Settings** > **Pages**
2. Under **Source**, select **GitHub Actions**
3. Push to `main` branch or manually trigger the workflow

The site will be available at:
```
https://hriday-shah.github.io/Phatom_escape-/
```

The workflow (`.github/workflows/deploy-pages.yml`) builds the client with the correct base path and deploys to the `github-pages` environment.

### Cloudflare Pages (Alternative)

If you prefer Cloudflare Pages:

1. Connect your repository to Cloudflare Pages
2. Use these build settings:
   - **Build command**: `npm run build`
   - **Build output directory**: `client/dist`
   - **Root directory**: (leave empty / root)
3. Set environment variable: `VITE_BASE_PATH=/` (or leave unset)

## Tech Stack

- **Client**: Phaser 3 (game engine), TypeScript, Vite (bundler)
- **Server** (Stage 2): Node.js + Colyseus (authoritative rooms and state sync)
- **Deployment**: GitHub Pages (client), Render free tier (server, Stage 2)

## Development Notes

- Stage 1 is **single-player only** - no networking, no multiplayer
- The monorepo structure supports adding a Colyseus server in Stage 2
- Shared types can be added to `packages/shared/` for client-server communication
- All game logic runs client-side for now; server authority comes in Stage 2

## License

Private project - all rights reserved.
