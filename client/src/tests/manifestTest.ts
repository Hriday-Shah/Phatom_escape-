import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { DRAWER_UNITS, baseTextureKey, sectionOpenTextureKey } from '../data/drawerSlices';
import { HIDING_SPOT_TEXTURES } from '../utils/artHelpers';
import { houseLayout } from '../data/houseLayout';

export function runManifestTest(): void {
  console.log('=== MANIFEST TEST ===');
  
  const manifestPath = join(process.cwd(), 'public/assets/manifest.json');
  
  if (!existsSync(manifestPath)) {
    throw new Error('manifest.json not found in public/assets/');
  }
  
  const manifestText = readFileSync(manifestPath, 'utf-8');
  const manifest = JSON.parse(manifestText);
  
  if (!manifest.assets || !Array.isArray(manifest.assets)) {
    throw new Error('Invalid manifest: missing assets array');
  }
  
  console.log(`Found ${manifest.assets.length} assets in manifest`);
  
  // Check only approved assets
  const approvedAssets = manifest.assets.filter((asset: any) => asset.status === 'approved');
  console.log(`Checking ${approvedAssets.length} approved assets...`);
  
  const missing: string[] = [];
  const assetsDir = join(process.cwd(), 'public/assets');
  
  for (const asset of approvedAssets) {
    const filePath = join(assetsDir, asset.file);
    if (!existsSync(filePath)) {
      missing.push(asset.file);
    }
  }
  
  if (missing.length > 0) {
    console.error(`\n❌ Missing asset files:`);
    missing.forEach(file => console.error(`   - ${file}`));
    throw new Error(`${missing.length} approved asset files missing from disk`);
  }
  
  console.log(`✓ All ${approvedAssets.length} approved asset files exist on disk`);

  // Every hiding spot has approved art: multi-section units {unit}_base + {unit}_d{N}_open
  // (same canvas, sections inside it), one-piece spots K + K_open.
  const byKey = new Map<string, any>(approvedAssets.map((a: any) => [a.key, a]));
  const artErrors: string[] = [];
  for (const spot of houseLayout.hidingSpots) {
    const unit = DRAWER_UNITS[spot.id];
    if (unit) {
      const base = byKey.get(baseTextureKey(unit));
      if (!base) { artErrors.push(`${spot.id}: no approved ${baseTextureKey(unit)}`); continue; }
      if (base.width * 2 !== spot.width || base.height * 2 !== spot.height) {
        artErrors.push(`${spot.id}: ${base.key} is ${base.width}x${base.height}, layout is ${spot.width}x${spot.height}`);
      }
      for (const s of unit.sections) {
        const open = byKey.get(sectionOpenTextureKey(unit, s.drawer));
        if (!open) artErrors.push(`${spot.id}: no approved ${sectionOpenTextureKey(unit, s.drawer)}`);
        else if (open.width !== base.width || open.height !== base.height) artErrors.push(`${open.key}: not the base canvas size`);
        if (s.x < 0 || s.y < 0 || s.x + s.w > base.width || s.y + s.h > base.height) artErrors.push(`${spot.id} section ${s.drawer}: rect outside the sprite`);
      }
      // The old single-piece art must not be loaded any more for sectioned units.
      for (const old of [unit.texture, `${unit.texture}_open`]) if (byKey.has(old)) artErrors.push(`${old}: replaced by per-section art, remove it`);
    } else {
      const k = HIDING_SPOT_TEXTURES[spot.id];
      if (!k || !byKey.has(k) || !byKey.has(`${k}_open`)) artErrors.push(`${spot.id}: missing approved ${k} / ${k}_open`);
    }
  }
  if (artErrors.length) {
    artErrors.forEach((e) => console.error(`   - ${e}`));
    throw new Error(`${artErrors.length} hiding-spot art problems`);
  }
  const sections = Object.values(DRAWER_UNITS).reduce((n, u) => n + u.sections.length, 0);
  console.log(`✓ Hiding-spot art complete: ${Object.keys(DRAWER_UNITS).length} sectioned units (${sections} sections) + one-piece spots`);
  // Player light: the approved fx_light_mask, shown at worldSize 416 (radius 208 = 6.5 tiles).
  const mask = byKey.get('fx_light_mask');
  if (!mask || mask.worldSize?.[0] !== 416 || mask.worldSize?.[1] !== 416) {
    throw new Error('fx_light_mask must be approved with worldSize [416, 416]');
  }
  console.log('✓ fx_light_mask approved (416x416 world, radius 208)');
  console.log(`✓ manifest.json is committed and valid\n`);
  
  console.log('✅ MANIFEST TEST PASSED');
}
