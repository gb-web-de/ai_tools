import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  exportKnowledge,
  importKnowledge,
  planImport,
  readBundle,
  scanSensitive,
  validateBundle,
  writeBundle,
} from '../scripts/lib/knowledge-exchange.js';
import { queryKnowledge, readRecords, recordDeveloperFix, reviewDeveloperFix } from '../scripts/lib/knowledge-store.js';
import { eligibleFixes, generateRector } from '../scripts/lib/rector-learning.js';

/** Two independent local copies, standing in for two projects sharing a store. */
function projects(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'typo3-exchange-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  return {
    a: path.join(base, 'project-a/.typo3-knowledge'),
    b: path.join(base, 'project-b/.typo3-knowledge'),
    bundle: path.join(base, 'bundle.json'),
  };
}

function approvedFix(directory, index = 1) {
  const input = {
    title: `Explicit native unserialize ${index}`,
    domain: 'Core',
    finding_type: 'DESERIALIZATION',
    explanation: 'Objects are not expected in this payload.',
    source: `REVIEW-${index}`,
    remediation: 'unserialize_disallow_classes',
    diff: `--- a/Decode${index}.php\n+++ b/Decode${index}.php\n@@ -4 +4 @@\n-return \\unserialize($payload${index});\n+return \\unserialize($payload${index}, ['allowed_classes' => false]);`,
  };
  const { developer_fix: fix } = recordDeveloperFix(directory, input);
  reviewDeveloperFix(directory, { fix_id: fix.fix_id, review_status: 'APPROVED', reviewed_by: 'reviewer-a' });
  return fix;
}

function seedAdvisory(directory, advisory) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'advisories.json'), JSON.stringify([advisory], null, 2));
}

test('an approved case from project A is found in project B with provenance and review status', (t) => {
  const { a, b, bundle: bundleFile } = projects(t);
  const fix = approvedFix(a);
  seedAdvisory(a, { id: 'TYPO3-EXT-SA-2026-030', type: 'DESERIALIZATION', title: 'Object injection in an extension', description: 'unserialize on untrusted input', link: 'https://news.typo3.com/security/advisory/typo3-ext-sa-2026-030' });

  const { bundle, summary } = exportKnowledge(a, { label: 'project-a' });
  assert.equal(summary.counts.developer_fixes, 1);
  assert.equal(summary.counts.advisories, 1);
  writeBundle(bundleFile, bundle);

  const result = importKnowledge(b, readBundle(bundleFile));
  assert.equal(result.applied, true);
  assert.equal(result.totals.new, 2);
  assert.equal(result.totals.conflict, 0);

  const [imported] = readRecords(b, 'fixes_history.jsonl');
  assert.equal(imported.fingerprint, fix.fingerprint);
  assert.equal(imported.imported.from, 'project-a');
  assert.equal(imported.imported.origin_review.status, 'APPROVED');
  assert.equal(imported.imported.origin_review.reviewed_by, 'reviewer-a');

  // Findable through the same search local knowledge uses.
  const found = queryKnowledge(b, { query: 'unserialize' });
  assert.ok(found.results.some((entry) => entry.id === `developer_fix:${imported.fix_id}`), 'Importierter Fix ist nicht auffindbar.');
  assert.ok(found.results.some((entry) => entry.kind === 'advisory'), 'Importiertes Advisory ist nicht auffindbar.');
});

test('an import grants no approval and activates no Rector rule', (t) => {
  const { a, b, bundle: bundleFile } = projects(t);
  approvedFix(a, 1);
  approvedFix(a, 2);
  writeBundle(bundleFile, exportKnowledge(a, { label: 'project-a' }).bundle);

  // Two approved, distinct repairs are exactly what would train a rule locally.
  assert.equal(eligibleFixes(a).length, 2);
  assert.equal(generateRector({ knowledgeDir: a, dryRun: true }).status, 'CANDIDATE');

  importKnowledge(b, readBundle(bundleFile));
  for (const imported of readRecords(b, 'fixes_history.jsonl')) {
    assert.equal(imported.review_status, 'PENDING');
    assert.equal(imported.reviewed_by, null);
    assert.equal(imported.reviewed_at, null);
  }
  assert.equal(eligibleFixes(b).length, 0, 'Ein Import darf keinen Fix für die Regelerzeugung freischalten.');
  assert.equal(generateRector({ knowledgeDir: b, dryRun: true }).status, 'INSUFFICIENT_EVIDENCE');

  // A local reviewer can still approve deliberately, and then the rule becomes possible.
  for (const imported of readRecords(b, 'fixes_history.jsonl')) {
    reviewDeveloperFix(b, { fix_id: imported.fix_id, review_status: 'APPROVED', reviewed_by: 'reviewer-b' });
  }
  assert.equal(generateRector({ knowledgeDir: b, dryRun: true }).status, 'CANDIDATE');
});

