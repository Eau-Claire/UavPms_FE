#!/usr/bin/env node
/**
 * UAV-PMS Deterministic Policy Guard (Outer Harness — Layer 1)
 *
 * Enforces mandatory rules from docs/AI_SECURITY_AND_GOVERNANCE.md:
 * 1. Local-only GIS: blocks third-party online map tiles/geocoders/CDNs.
 * 2. Zero PII/Token Log Leaks: blocks console.log/debug in core/auth and data-access.
 * 3. Safe HTML Rendering: blocks unapproved bypassSecurityTrustHtml.
 *
 * Modes:
 *   default            Ratchet mode: fails on ANY violation not in scripts/harness-baseline.json.
 *   --strict           Fails on ALL violations including legacy baseline debt.
 *   --update-baseline  Writes current violations to scripts/harness-baseline.json.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');
const BASELINE_PATH = path.join(ROOT, 'scripts', 'harness-baseline.json');

const FORBIDDEN_MAP_DOMAINS = [
  /maps\.googleapis\.com/i,
  /maps\.gstatic\.com/i,
  /tile\.openstreetmap\.org/i,
  /api\.mapbox\.com/i,
  /tiles\.mapbox\.com/i,
  /basemaps\.cartocdn\.com/i,
  /server\.arcgisonline\.com/i,
];

const violations = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (/\.(ts|html|scss|css|json)$/.test(entry.name)) {
      inspectFile(fullPath);
    }
  }
}

function inspectFile(fullPath) {
  const relPath = path.relative(ROOT, fullPath).replace(/\\/g, '/');
  const isSpec = relPath.endsWith('.spec.ts');
  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split(/\r?\n/);

  lines.forEach((line, idx) => {
    const lineNo = idx + 1;

    if (!isSpec) {
      for (const pattern of FORBIDDEN_MAP_DOMAINS) {
        if (pattern.test(line)) {
          violations.push({
            key: `${relPath}|uav/local-only-gis|${pattern.source}`,
            file: relPath,
            line: lineNo,
            rule: 'uav/local-only-gis',
            message: `Forbidden external map/tile URL matched (${pattern}).`,
            fix: 'Use local PMTiles, local GeoJSON, or local schematic fallback per docs/AI_SECURITY_AND_GOVERNANCE.md section 4.1.',
          });
        }
      }
    }

    const isSensitiveLayer =
      !isSpec &&
      (relPath.startsWith('src/app/core/auth/') || relPath.includes('/data-access/'));
    if (isSensitiveLayer && /\bconsole\.(log|debug|info)\s*\(/.test(line)) {
      if (!line.includes('policy-allow-log')) {
        violations.push({
          key: `${relPath}|uav/no-sensitive-console-log|${line.trim().slice(0, 60)}`,
          file: relPath,
          line: lineNo,
          rule: 'uav/no-sensitive-console-log',
          message: 'Direct console.log/debug/info in auth or data-access layer risks leaking JWTs, PII, or GIS payloads.',
          fix: 'Remove console logging, or log only sanitized requestId/status/count with an explicit review justification.',
        });
      }
    }

    if (!isSpec && /\bbypassSecurityTrustHtml\s*\(/.test(line)) {
      if (!line.includes('security-reviewed')) {
        violations.push({
          key: `${relPath}|uav/no-unreviewed-trust-html|${line.trim().slice(0, 60)}`,
          file: relPath,
          line: lineNo,
          rule: 'uav/no-unreviewed-trust-html',
          message: 'bypassSecurityTrustHtml() used without explicit security review marker.',
          fix: 'Prefer Angular template bindings or DomSanitizer.sanitize(); if unavoidable, require ATTT review and annotate with // security-reviewed.',
        });
      }
    }
  });
}

function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return { policy: [], arch: [] };
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
}

walk(SRC_DIR);

const isStrict = process.argv.includes('--strict');
const isUpdate = process.argv.includes('--update-baseline');

if (isUpdate) {
  const baseline = readBaseline();
  baseline.policy = Array.from(new Set(violations.map((v) => v.key))).sort();
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n', 'utf8');
  console.log(`[check:policy] Updated baseline with ${baseline.policy.length} legacy item(s).`);
  process.exit(0);
}

const baselineSet = isStrict ? new Set() : new Set(readBaseline().policy ?? []);
const newViolations = violations.filter((v) => !baselineSet.has(v.key));
const legacyCount = violations.length - newViolations.length;

if (newViolations.length > 0) {
  console.error(
    `\n[check:policy] FAILED with ${newViolations.length} NEW UAV security policy violation(s) (${legacyCount} tracked in baseline):\n`
  );
  for (const v of newViolations) {
    console.error(`  ${v.file}:${v.line} [${v.rule}]`);
    console.error(`    Problem: ${v.message}`);
    console.error(`    How to fix: ${v.fix}\n`);
  }
  process.exit(1);
}

console.log(
  `[check:policy] PASSED — 0 new violations (${legacyCount} legacy item(s) tracked in scripts/harness-baseline.json).`
);
