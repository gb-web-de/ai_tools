import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { recordDeveloperFix, reviewDeveloperFix } from '../scripts/lib/knowledge-store.js';
import { eligibleFixes, generateRector } from '../scripts/lib/rector-learning.js';

function fix(index) {
  return {
    title: `Explicit native unserialize ${index}`, domain: 'Core', finding_type: 'DESERIALIZATION',
    explanation: 'Objects are not expected in this payload.', source: `REVIEW-${index}`,
    remediation: 'unserialize_disallow_classes',
    diff: `--- a/Decode${index}.php\n+++ b/Decode${index}.php\n@@ -4 +4 @@\n-return \\unserialize($payload${index});\n+return \\unserialize($payload${index}, ['allowed_classes' => false]);`,
  };
}

test('only repeated approved exact repairs produce a verified Rector bundle', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typo3-rector-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const options = { knowledgeDir: dir, outputDir: path.join(dir, 'generated') };
  const a = recordDeveloperFix(dir, fix(1)).developer_fix;
  const b = recordDeveloperFix(dir, fix(2)).developer_fix;
  assert.equal(generateRector(options).status, 'INSUFFICIENT_EVIDENCE');
  reviewDeveloperFix(dir, { fix_id: a.fix_id, review_status: 'APPROVED', reviewed_by: 'maintainer' });
  assert.equal(generateRector(options).status, 'INSUFFICIENT_EVIDENCE');
  reviewDeveloperFix(dir, { fix_id: b.fix_id, review_status: 'APPROVED', reviewed_by: 'maintainer' });
  assert.equal(generateRector({ ...options, dryRun: true }).status, 'CANDIDATE');
  assert.ok(!fs.existsSync(options.outputDir));
  const result = generateRector(options);
  assert.equal(result.status, 'GENERATED');
  assert.deepEqual(result.checks, ['vulnerable_to_expected', 'safe_unchanged', 'idempotent', 'php_syntax']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(result.directory, 'manifest.json'))).status, 'EXPERIMENTAL');
  assert.equal(generateRector(options).status, 'UNCHANGED');
  fs.appendFileSync(path.join(result.directory, 'DisallowUnserializeClassesRector.php'), '\n// manual edit');
  assert.throws(() => generateRector(options), /verändert/);
  reviewDeveloperFix(dir, { fix_id: b.fix_id, review_status: 'REJECTED', reviewed_by: 'maintainer' });
  assert.equal(eligibleFixes(dir).length, 1);
});

test('arbitrary approved code and duplicate sources cannot train a rule', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typo3-rector-negative-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  recordDeveloperFix(dir, { ...fix(1), review_status: 'APPROVED', reviewed_by: 'reviewer' });
  recordDeveloperFix(dir, { ...fix(2), source: 'REVIEW-1', review_status: 'APPROVED', reviewed_by: 'reviewer' });
  assert.equal(generateRector({ knowledgeDir: dir }).status, 'INSUFFICIENT_EVIDENCE');
  recordDeveloperFix(dir, { ...fix(3), diff: fix(3).diff.replace("['allowed_classes' => false]", "system('id')"), review_status: 'APPROVED', reviewed_by: 'reviewer' });
  assert.equal(eligibleFixes(dir).length, 2);
});
