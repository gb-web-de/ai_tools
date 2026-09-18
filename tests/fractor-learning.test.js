import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { recordDeveloperFix, reviewDeveloperFix } from '../scripts/lib/knowledge-store.js';
import { eligibleFixes, generateFractor, REMEDIATION } from '../scripts/lib/fractor-learning.js';
import { eligibleFixes as rectorEligible } from '../scripts/lib/rector-learning.js';

/** A TypoScript repair of exactly the shape the catalog learns. */
function fix(index, file = `Configuration/TypoScript/setup${index}.typoscript`) {
  return {
    title: `Escape rendered request data ${index}`,
    domain: 'Frontend',
    finding_type: 'XSS',
    explanation: 'The search term is rendered into the page and must not carry markup.',
    source: `TICKET-${index}`,
    remediation: REMEDIATION,
    diff: `--- a/${file}\n+++ b/${file}\n@@ -3,0 +4 @@\n+    htmlSpecialChars = 1`,
  };
}

function approvedStore(t, count) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'typo3-fractor-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (let index = 1; index <= count; index += 1) {
    const { developer_fix: stored } = recordDeveloperFix(directory, fix(index));
    reviewDeveloperFix(directory, { fix_id: stored.fix_id, review_status: 'APPROVED', reviewed_by: 'maintainer' });
  }
  return directory;
}

test('repeated approved TypoScript repairs produce a verified Fractor bundle', (t) => {
  const directory = approvedStore(t, 2);
  const outputDir = path.join(directory, 'generated');

  const preview = generateFractor({ knowledgeDir: directory, outputDir, dryRun: true });
  assert.equal(preview.status, 'CANDIDATE');
  assert.equal(fs.existsSync(outputDir), false, 'Ein Dry-Run darf nichts schreiben.');

  const result = generateFractor({ knowledgeDir: directory, outputDir });
  assert.equal(result.status, 'GENERATED');
  assert.equal(result.tool, 'fractor');
  assert.equal(result.language, 'typoscript');
  // Real Fractor ran: the rule repaired the vulnerable fixture, left the safe
  // one alone, and applying it twice changed nothing further.
  assert.deepEqual(result.checks, ['vulnerable_to_expected', 'safe_unchanged', 'idempotent', 'php_syntax']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(result.directory, 'manifest.json'))).status, 'EXPERIMENTAL');

  assert.equal(generateFractor({ knowledgeDir: directory, outputDir }).status, 'UNCHANGED');
});

test('a single repair is not evidence that a repair generalizes', (t) => {
  const directory = approvedStore(t, 1);
  const result = generateFractor({ knowledgeDir: directory, outputDir: path.join(directory, 'generated'), dryRun: true });
  assert.equal(result.status, 'INSUFFICIENT_EVIDENCE');
  assert.equal(result.required, 2);
});

test('two repairs from the same source do not count twice', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'typo3-fractor-source-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const index of [1, 2]) {
    const { developer_fix: stored } = recordDeveloperFix(directory, { ...fix(index), source: 'TICKET-SAME' });
    reviewDeveloperFix(directory, { fix_id: stored.fix_id, review_status: 'APPROVED', reviewed_by: 'maintainer' });
  }
  assert.equal(generateFractor({ knowledgeDir: directory, dryRun: true }).status, 'INSUFFICIENT_EVIDENCE');
});

test('unapproved and unrelated repairs never train the rule', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'typo3-fractor-negative-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  recordDeveloperFix(directory, fix(1));
  assert.equal(eligibleFixes(directory).length, 0, 'Ein PENDING-Fix darf nicht zählen.');

  // A patch that also rewrites the value is a different decision and must not
  // be folded into a rule that only ever appends the escaping property.
  const rewriting = recordDeveloperFix(directory, {
    ...fix(2),
    diff: '--- a/Configuration/TypoScript/setup.typoscript\n+++ b/Configuration/TypoScript/setup.typoscript\n@@ -3 +3 @@\n-    data = GP:q\n+    value = fixed',
  }).developer_fix;
  reviewDeveloperFix(directory, { fix_id: rewriting.fix_id, review_status: 'APPROVED', reviewed_by: 'maintainer' });
  assert.equal(eligibleFixes(directory).length, 0, 'Ein abweichendes Patch-Muster darf die Regel nicht trainieren.');

  // A PHP file is Rector's territory, whatever the remediation says.
  const phpFix = recordDeveloperFix(directory, {
    ...fix(3),
    diff: '--- a/Classes/Controller/X.php\n+++ b/Classes/Controller/X.php\n@@ -3,0 +4 @@\n+    htmlSpecialChars = 1',
  }).developer_fix;
  reviewDeveloperFix(directory, { fix_id: phpFix.fix_id, review_status: 'APPROVED', reviewed_by: 'maintainer' });
  assert.equal(eligibleFixes(directory).length, 0, 'Ein PHP-Patch darf keine TypoScript-Regel trainieren.');
});

test('a manually edited bundle is never overwritten', (t) => {
  const directory = approvedStore(t, 2);
  const outputDir = path.join(directory, 'generated');
  const result = generateFractor({ knowledgeDir: directory, outputDir });

  fs.appendFileSync(path.join(result.directory, 'fractor.php'), '\n// reviewed and adjusted by hand\n');
  assert.throws(() => generateFractor({ knowledgeDir: directory, outputDir }), /verändert/u);
});

test('a pure addition is a valid repair, but only Rector-shaped patches train Rector', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'typo3-fractor-diff-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  // Adding a missing check or escaping property removes no line. Requiring a
  // removal would reject the most common security repair there is.
  const stored = recordDeveloperFix(directory, fix(1)).developer_fix;
  assert.equal(stored.review_status, 'PENDING');
  assert.deepEqual(stored.changed_files, ['Configuration/TypoScript/setup1.typoscript']);

  // The Rector catalog stays strict: it only learns a one-for-one replacement,
  // so a pure addition must not reach it.
  reviewDeveloperFix(directory, { fix_id: stored.fix_id, review_status: 'APPROVED', reviewed_by: 'maintainer' });
  assert.equal(rectorEligible(directory).length, 0, 'Eine reine Hinzufügung darf keine Rector-Regel trainieren.');
});