test('repeated imports of the same bundle create no duplicates', (t) => {
  const { a, b, bundle: bundleFile } = projects(t);
  approvedFix(a);
  seedAdvisory(a, { id: 'TYPO3-EXT-SA-2026-031', type: 'XSS', title: 'Reflected XSS', description: 'unescaped output' });
  writeBundle(bundleFile, exportKnowledge(a, { label: 'project-a' }).bundle);

  const first = importKnowledge(b, readBundle(bundleFile));
  assert.equal(first.totals.new, 2);

  const second = importKnowledge(b, readBundle(bundleFile));
  assert.equal(second.totals.new, 0);
  assert.equal(second.totals.unchanged, 2);
  assert.equal(readRecords(b, 'fixes_history.jsonl').length, 1);
  assert.equal(readRecords(b, 'advisories.json').length, 1);
});

test('a conflicting record is reported and local knowledge survives', (t) => {
  const { a, b, bundle: bundleFile } = projects(t);
  seedAdvisory(a, { id: 'TYPO3-EXT-SA-2026-032', type: 'SQL_INJECTION', title: 'Version from project A', description: 'concatenated where clause' });
  seedAdvisory(b, { id: 'TYPO3-EXT-SA-2026-032', type: 'SQL_INJECTION', title: 'Version from project B', description: 'locally curated description' });
  writeBundle(bundleFile, exportKnowledge(a, { label: 'project-a' }).bundle);

  const result = importKnowledge(b, readBundle(bundleFile));
  assert.equal(result.totals.conflict, 1);
  assert.equal(result.totals.new, 0);
  assert.deepEqual(result.collections.advisories.conflict.map((entry) => entry.id), ['TYPO3-EXT-SA-2026-032']);

  const [local] = readRecords(b, 'advisories.json');
  assert.equal(local.title, 'Version from project B', 'Der lokale Stand darf nicht überschrieben werden.');
  assert.equal(readRecords(b, 'advisories.json').length, 1);
});

test('invalid bundles are rejected without touching the store', (t) => {
  const { a, b } = projects(t);
  seedAdvisory(b, { id: 'TYPO3-EXT-SA-2026-033', type: 'XSS', title: 'Local entry' });
  const before = fs.readFileSync(path.join(b, 'advisories.json'), 'utf8');

  assert.throws(() => validateBundle({ format: 'something-else', format_version: 1 }), /format/u);
  assert.throws(() => validateBundle({ format: 'typo3-security-knowledge-exchange', format_version: 99, exported_from: 'x', exported_at: new Date().toISOString(), records: {} }), /Version 99/u);
  assert.throws(() => validateBundle({ format: 'typo3-security-knowledge-exchange', format_version: 1, exported_from: 'x', exported_at: 'not-a-date', records: {} }), /Zeitstempel/u);
  assert.throws(() => validateBundle({ format: 'typo3-security-knowledge-exchange', format_version: 1, exported_from: 'x', exported_at: new Date().toISOString(), records: { advisories: ['plain string'] } }), /Liste von Objekten/u);
  assert.throws(() => readBundle(path.join(a, 'missing.json')), /nicht gefunden/u);

  assert.equal(fs.readFileSync(path.join(b, 'advisories.json'), 'utf8'), before);
});

test('malformed records are reported per entry while the rest of the bundle imports', (t) => {
  const { b } = projects(t);
  const bundle = {
    format: 'typo3-security-knowledge-exchange',
    format_version: 1,
    exported_at: new Date().toISOString(),
    exported_from: 'project-a',
    records: {
      advisories: [
        { id: 'TYPO3-EXT-SA-2026-034', type: 'XSS', title: 'Valid entry' },
        { type: 'XSS', title: 'Missing identifier' },
        { id: 'TYPO3-EXT-SA-2026-034', type: 'XSS', title: 'Duplicate within the bundle' },
      ],
      developer_fixes: [{ title: 'Broken', domain: 'Core', finding_type: 'DESERIALIZATION', explanation: 'x', diff: 'not a unified diff' }],
    },
  };

  const result = importKnowledge(b, bundle);
  assert.equal(result.totals.new, 1);
  assert.equal(result.totals.invalid, 3);
  assert.equal(readRecords(b, 'advisories.json').length, 1);
  assert.equal(readRecords(b, 'fixes_history.jsonl').length, 0);
});

test('a dry run previews the outcome without writing', (t) => {
  const { a, b, bundle: bundleFile } = projects(t);
  approvedFix(a);
  writeBundle(bundleFile, exportKnowledge(a, { label: 'project-a' }).bundle);

  const preview = importKnowledge(b, readBundle(bundleFile), { dryRun: true });
  assert.equal(preview.applied, false);
  assert.equal(preview.totals.new, 1);
  assert.equal(fs.existsSync(path.join(b, 'fixes_history.jsonl')), false);

  assert.equal(importKnowledge(b, readBundle(bundleFile)).totals.new, 1);
  assert.equal(readRecords(b, 'fixes_history.jsonl').length, 1);
});

