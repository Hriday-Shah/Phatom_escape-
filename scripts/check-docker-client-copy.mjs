#!/usr/bin/env node
/**
 * Ensures every client module the game server imports at runtime is copied into
 * the Render Docker image (see Dockerfile). Fails CI and image builds when a
 * server import would be missing in production.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.argv.includes('--in-image')
  ? '/app'
  : path.resolve(__dirname, '..');

const SERVER_GLOB = 'server/src';
const CLIENT_PREFIX = 'client/src';

const SPECIFIER_RE =
  /(?:import|export)\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g;

function walkTsFiles(dir, skipTests = false) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (skipTests && name === 'tests') continue;
      out.push(...walkTsFiles(full, skipTests));
    } else if (name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

function resolveTsModule(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

function toRepoClientPath(absPath) {
  const rel = path.relative(repoRoot, absPath).split(path.sep).join('/');
  return rel.startsWith(`${CLIENT_PREFIX}/`) ? rel : null;
}

function clientImportsFromServer(absPath) {
  const text = fs.readFileSync(absPath, 'utf8');
  const specs = [];
  for (const m of text.matchAll(SPECIFIER_RE)) {
    const spec = m[1] ?? m[2];
    if (spec && spec.includes('client/src')) specs.push(spec);
  }
  return specs;
}

function resolveServerClientImport(serverFile, specifier) {
  const joined = path.normalize(path.join(path.dirname(serverFile), specifier));
  const resolved = resolveTsModule(path.dirname(joined), `./${path.basename(joined)}`);
  if (resolved) return resolved;
  const withExt = [
    joined,
    `${joined}.ts`,
    `${joined}.tsx`,
    path.join(joined, 'index.ts'),
  ];
  for (const c of withExt) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

function collectRequiredClientFiles() {
  const serverDir = path.join(repoRoot, SERVER_GLOB);
  const serverFiles = walkTsFiles(serverDir, true);
  const needed = new Set();
  const queue = [];

  for (const sf of serverFiles) {
    for (const spec of clientImportsFromServer(sf)) {
      const target = resolveServerClientImport(sf, spec);
      if (!target) {
        console.error(`Could not resolve server import ${spec} from ${path.relative(repoRoot, sf)}`);
        process.exit(1);
      }
      queue.push(target);
    }
  }

  while (queue.length) {
    const file = queue.pop();
    const key = toRepoClientPath(file);
    if (!key || needed.has(key)) continue;
    needed.add(key);

    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(SPECIFIER_RE)) {
      const spec = m[1] ?? m[2];
      if (!spec || !spec.startsWith('.')) continue;
      const next = resolveTsModule(file, spec);
      if (next) queue.push(next);
    }
  }

  return [...needed].sort();
}

function parseDockerClientCopies() {
  const dockerfile = fs.readFileSync(path.join(repoRoot, 'Dockerfile'), 'utf8');
  const rules = [];
  for (const line of dockerfile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('COPY ')) continue;
    const body = trimmed.slice(5).trim();
  const parts = body.split(/\s+/);
  if (parts.length < 2) continue;
    const dest = parts[parts.length - 1];
    const src = parts[parts.length - 2];
    if (!dest.startsWith('client/') && !src.startsWith('client/')) continue;
    rules.push({ src, dest });
  }
  return rules;
}

function fileCoveredByDocker(filePath, rules) {
  const norm = filePath.split(path.sep).join('/');
  for (const { src, dest } of rules) {
    const destDir = dest.endsWith('.ts') ? path.posix.dirname(dest) : dest;
    const destPrefix = `${destDir}/`;
    if (src.endsWith('.ts') && src === norm) return true;
    if (!src.endsWith('.ts')) {
      const srcDir = src.replace(/\/$/, '');
      if (norm === srcDir || norm.startsWith(`${srcDir}/`)) return true;
      if (norm.startsWith(destPrefix) || norm === destDir) return true;
    }
  }
  return false;
}

function main() {
  const inImage = process.argv.includes('--in-image');
  const required = collectRequiredClientFiles();

  if (inImage) {
    const missing = required.filter((f) => !fs.existsSync(path.join(repoRoot, f)));
    if (missing.length) {
      console.error('Docker image is missing client modules the server imports:\n');
      for (const m of missing) console.error(`  - ${m}`);
      process.exit(1);
    }
    console.log(`✓ All ${required.length} client module(s) required by the server are present in the image.`);
    return;
  }

  const rules = parseDockerClientCopies();
  const uncovered = required.filter((f) => !fileCoveredByDocker(f, rules));
  if (uncovered.length) {
    console.error('Dockerfile does not copy client modules the server imports:\n');
    for (const u of uncovered) console.error(`  - ${u}`);
    console.error('\nAdd COPY lines (or extend a client/ directory copy) in Dockerfile, then update render.yaml buildFilter.');
    process.exit(1);
  }
  console.log(`✓ Dockerfile covers ${required.length} client module(s) imported by the server.`);
}

main();