import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { atomicWrite, digest, readRecords, validateFix } from './knowledge-store.js';

export const REMEDIATION = 'unserialize_disallow_classes';
const root = fileURLToPath(new URL('../../', import.meta.url));
const templateDirectory = path.join(root, 'typo3-security-suite/templates/rector');
const bundleFiles = ['DisallowUnserializeClassesRector.php', 'rector.php', 'vulnerable.php.inc', 'expected.php.inc', 'safe.php.inc'];

function matchesSupportedPatch(fix) {
  try { validateFix(fix); } catch { return false; }
  const removed = fix.diff.split('\n').filter((line) => line.startsWith('-') && !line.startsWith('---')).map((line) => line.slice(1).trim());
  const added = fix.diff.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++')).map((line) => line.slice(1).trim());
  // The catalog learns only this exact statement shape; patch text never becomes PHP source.
  if (removed.length !== 1 || added.length !== 1 || !fix.changed_files?.every((file) => file.endsWith('.php'))) return false;
  const match = removed[0].match(/^(\$[a-zA-Z_]\w* = |return )?\\unserialize\((\$[a-zA-Z_]\w*)\);$/u);
  return Boolean(match && added[0] === `${match[1] || ''}\\unserialize(${match[2]}, ['allowed_classes' => false]);`);
}

export function eligibleFixes(directory) {
  const distinct = new Map();
  for (const fix of readRecords(directory, 'fixes_history.jsonl')) {
    if (fix.review_status !== 'APPROVED' || !fix.reviewed_by?.trim() || !fix.source?.trim()
      || fix.finding_type !== 'DESERIALIZATION' || fix.remediation !== REMEDIATION || !matchesSupportedPatch(fix)) continue;
    const fingerprint = digest(`${fix.finding_type}\n${fix.diff.replaceAll('\r\n', '\n').trim()}`);
    if (fingerprint !== fix.fingerprint) continue;
    distinct.set(fingerprint, fix);
  }
  return [...distinct.values()].sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
}

function runPhp(arguments_, cwd) {
  const result = spawnSync('php', arguments_, { cwd, encoding: 'utf8', timeout: 120_000, maxBuffer: 2_000_000 });
  if (result.error || result.status !== 0) throw new Error(`PHP/Rector-Prüfung fehlgeschlagen: ${result.error?.message || result.stderr || result.stdout}`);
  return result.stdout;
}

export function verifyRectorBundle(directory, rectorBin = path.join(root, 'typo3-security-suite/vendor/bin/rector')) {
  if (!fs.existsSync(rectorBin)) throw new Error('Rector fehlt; composer install in typo3-security-suite ausführen.');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'typo3-rector-verify-'));
  try {
    for (const file of bundleFiles) fs.copyFileSync(path.join(directory, file), path.join(work, file));
    const fixtureDir = path.join(work, 'fixtures');
    fs.mkdirSync(fixtureDir);
    for (const kind of ['vulnerable', 'safe']) fs.copyFileSync(path.join(work, `${kind}.php.inc`), path.join(fixtureDir, `${kind}.php`));
    runPhp(['-l', path.join(work, bundleFiles[0])], work);
    const arguments_ = [rectorBin, 'process', fixtureDir, '--config', path.join(work, 'rector.php'), '--no-progress-bar', '--no-diffs'];
    runPhp(arguments_, work);
    const changed = fs.readFileSync(path.join(fixtureDir, 'vulnerable.php'), 'utf8');
    const safe = fs.readFileSync(path.join(fixtureDir, 'safe.php'), 'utf8');
    if (changed !== fs.readFileSync(path.join(work, 'expected.php.inc'), 'utf8')) throw new Error('Vulnerable-Fixture wurde nicht wie erwartet repariert.');
    if (safe !== fs.readFileSync(path.join(work, 'safe.php.inc'), 'utf8')) throw new Error('Safe-Code-Regression: Unbeteiligter Code wurde verändert.');
    runPhp([...arguments_, '--dry-run'], work);
    for (const kind of ['vulnerable', 'safe']) runPhp(['-l', path.join(fixtureDir, `${kind}.php`)], work);
    return ['vulnerable_to_expected', 'safe_unchanged', 'idempotent', 'php_syntax'];
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

export function generateRector({ knowledgeDir, outputDir = path.join(root, 'typo3-security-suite/generated/rector'), dryRun = false }) {
  const fixes = eligibleFixes(knowledgeDir);
  // Two different source references and different patches are required.
  if (fixes.length < 2 || new Set(fixes.map((fix) => fix.source.trim())).size < 2) {
    return { status: 'INSUFFICIENT_EVIDENCE', remediation: REMEDIATION, eligible_fixes: fixes.length, required: 2 };
  }
  if (dryRun) return { status: 'CANDIDATE', remediation: REMEDIATION, evidence: fixes.map((fix) => fix.fix_id) };
  const checks = verifyRectorBundle(templateDirectory);
  const hashes = Object.fromEntries(bundleFiles.map((file) => [file, digest(fs.readFileSync(path.join(templateDirectory, file)))]));
  // Content-addressed bundles do not overwrite a candidate that has been manually edited.
  const manifest = { schema_version: 1, remediation: REMEDIATION, status: 'EXPERIMENTAL', checks, evidence: fixes.map((fix) => ({ id: fix.fix_id, fingerprint: fix.fingerprint, source: fix.source, reviewed_by: fix.reviewed_by })), files: hashes };
  const bundleId = digest(JSON.stringify(manifest)).slice(0, 24);
  const target = path.join(outputDir, bundleId);
  if (fs.existsSync(target)) {
    for (const [file, hash] of Object.entries(hashes)) {
      if (digest(fs.readFileSync(path.join(target, file))) !== hash) throw new Error(`Vorhandenes Bundle wurde verändert: ${file}`);
    }
    if (fs.readFileSync(path.join(target, 'manifest.json'), 'utf8') !== `${JSON.stringify(manifest, null, 2)}\n`) throw new Error('Vorhandenes Manifest wurde verändert.');
    return { ...manifest, lifecycle_status: manifest.status, status: 'UNCHANGED', directory: target };
  }
  fs.mkdirSync(outputDir, { recursive: true });
  const stage = fs.mkdtempSync(path.join(outputDir, '.candidate-'));
  try {
    for (const file of bundleFiles) fs.copyFileSync(path.join(templateDirectory, file), path.join(stage, file));
    atomicWrite(path.join(stage, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    fs.renameSync(stage, target);
  } finally {
    if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true, force: true });
  }
  return { ...manifest, lifecycle_status: manifest.status, status: 'GENERATED', directory: target };
}
