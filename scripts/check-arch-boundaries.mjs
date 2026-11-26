#!/usr/bin/env node
/**
 * UAV-PMS Architecture Boundary Guard (Outer Harness — Layer 1)
 *
 * Enforces clean module layering across src/app/:
 * 1. models/   must NOT import from core/, shared/, or features/.
 * 2. shared/   must NOT import from features/.
 * 3. features/<A> must NOT import from features/<B> (except features/shared/).
 *
 * Modes:
 *   default            Ratchet mode: fails on ANY violation not in scripts/harness-baseline.json.
 *   --strict           Fails on ALL violations including legacy baseline debt.
 *   --update-baseline  Writes current violations to scripts/harness-baseline.json.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, 'src', 'app');
const BASELINE_PATH = path.join(ROOT, 'scripts', 'harness-baseline.json');

const IMPORT_RE = /^\s*(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/gm;

const violations = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      inspectFile(fullPath);
    }
  }
}

function getLayer(relPath) {
  const parts = relPath.split('/');
  if (parts[0] !== 'src' || parts[1] !== 'app') return { layer: 'other', feature: null };
  const layer = parts[2];
  if (layer === 'features') {
    return { layer: 'features', feature: parts[3] ?? null };
  }
  return { layer, feature: null };
}

function inspectFile(fullPath) {
  const relPath = path.relative(ROOT, fullPath).replace(/\\/g, '/');
  const sourceInfo = getLayer(relPath);
  const content = fs.readFileSync(fullPath, 'utf8');

  for (const match of content.matchAll(IMPORT_RE)) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) continue;

    const resolvedAbs = path.resolve(path.dirname(fullPath), specifier);
    const targetRel = path.relative(ROOT, resolvedAbs).replace(/\\/g, '/');
    const targetInfo = getLayer(targetRel);

    const lineNo = content.slice(0, match.index).split(/\r?\n/).length;

    if (
      sourceInfo.layer === 'models' &&
      ['core', 'shared', 'features'].includes(targetInfo.layer)
    ) {
      violations.push({
        key: `${relPath}|arch/pure-models|${specifier}`,
        file: relPath,
        line: lineNo,
        rule: 'arch/pure-models',
        target: specifier,
        fix: 'Keep src/app/models/ free of core/shared/features imports. Move shared types into src/app/models/.',
      });
    }

    if (sourceInfo.layer === 'shared' && targetInfo.layer === 'features') {
      violations.push({
        key: `${relPath}|arch/shared-no-features|${specifier}`,
        file: relPath,
        line: lineNo,
        rule: 'arch/shared-no-features',
        target: specifier,
        fix: 'Move reusable contracts to src/app/models/ or pass data via input()/output() instead of importing a feature into shared/.',
      });
    }

    if (
      sourceInfo.layer === 'features' &&
      targetInfo.layer === 'features' &&
      sourceInfo.feature &&
      targetInfo.feature &&
      sourceInfo.feature !== targetInfo.feature &&
      targetInfo.feature !== 'shared'
    ) {
      violations.push({
        key: `${relPath}|arch/no-cross-feature-import|${specifier}`,
        file: relPath,
        line: lineNo,
        rule: 'arch/no-cross-feature-import',
        target: specifier,
        fix: `Feature "${sourceInfo.feature}" imported "${targetInfo.feature}". Extract shared types to src/app/models/ or shared UI/services to src/app/shared/ or src/app/core/.`,
      });
    }
  }
}

function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return { policy: [], arch: [] };
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
}

walk(APP_DIR);

const isStrict = process.argv.includes('--strict');
const isUpdate = process.argv.includes('--update-baseline');

if (isUpdate) {
  const baseline = readBaseline();
  baseline.arch = Array.from(new Set(violations.map((v) => v.key))).sort();
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n', 'utf8');
  console.log(`[check:arch] Updated baseline with ${baseline.arch.length} legacy item(s).`);
  process.exit(0);
}

const baselineSet = isStrict ? new Set() : new Set(readBaseline().arch ?? []);
const newViolations = violations.filter((v) => !baselineSet.has(v.key));
const legacyCount = violations.length - newViolations.length;

if (newViolations.length > 0) {
  console.error(
    `\n[check:arch] FAILED with ${newViolations.length} NEW architecture boundary violation(s) (${legacyCount} tracked in baseline):\n`
  );
  for (const v of newViolations) {
    console.error(`  ${v.file}:${v.line} [${v.rule}] -> "${v.target}"`);
    console.error(`    How to fix: ${v.fix}\n`);
  }
  process.exit(1);
}

console.log(
  `[check:arch] PASSED — 0 new violations (${legacyCount} legacy item(s) tracked in scripts/harness-baseline.json).`
);
