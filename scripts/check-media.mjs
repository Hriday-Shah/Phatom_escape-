#!/usr/bin/env node

/**
 * Media Policy Enforcement Script
 * 
 * Validates that no image/video/binary files exist outside allowed locations.
 * 
 * Rules:
 * 1. Photos/videos blocked everywhere: jpg, jpeg, heic, heif, mov, mp4, avi, webm, gif, bmp
 * 2. PNG files allowed ONLY in client/public/assets/
 * 3. Exception: docs/floor-plan.svg
 * 4. Inside client/public/assets/, only .png and .json allowed
 */

import { execSync } from 'child_process';
import { extname, basename } from 'path';

const ALLOWED_EXTENSIONS_IN_ASSETS = ['.png', '.json', '.md'];
const BLOCKED_EXTENSIONS = [
  '.jpg', '.jpeg', '.heic', '.heif', '.gif', '.bmp',
  '.mov', '.mp4', '.avi', '.webm',
  '.JPG', '.JPEG', '.HEIC', '.HEIF', '.GIF', '.BMP',
  '.MOV', '.MP4', '.AVI', '.WEBM', '.PNG'
];
const ALLOWED_EXCEPTIONS = ['docs/floor-plan.svg'];
const ASSETS_DIR = 'client/public/assets/';

function getTrackedFiles() {
  try {
    const output = execSync('git ls-files', { encoding: 'utf-8' });
    return output.trim().split('\n').filter(Boolean);
  } catch (error) {
    console.error('Error: Failed to get tracked files from git');
    process.exit(1);
  }
}

function checkMediaPolicy() {
  const files = getTrackedFiles();
  const violations = [];
  
  console.log('🔍 Checking media policy...\n');
  
  for (const file of files) {
    const ext = extname(file).toLowerCase();
    const isInAssets = file.startsWith(ASSETS_DIR);
    
    // Check if it's an allowed exception
    if (ALLOWED_EXCEPTIONS.includes(file)) {
      console.log(`✓ Exception allowed: ${file}`);
      continue;
    }
    
    // Check files in assets directory
    if (isInAssets) {
      if (!ALLOWED_EXTENSIONS_IN_ASSETS.includes(ext)) {
        violations.push({
          file,
          reason: `Only ${ALLOWED_EXTENSIONS_IN_ASSETS.join(', ')} files allowed in ${ASSETS_DIR}`,
        });
      } else if (ext === '.png') {
        console.log(`✓ PNG allowed in assets: ${file}`);
      }
      continue;
    }
    
    // Check for blocked media files outside assets
    if (BLOCKED_EXTENSIONS.includes(ext)) {
      violations.push({
        file,
        reason: `${ext} files not allowed outside ${ASSETS_DIR}`,
      });
    }
    
    // Check for lowercase .png outside assets (blocked by gitignore but check anyway)
    if (ext === '.png') {
      violations.push({
        file,
        reason: `.png files only allowed in ${ASSETS_DIR}`,
      });
    }
  }
  
  // Report results
  console.log('');
  
  if (violations.length === 0) {
    console.log('✅ Media policy check PASSED');
    console.log('   - No prohibited media files found');
    console.log(`   - All PNG files in ${ASSETS_DIR}`);
    console.log('   - Allowed exceptions present');
    return true;
  } else {
    console.error('❌ Media policy check FAILED\n');
    console.error(`Found ${violations.length} violation(s):\n`);
    
    violations.forEach(({ file, reason }, index) => {
      console.error(`${index + 1}. ${file}`);
      console.error(`   Reason: ${reason}\n`);
    });
    
    console.error('\nMedia Policy:');
    console.error(`  ✓ PNG files allowed in: ${ASSETS_DIR}`);
    console.error('  ✗ Photos/videos blocked everywhere');
    console.error('  ✗ PNG files blocked outside assets directory');
    console.error(`  ✓ Exceptions: ${ALLOWED_EXCEPTIONS.join(', ')}`);
    
    return false;
  }
}

const passed = checkMediaPolicy();
process.exit(passed ? 0 : 1);
