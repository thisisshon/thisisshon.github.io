#!/usr/bin/env node
// Proofkit sync — dev-only propagation tool.
//
// Copies the self-contained Proofkit package (src/plugins/proofkit/) between
// projects, guarded by a semver check on the VERSION file so an outdated copy
// can be detected and refreshed without clobbering a newer one.
//
// Node built-ins only. No npm deps. See ./README.md for docs.

import { existsSync, readFileSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

// --- Locate this package root ---------------------------------------------
// This script lives at <pkg>/scripts/sync.mjs, so the package root is the
// parent of the script's own directory. Resolved from import.meta.url, never
// hardcoded, so the tool travels with the package.
const scriptDir = dirname(fileURLToPath(import.meta.url)); // <pkg>/scripts
const PKG_ROOT = dirname(scriptDir);                        // <pkg> = src/plugins/proofkit
const PKG_REL = join('src', 'plugins', 'proofkit');        // package location inside any project

// Names to skip when copying — build artefacts, VCS junk, and the dev tooling
// itself (scripts/ is not needed at runtime in the target).
const EXCLUDE = new Set(['node_modules', '.wrangler', '.git', 'scripts', '.DS_Store']);

// --- Helpers ---------------------------------------------------------------

function usage() {
  console.log(`Proofkit sync — copy the Proofkit package between projects (dev tooling).

Usage:
  node sync.mjs push <target-project-root> [--force]
      Copy THIS package into <target>/${PKG_REL}/

  node sync.mjs pull <source-project-root> [--force]
      Copy the package FROM <source>/${PKG_REL}/ into THIS repo.

  node sync.mjs check <other-project-root>
      Compare VERSION files (semver) and report which is newer. No copying.

Version guard: push/pull refuse when the destination is the SAME or NEWER
than the source, unless --force is passed as the last argument. A missing
destination is treated as a fresh install and always proceeds.

Excluded from copy: ${[...EXCLUDE].join(', ')}.`);
}

// Parse "x.y.z" into a [major, minor, patch] number tuple.
function parseVersion(str) {
  const parts = String(str).trim().split('.').map((n) => parseInt(n, 10));
  const [major = 0, minor = 0, patch = 0] = parts.map((n) => (Number.isFinite(n) ? n : 0));
  return [major, minor, patch];
}

// Compare two version strings: -1 a<b, 0 equal, 1 a>b.
function compareVersions(a, b) {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (va[i] < vb[i]) return -1;
    if (va[i] > vb[i]) return 1;
  }
  return 0;
}

// Read a VERSION file, or null if it does not exist.
function readVersion(pkgRoot) {
  const file = join(pkgRoot, 'VERSION');
  return existsSync(file) ? readFileSync(file, 'utf8').trim() : null;
}

// Recursively copy src → dest, honouring the EXCLUDE set (matched by basename).
function copyRecursive(src, dest) {
  const name = basename(src);
  if (EXCLUDE.has(name)) return;
  const st = statSync(src);
  if (st.isDirectory()) {
    mkdirSync(dest, { recursive: true });
    for (const entry of readdirSync(src)) {
      copyRecursive(join(src, entry), join(dest, entry));
    }
  } else {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
  }
}

function fail(msg) {
  console.error(`Error: ${msg}\n`);
  usage();
  process.exit(1);
}

// Print the post-copy reminder about the host-project seams (from INSTALL.md).
function printSeamsReminder(targetRoot) {
  console.log(`
Package copied. The target still needs these host seams (see ${PKG_REL}/INSTALL.md):
  1. The gated line in the shared layout:  {PROOFKIT_ENABLED && <ProofkitOverlay />}
  2. Route shim:  ${join('src', 'pages', 'review.astro')}
  3. Route shim:  ${join('src', 'pages', 'reviewdash.astro')}
  4. Route shim:  ${join('src', 'pages', 'teamdash.astro')}
Then set PUBLIC_REVIEW_WORKER_URL and deploy the worker.
Target: ${resolve(targetRoot)}`);
}

// Run a guarded push/pull copy. `direction` is only used for messaging.
function runCopy(srcPkg, destPkg, { force, targetRoot }) {
  if (!existsSync(srcPkg)) fail(`source package not found at ${srcPkg}`);

  const srcVer = readVersion(srcPkg);
  if (!srcVer) fail(`source VERSION file missing at ${join(srcPkg, 'VERSION')}`);
  const destVer = readVersion(destPkg); // null if fresh install

  console.log(`source ${srcVer} → destination ${destVer ?? '(none)'}`);

  if (destVer) {
    const cmp = compareVersions(srcVer, destVer);
    if (cmp <= 0 && !force) {
      console.error(
        cmp === 0
          ? 'Refused: destination is already at the same version. Pass --force to overwrite.'
          : 'Refused: destination is NEWER than the source. Pass --force to overwrite.'
      );
      process.exit(1);
    }
  }

  copyRecursive(srcPkg, destPkg);
  printSeamsReminder(targetRoot);
  process.exit(0);
}

// --- Command dispatch ------------------------------------------------------

const [command, otherRoot, maybeForce] = process.argv.slice(2);
const force = maybeForce === '--force' || otherRoot === '--force';

if (!command) {
  usage();
  process.exit(1);
}

switch (command) {
  case 'push': {
    if (!otherRoot || otherRoot === '--force') fail('push requires a <target-project-root>.');
    const destPkg = join(resolve(otherRoot), PKG_REL);
    runCopy(PKG_ROOT, destPkg, { force, targetRoot: otherRoot });
    break;
  }
  case 'pull': {
    if (!otherRoot || otherRoot === '--force') fail('pull requires a <source-project-root>.');
    const srcPkg = join(resolve(otherRoot), PKG_REL);
    runCopy(srcPkg, PKG_ROOT, { force, targetRoot: '.' });
    break;
  }
  case 'check': {
    if (!otherRoot) fail('check requires an <other-project-root>.');
    const otherPkg = join(resolve(otherRoot), PKG_REL);
    const thisVer = readVersion(PKG_ROOT);
    const otherVer = readVersion(otherPkg);
    if (!thisVer) fail(`this package has no VERSION file at ${join(PKG_ROOT, 'VERSION')}`);
    if (!otherVer) fail(`other package has no VERSION file at ${join(otherPkg, 'VERSION')}`);

    console.log(`this ${thisVer}  vs  other ${otherVer}`);
    const cmp = compareVersions(thisVer, otherVer);
    if (cmp > 0) console.log(`This package is NEWER — run: node sync.mjs push ${otherRoot}`);
    else if (cmp < 0) console.log(`Other package is NEWER — run: node sync.mjs pull ${otherRoot}`);
    else console.log('Both packages are at the same version.');
    process.exit(0);
    break;
  }
  default:
    fail(`unknown command "${command}".`);
}
