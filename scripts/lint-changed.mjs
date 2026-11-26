#!/usr/bin/env node
/**
 * Diff-aware ESLint Ratchet (Brownfield AI-Native Harness)
 *
 * Lints only files added or modified compared to a base ref (default: origin/main,
 * falling back to HEAD / working tree) so every new or touched file MUST have
 * 0 lint errors while legacy debt is cleaned up incrementally.
 */

import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';

function gitFiles(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

const baseRef = process.env.LINT_BASE_REF || 'origin/main';
const fromBase = gitFiles(`git diff --name-only --diff-filter=ACMR ${baseRef}...HEAD`);
const staged = gitFiles('git diff --cached --name-only --diff-filter=ACMR');
const unstaged = gitFiles('git diff --name-only --diff-filter=ACMR');
const untracked = gitFiles('git ls-files --others --exclude-standard');

const candidates = Array.from(new Set([...fromBase, ...staged, ...unstaged, ...untracked]))
  .filter((f) => /^src\/.*\.(ts|html)$/.test(f))
  .filter((f) => fs.existsSync(f));

if (candidates.length === 0) {
  console.log('[lint:changed] No changed src/**/*.{ts,html} files to lint.');
  process.exit(0);
}

console.log(`[lint:changed] Linting ${candidates.length} changed file(s)...`);
const res = spawnSync(
  process.execPath,
  ['./node_modules/eslint/bin/eslint.js', ...candidates],
  { stdio: 'inherit' }
);
process.exit(res.status ?? 1);
