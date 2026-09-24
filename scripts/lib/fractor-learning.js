import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { atomicWrite, digest, readRecords, validateFix } from './knowledge-store.js';

/**
 * Fractor counterpart of rector-learning.js.
 *
 * Rector only refactors PHP, so the HEAL stage of the learning loop stopped at
 * the language boundary: a TypoScript finding could be recorded and searched,
 * but never repaired automatically. Fractor works on the TypoScript AST, which
 * closes that gap for the most common finding the TypoScript scanner reports.
 */
export const REMEDIATION = 'typoscript_htmlspecialchars';

const root = fileURLToPath(new URL('../../', import.meta.url));
const templateDirectory = path.join(root, 'typo3-security-suite/templates/fractor');
const bundleFiles = ['EscapeRequestDataTypoScriptFractor.php', 'fractor.php'];
const fixtureFiles = ['vulnerable.typoscript', 'safe.typoscript'];

/**
 * The catalog learns exactly one patch shape: adding htmlSpecialChars = 1 to a
 * block that reads request data. Anything else is a different repair and must
 * not train this rule.
 */
function matchesSupportedPatch(fix) {
  try { validateFix(fix); } catch { return false; }

  const lines = fix.diff.replaceAll('\r\n', '\n').split('\n');
  const removed = lines.filter((line) => line.startsWith('-') && !line.startsWith('---')).map((line) => line.slice(1).trim());
  const added = lines.filter((line) => line.startsWith('+') && !line.startsWith('+++')).map((line) => line.slice(1).trim());

  // A pure addition of the escaping property, nothing removed and nothing else
  // added: a patch that also changes the value is a different decision.
  if (removed.length !== 0 || added.length !== 1) return false;
  if (!fix.changed_files?.every((file) => /\.(?:typoscript|tsconfig|txt|ts)$/u.test(file))) return false;

  return /^htmlSpecialChars\s*=\s*1$/iu.test(added[0]);
}

export function eligibleFixes(directory) {
  const distinct = new Map();
  for (const fix of readRecords(directory, 'fixes_history.jsonl')) {
    if (fix.review_status !== 'APPROVED' || !fix.reviewed_by?.trim() || !fix.source?.trim()
      || fix.finding_type !== 'XSS' || fix.remediation !== REMEDIATION || !matchesSupportedPatch(fix)) continue;
    // A hand-edited fingerprint must not smuggle a different patch into the evidence.
    const fingerprint = digest(`${fix.finding_type}\n${fix.diff.replaceAll('\r\n', '\n').trim()}`);
    if (fingerprint !== fix.fingerprint) continue;
    distinct.set(fingerprint, fix);
  }
  return [...distinct.values()].sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
}

function runFractor(arguments_, cwd) {
  const result = spawnSync('php', arguments_, { cwd, encoding: 'utf8', timeout: 180_000, maxBuffer: 4_000_000 });
  if (result.error || result.status !== 0) {
    throw new Error(`Fractor-Prüfung fehlgeschlagen: ${result.error?.message || result.stderr || result.stdout}`);
  }
  return result.stdout;
}

/**
 * Runs the real installed Fractor against isolated fixtures before a bundle is
 * published. A rule that nobody has seen transform anything is a proposal, not
 * a repair.
 */
