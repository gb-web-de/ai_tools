import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { aiReviewStatus, buildPrompt, parseVerdict, reviewCase, runAgy } from '../scripts/lib/fixture-ai-review.js';
import { FIXTURE_ROOT } from '../scripts/lib/regression-fixtures.js';

const answer = (overrides = {}) => ({
  checks: [1, 2, 3, 4, 5].map((id) => ({ id, verdict: id === 3 ? 'CONCERN' : 'PASS', reason: `Begründung ${id}` })),
  summary: 'Zuerst Prüfpunkt 3 ansehen.',
  ...overrides,
});

/** A private copy of a real case, so the test never writes into the corpus. */
function copyCase(t, slug = 'sql-injection-querybuilder-where') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'typo3-ai-review-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.cpSync(path.join(FIXTURE_ROOT, slug), directory, { recursive: true });
  return { ...JSON.parse(fs.readFileSync(path.join(directory, 'case.json'), 'utf8')), directory };
}

test('the prompt carries the evidence, but no review state, reviewer name or local path', (t) => {
  const entry = copyCase(t);
  const prompt = buildPrompt({ ...entry, review: { status: 'APPROVED', reviewed_by: 'Jemand' } }, 'de');
  assert.match(prompt, /->where\('form_identifier = ' \. \$formIdentifier\)/u, 'vulnerable example');
  assert.match(prompt, /createNamedParameter\(\$formIdentifier/u, 'secure counterpart');
  assert.match(prompt, /class SqlInjectionQueryBuilderRule/u, 'source of the expected rule');
  assert.match(prompt, /typo3Security\.ssrf/u, 'identifiers the rule set can emit');
  assert.match(prompt, /in German/u);
  assert.doesNotMatch(prompt, /reviewed_by|content_digest|Jemand/u);
  assert.ok(!prompt.includes(entry.directory));
});

test('a verdict is bound to its input and survives the human decision', (t) => {
  const entry = copyCase(t);
  let call;
  const record = reviewCase(entry, { language: 'de', model: 'test-model', run: (prompt, model) => { call = { prompt, model }; return answer(); } });
  assert.equal(call.model, 'test-model');
  assert.match(call.prompt, /EVIDENCE START/u);
  assert.deepEqual(record.checks.map((check) => check.verdict), ['PASS', 'PASS', 'CONCERN', 'PASS', 'PASS']);
  assert.equal(record.model, 'test-model');

  const reviewed = { ...entry, ai_review: record };
  assert.equal(aiReviewStatus({ ...entry, ai_review: undefined }), 'MISSING');
  assert.equal(aiReviewStatus(reviewed), 'CURRENT');
  assert.equal(aiReviewStatus({ ...reviewed, review: { status: 'REJECTED' } }), 'CURRENT', 'A human decision does not invalidate the second opinion.');
  assert.equal(aiReviewStatus({ ...reviewed, root_cause: 'Eine andere Ursache.' }), 'STALE');
  fs.appendFileSync(path.join(entry.directory, entry.vulnerable_path), '\n// edited\n');
  assert.equal(aiReviewStatus(reviewed), 'STALE');
});

test('malformed reviewer output is rejected and control characters are stripped', () => {
  const checks = answer().checks;
  assert.throws(() => parseVerdict(null), /kein Objekt/u);
  assert.throws(() => parseVerdict(answer({ checks: checks.slice(0, 4) })), /genau 5 Prüfpunkte/u);
  assert.throws(() => parseVerdict(answer({ checks: [...checks].reverse() })), /Prüfpunkt 1 fehlt/u);
  assert.throws(() => parseVerdict(answer({ checks: checks.map((check) => ({ ...check, verdict: 'APPROVED' })) })), /PASS oder CONCERN/u);
  assert.throws(() => parseVerdict(answer({ checks: checks.map((check) => ({ ...check, reason: ' \u001b ' })) })), /Begründung fehlt/u);
  assert.throws(() => parseVerdict(answer({ summary: 42 })), /summary fehlt/u);
  const cleaned = parseVerdict(answer({ summary: 'rot\u001b[31m\u202e gefärbt' }));
  assert.equal(cleaned.summary, 'rot[31m gefärbt');
});

test('agy runs in an empty private workspace and returns its structured output', (t) => {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'typo3-fake-agy-'));
  t.after(() => fs.rmSync(bin, { recursive: true, force: true }));
  // Stands in for the real CLI: records how it was called, answers like agy --output-format json.
  fs.writeFileSync(path.join(bin, 'fake-agy.cjs'), `
const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(path.join(bin, 'call.json'))}, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), files: fs.readdirSync(process.cwd()) }));
const status = process.env.FAKE_AGY_STATUS || 'SUCCESS';
console.log(JSON.stringify({ status, response: 'Kontingent erschöpft', structured_output: status === 'SUCCESS' ? { checks: [] } : undefined }));
`);
  fs.writeFileSync(path.join(bin, 'agy'), '#!/bin/sh\nexec node "$(dirname "$0")/fake-agy.cjs" "$@"\n', { mode: 0o755 });
  const originalPath = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${originalPath}`;
  t.after(() => { process.env.PATH = originalPath; delete process.env.FAKE_AGY_STATUS; });

  assert.deepEqual(runAgy('Prompt mit\nZeilenumbruch', 'some-model'), { checks: [] });
  const call = JSON.parse(fs.readFileSync(path.join(bin, 'call.json'), 'utf8'));
  assert.equal(call.args[0], '--print=Prompt mit\nZeilenumbruch');
  assert.equal(call.args[call.args.indexOf('--model') + 1], 'some-model');
  assert.ok(call.args.includes('--sandbox'));
  assert.ok(!call.args.includes('--dangerously-skip-permissions'));
  assert.deepEqual(JSON.parse(call.args[call.args.indexOf('--json-schema') + 1]).required, ['checks', 'summary']);
  assert.deepEqual(call.files, [], 'The reviewer starts in an empty directory.');
  assert.equal(fs.existsSync(call.cwd), false, 'The workspace is removed afterwards.');

  process.env.FAKE_AGY_STATUS = 'ERROR';
  assert.throws(() => runAgy('x', 'some-model'), /agy meldete ERROR: Kontingent erschöpft/u);
  assert.throws(() => runAgy('x'.repeat(100_001), 'some-model'), /Prompt größer/u);
});