test('only approved fixes are shared by default', (t) => {
  const { a } = projects(t);
  const pending = recordDeveloperFix(a, {
    title: 'Pending repair', domain: 'Core', finding_type: 'DESERIALIZATION', explanation: 'not reviewed yet',
    diff: '--- a/P.php\n+++ b/P.php\n@@ -1 +1 @@\n-return \\unserialize($p);\n+return \\unserialize($p, [\'allowed_classes\' => false]);',
  }).developer_fix;
  approvedFix(a, 9);

  const withoutPending = exportKnowledge(a, { label: 'project-a' });
  assert.equal(withoutPending.summary.counts.developer_fixes, 1);
  assert.ok(withoutPending.summary.skipped.some((entry) => entry.id === pending.fix_id && entry.reason === 'NOT_APPROVED'));

  const withPending = exportKnowledge(a, { label: 'project-a', includePending: true });
  assert.equal(withPending.summary.counts.developer_fixes, 2);

  reviewDeveloperFix(a, { fix_id: pending.fix_id, review_status: 'REJECTED', reviewed_by: 'reviewer-a' });
  const afterRejection = exportKnowledge(a, { label: 'project-a', includePending: true });
  assert.equal(afterRejection.summary.counts.developer_fixes, 1, 'Abgelehnte Fixes dürfen nie exportiert werden.');
});

test('the export blocks on content that looks confidential', (t) => {
  const { a } = projects(t);
  recordDeveloperFix(a, {
    title: 'Repair with an internal reference', domain: 'Core', finding_type: 'DESERIALIZATION',
    explanation: 'Reported from deploy-01.internal by ops@acme-corp.de',
    review_status: 'APPROVED', reviewed_by: 'reviewer-a',
    diff: '--- a/S.php\n+++ b/S.php\n@@ -1 +1 @@\n-return \\unserialize($p);\n+return \\unserialize($p, [\'allowed_classes\' => false]);',
  });

  assert.throws(() => exportKnowledge(a, { label: 'project-a' }), /vertrauliche Daten/u);

  const forced = exportKnowledge(a, { label: 'project-a', allowSensitive: true });
  assert.equal(forced.summary.counts.developer_fixes, 1);
  assert.equal(forced.summary.sensitive.length, 1);
  const labels = forced.summary.sensitive[0].findings.map((finding) => finding.id).sort();
  assert.deepEqual(labels, ['email_address', 'internal_host']);
  // A finding has to say where it is, or nobody can judge it.
  assert.ok(forced.summary.sensitive[0].findings.every((finding) => finding.field && finding.excerpt));
});

test('documented address ranges in advisories are not mistaken for leaks', () => {
  assert.deepEqual(scanSensitive({
    id: 'TYPO3-PSA-2024-005',
    recommendation: 'Block internal IP ranges (127.0.0.1, 10.0.0.0/8, 192.168.0.0/16, 169.254.169.254).',
  }), []);

  const real = scanSensitive({ diff: 'connect to 10.4.17.9 for the staging database' });
  assert.deepEqual(real.map((finding) => finding.id), ['private_ip']);
});

test('a tampered fingerprint cannot smuggle in a different fix', (t) => {
  const { a, b, bundle: bundleFile } = projects(t);
  const fix = approvedFix(a);
  const { bundle } = exportKnowledge(a, { label: 'project-a' });
  bundle.records.developer_fixes[0].fingerprint = 'f'.repeat(64);
  writeBundle(bundleFile, bundle);

  importKnowledge(b, readBundle(bundleFile));
  const [imported] = readRecords(b, 'fixes_history.jsonl');
  // The identity is recomputed from the payload, so the forged value is discarded.
  assert.equal(imported.fingerprint, fix.fingerprint);
  assert.equal(imported.fix_id, fix.fix_id);
});

test('planning an import never writes to the store', (t) => {
  const { a, b, bundle: bundleFile } = projects(t);
  approvedFix(a);
  writeBundle(bundleFile, exportKnowledge(a, { label: 'project-a' }).bundle);

  const plan = planImport(b, readBundle(bundleFile));
  assert.equal(plan.collections.developer_fixes.new.length, 1);
  assert.equal(fs.existsSync(b), false, 'planImport darf den Zielspeicher nicht anlegen.');
});

test('a fix without optional fields survives the round trip', (t) => {
  const { a, b, bundle: bundleFile } = projects(t);
  // recordDeveloperFix stores absent optional fields as null. A stored record
  // must pass its own validation, otherwise the exchange drops it in silence.
  const { developer_fix: fix } = recordDeveloperFix(a, {
    title: 'Repair without a source reference', domain: 'Core', finding_type: 'DESERIALIZATION',
    explanation: 'No ticket reference exists for this one.',
    diff: '--- a/N.php\n+++ b/N.php\n@@ -1 +1 @@\n-return \\unserialize($p);\n+return \\unserialize($p, [\'allowed_classes\' => false]);',
  });
  assert.equal(fix.source, null);
  reviewDeveloperFix(a, { fix_id: fix.fix_id, review_status: 'APPROVED', reviewed_by: 'reviewer-a' });

  const { bundle, summary } = exportKnowledge(a, { label: 'project-a' });
  assert.deepEqual(summary.skipped, []);
  assert.equal(summary.counts.developer_fixes, 1);

  writeBundle(bundleFile, bundle);
  assert.equal(importKnowledge(b, readBundle(bundleFile)).totals.new, 1);
  assert.equal(readRecords(b, 'fixes_history.jsonl')[0].fingerprint, fix.fingerprint);
});