export function verifyFractorBundle(directory, fractorBin = path.join(root, 'typo3-security-suite/vendor/bin/fractor')) {
  if (!fs.existsSync(fractorBin)) throw new Error('Fractor fehlt; composer install in typo3-security-suite ausführen.');

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'typo3-fractor-verify-'));
  try {
    for (const file of bundleFiles) fs.copyFileSync(path.join(directory, file), path.join(work, file));
    const fixtureDir = path.join(work, 'fixtures');
    fs.mkdirSync(fixtureDir);
    for (const file of fixtureFiles) fs.copyFileSync(path.join(directory, 'fixtures', file), path.join(fixtureDir, file));

    const safeBefore = fs.readFileSync(path.join(fixtureDir, 'safe.typoscript'), 'utf8');
    const arguments_ = [fractorBin, 'process', '--config', path.join(work, 'fractor.php'), '--no-progress-bar'];
    runFractor(arguments_, work);

    const repaired = fs.readFileSync(path.join(fixtureDir, 'vulnerable.typoscript'), 'utf8');
    if (!/^\s*htmlSpecialChars\s*=\s*1\s*$/mu.test(repaired)) {
      throw new Error('Vulnerable-Fixture wurde nicht repariert: htmlSpecialChars fehlt.');
    }
    if (fs.readFileSync(path.join(fixtureDir, 'safe.typoscript'), 'utf8') !== safeBefore) {
      throw new Error('Safe-Code-Regression: Unbeteiligtes TypoScript wurde verändert.');
    }

    // A second run must not add the property again, or applying the rule twice
    // would corrupt a file.
    runFractor(arguments_, work);
    const afterSecondRun = fs.readFileSync(path.join(fixtureDir, 'vulnerable.typoscript'), 'utf8');
    if (afterSecondRun !== repaired) throw new Error('Regel ist nicht idempotent: ein zweiter Lauf verändert die Datei erneut.');

    runFractor(['-l', path.join(work, bundleFiles[0])], work);
    return ['vulnerable_to_expected', 'safe_unchanged', 'idempotent', 'php_syntax'];
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

export function generateFractor({ knowledgeDir, outputDir = path.join(root, 'typo3-security-suite/generated/fractor'), dryRun = false }) {
  const fixes = eligibleFixes(knowledgeDir);
  // Two distinct source references: one developer repeating themselves is not
  // evidence that a repair generalizes.
  if (fixes.length < 2 || new Set(fixes.map((fix) => fix.source.trim())).size < 2) {
    return { status: 'INSUFFICIENT_EVIDENCE', remediation: REMEDIATION, eligible_fixes: fixes.length, required: 2 };
  }
  if (dryRun) return { status: 'CANDIDATE', remediation: REMEDIATION, evidence: fixes.map((fix) => fix.fix_id) };

  const checks = verifyFractorBundle(templateDirectory);
  const allFiles = [...bundleFiles, ...fixtureFiles.map((file) => `fixtures/${file}`)];
  const hashes = Object.fromEntries(allFiles.map((file) => [file, digest(fs.readFileSync(path.join(templateDirectory, file)))]));

  const manifest = {
    schema_version: 1,
    tool: 'fractor',
    language: 'typoscript',
    remediation: REMEDIATION,
    status: 'EXPERIMENTAL',
    checks,
    evidence: fixes.map((fix) => ({ id: fix.fix_id, fingerprint: fix.fingerprint, source: fix.source, reviewed_by: fix.reviewed_by })),
    files: hashes,
  };

  // Content-addressed: a manually edited candidate is never overwritten.
  const bundleId = digest(JSON.stringify(manifest)).slice(0, 24);
  const target = path.join(outputDir, bundleId);

  if (fs.existsSync(target)) {
    for (const [file, hash] of Object.entries(hashes)) {
      if (digest(fs.readFileSync(path.join(target, file))) !== hash) throw new Error(`Vorhandenes Bundle wurde verändert: ${file}`);
    }
    if (fs.readFileSync(path.join(target, 'manifest.json'), 'utf8') !== `${JSON.stringify(manifest, null, 2)}\n`) {
      throw new Error('Vorhandenes Manifest wurde verändert.');
    }
    return { ...manifest, lifecycle_status: manifest.status, status: 'UNCHANGED', directory: target };
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const stage = fs.mkdtempSync(path.join(outputDir, '.candidate-'));
  try {
    for (const file of bundleFiles) fs.copyFileSync(path.join(templateDirectory, file), path.join(stage, file));
    fs.mkdirSync(path.join(stage, 'fixtures'));
    for (const file of fixtureFiles) fs.copyFileSync(path.join(templateDirectory, 'fixtures', file), path.join(stage, 'fixtures', file));
    atomicWrite(path.join(stage, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    fs.renameSync(stage, target);
  } finally {
    if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true, force: true });
  }

  return { ...manifest, lifecycle_status: manifest.status, status: 'GENERATED', directory: target };
}
