// Build the UI extension: single source of truth at `src/`, output to `dist/`.
//
//   - verifies the source parses (`node --check`)
//   - writes zashboard/dist/assets/user-rules-ui.js from zashboard/src/user-rules-ui.js
//   - bumps the `?v=` cache-buster in zashboard/dist/index.html to the content
//     hash of the produced asset so browsers/Service Workers fetch the new file
//     (index.html itself is served with Cache-Control: no-store by the gateway).
//
// Run: node scripts/build-ui.mjs
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'zashboard/src/user-rules-ui.js');
const dist = resolve(root, 'zashboard/dist/assets/user-rules-ui.js');
const indexHtml = resolve(root, 'zashboard/dist/index.html');

if (process.env.CI !== 'true') {
  // Local: also assert syntax here (CI runs its own node --check step).
  execSync(`node --check "${src}"`, { stdio: 'inherit' });
}

const code = readFileSync(src, 'utf8');
// Sanity: the shipped bundle must not contain a hardcoded panel password.
if (code.includes('2625251001')) {
  throw new Error('Refusing to build: source contains hardcoded panel password literal.');
}

const hash = createHash('sha256').update(code).digest('hex').slice(0, 12);
mkdirSync(dirname(dist), { recursive: true });
writeFileSync(dist, code);

// Bump the cache-buster to the content hash so a changed bundle is always
// fetched and an unchanged bundle stays identical (reproducible builds in CI,
// and the gateway serves index.html with Cache-Control: no-store anyway).
const v = `v=${hash}`;
const html = readFileSync(indexHtml, 'utf8');
if (!html.includes(`user-rules-ui.js?${v}`)) {
  // Idempotent: only rewrite when the cache-buster is not already current.
  const next = html.replace(/user-rules-ui\.js\?v=[a-z0-9-]+/g, `user-rules-ui.js?${v}`);
  if (next === html) {
    throw new Error('Did not find user-rules-ui.js? param in index.html to bump.');
  }
  writeFileSync(indexHtml, next);
}

console.log(`built ${dist} (${code.length} bytes)`);
console.log(`cache-buster -> ${v}`);