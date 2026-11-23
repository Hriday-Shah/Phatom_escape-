# Assets Directory

This directory is the **only location** where PNG image files are allowed in the repository.

## Media Policy

For privacy and security, this public repository enforces strict media file rules:

### ✅ Allowed in `client/public/assets/`

- **PNG files** (`.png`, `.PNG`) - Game sprites, UI elements, textures
- **JSON files** (`.json`) - Texture atlases, sprite sheets

### ❌ Blocked Everywhere

The following media types are **never allowed anywhere** in the repository:

- Photos: `.jpg`, `.jpeg`, `.heic`, `.heif`, `.gif`, `.bmp`
- Videos: `.mov`, `.mp4`, `.avi`, `.webm`
- Uploads folders: `uploads/`, `**/uploads/`

### 🔒 Exceptions

- `docs/floor-plan.svg` - The original floor plan (SVG only)

## How to Add Game Assets

1. Place PNG files in this directory: `client/public/assets/`
2. Reference them in code:
   ```typescript
   this.load.image('sprite-name', 'assets/sprite-name.png');
   ```
3. CI checks automatically validate the policy on every commit

## Enforcement

- **Git**: `.gitignore` blocks media files (with negation rule for this directory)
- **CI**: `npm run check:media` validates on every PR and push
- **Deploy**: GitHub Pages workflow runs the check before deploying

Violations will cause CI and deploy to fail.

## Why This Policy?

- **Privacy**: Prevents accidental commits of personal photos/videos
- **Repository cleanliness**: Game assets in a designated location
- **Build predictability**: Only approved formats in known locations
