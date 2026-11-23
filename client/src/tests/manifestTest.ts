import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

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
  console.log(`✓ manifest.json is committed and valid\n`);
  
  console.log('✅ MANIFEST TEST PASSED');
}
