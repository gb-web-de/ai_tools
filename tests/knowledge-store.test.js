import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { indexKnowledge, queryKnowledge, recordDeveloperFix, reviewDeveloperFix, readRecords } from '../scripts/lib/knowledge-store.js';

export function sampleFix(index = 1) {
  return {
    title: `Deserialization fix ${index}`, domain: 'Core', finding_type: 'DESERIALIZATION',
    explanation: 'Disallow object creation; prefer JSON for new data.', source: `PR-${index}`,
    remediation: 'unserialize_disallow_classes',
    diff: `--- a/Classes/Decode${index}.php\n+++ b/Classes/Decode${index}.php\n@@ -4 +4 @@\n-$value = \\unserialize($payload${index});\n+$value = \\unserialize($payload${index}, ['allowed_classes' => false]);`,
  };
}

function directory(t) {
  const result = fs.mkdtempSync(path.join(os.tmpdir(), 'typo3-store-test-'));
  t.after(() => fs.rmSync(result, { recursive: true, force: true }));
  return result;
}

test('German concept query retrieves English evidence, relationships and safe examples', (t) => {
  const dir = directory(t);
  fs.writeFileSync(path.join(dir, 'advisories.json'), JSON.stringify([
    { id: 'LOCAL-1', title: 'Tenant isolation', type: 'DATA_LEAKAGE', secure_code: '$querySettings->setRespectStoragePage(true);' },
    { id: 'LOCAL-2', title: 'SQL injection', type: 'SQL_INJECTION' },
  ]));
  fs.writeFileSync(path.join(dir, 'learned_patterns.json'), JSON.stringify([{ pattern_id: 'QS', title: 'QuerySettings', domain: 'Extbase' }]));
  const result = queryKnowledge(dir, { query: 'Mandantentrennung', limit: 1 });
  assert.equal(result.totalMatched, 2);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].data.id, 'LOCAL-1');
  assert.deepEqual(result.results[0].matched_concepts, ['DATA_LEAKAGE']);
  assert.ok(result.results[0].related.includes('pattern:QS'));
  assert.equal(queryKnowledge(dir, { query: 'nonsense-no-match' }).totalMatched, 0);
  assert.equal(queryKnowledge(dir, { type: 'SQL_INJECTION' }).totalMatched, 1);
  const indexed = indexKnowledge(dir);
  const first = fs.readFileSync(indexed.file, 'utf8');
  indexKnowledge(dir);
  assert.equal(fs.readFileSync(indexed.file, 'utf8'), first);
  const entries = first.trim().split('\n').map(JSON.parse);
  assert.ok(entries.some((entry) => entry.record === 'edge' && entry.relation === 'addresses'));
  assert.deepEqual(fs.readdirSync(dir).sort(), ['advisories.json', 'graph.jsonl', 'learned_patterns.json']);
});

test('feedback is deduplicated, pending until reviewed, and query reflects new writes', (t) => {
  const dir = directory(t);
  const first = recordDeveloperFix(dir, sampleFix());
  assert.equal(first.developer_fix.review_status, 'PENDING');
  assert.equal(recordDeveloperFix(dir, sampleFix()).status, 'DUPLICATE');
  assert.equal(readRecords(dir, 'fixes_history.jsonl').length, 1);
  indexKnowledge(dir);
  recordDeveloperFix(dir, sampleFix(2));
  assert.equal(queryKnowledge(dir, { query: 'Deserialisierung' }).totalMatched, 2);
  reviewDeveloperFix(dir, { fix_id: first.developer_fix.fix_id, review_status: 'APPROVED', reviewed_by: 'reviewer' });
  assert.equal(readRecords(dir, 'fixes_history.jsonl')[0].review_status, 'APPROVED');
  reviewDeveloperFix(dir, { fix_id: first.developer_fix.fix_id, review_status: 'REJECTED', reviewed_by: 'reviewer' });
  assert.equal(readRecords(dir, 'fixes_history.jsonl')[0].review_status, 'REJECTED');
});

test('invalid, oversized, corrupt and concurrent writes fail without losing data', (t) => {
  const dir = directory(t);
  assert.throws(() => recordDeveloperFix(dir, { ...sampleFix(), diff: '-a\n+b' }), /Unified Diff/);
  assert.throws(() => recordDeveloperFix(dir, { ...sampleFix(), diff: sampleFix().diff.replace('@@ -4 +4 @@', '@@ -4,10 +4,10 @@') }), /Hunk/);
  assert.throws(() => recordDeveloperFix(dir, { ...sampleFix(), diff: 'ü'.repeat(100_001) }), /Größenlimit/);
  assert.throws(() => recordDeveloperFix(dir, { ...sampleFix(), review_status: 'APPROVED' }), /reviewed_by/);
  assert.throws(() => recordDeveloperFix(dir, { ...sampleFix(), diff: sampleFix().diff.replace('+++ b/Classes/', '+++ b/../') }), /Unsicherer Pfad/);
  assert.throws(() => queryKnowledge(dir, { limit: 500 }), /limit/);
  assert.throws(() => recordDeveloperFix(dir, undefined), /fehlt/);
  fs.writeFileSync(path.join(dir, '.learning.lock'), 'another process');
  assert.throws(() => recordDeveloperFix(dir, sampleFix()), /gesperrt/);
  fs.unlinkSync(path.join(dir, '.learning.lock'));
  fs.writeFileSync(path.join(dir, 'fixes_history.jsonl'), '{broken');
  assert.throws(() => recordDeveloperFix(dir, sampleFix()), /Ungültiger Wissensspeicher/);
  assert.equal(fs.readFileSync(path.join(dir, 'fixes_history.jsonl'), 'utf8'), '{broken');
  assert.ok(!fs.existsSync(path.join(dir, '.learning.lock')));
});
