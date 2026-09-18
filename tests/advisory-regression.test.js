import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  allFixtureFiles,
  analyseFixtures,
  contentDigest,
  declaredIdentifiers,
  effectiveStatus,
  findingsFor,
  isSecurityFinding,
  loadCases,
  FIXTURE_ROOT,
} from '../scripts/lib/regression-fixtures.js';

const cases = loadCases();
const analysis = analyseFixtures();
const describe = (finding) => `${finding.identifier ?? 'ohne Identifier'} (Zeile ${finding.line}): ${finding.message}`;

test('the fixture corpus is not empty', () => {
  assert.ok(cases.length > 0, 'Keine Regressionsfälle unter tests/fixtures/regression gefunden.');
});

for (const entry of cases) {
  const where = path.relative(FIXTURE_ROOT, entry.directory);

  test(`${entry.slug}: the vulnerable example is detected with ${entry.expected_identifier}`, () => {
    const findings = findingsFor(analysis, entry.directory, entry.vulnerable_path);
    const matching = findings.filter((finding) => finding.identifier === entry.expected_identifier);

    assert.ok(
      matching.length > 0,
      `${where}/${entry.vulnerable_path}: erwartet ${entry.expected_identifier}, gefunden: ${findings.map(describe).join(' | ') || 'kein Befund'}`,
    );

    // A fixture that also trips a different security rule no longer isolates the
    // rule it claims to cover, so the pair would stop being evidence for it.
    const foreign = findings.filter((finding) => isSecurityFinding(finding) && finding.identifier !== entry.expected_identifier);
    assert.deepEqual(foreign.map(describe), [], `${where}/${entry.vulnerable_path}: löst zusätzlich fremde Sicherheitsregeln aus.`);
  });

  test(`${entry.slug}: the secure counterpart stays free of security findings`, () => {
    const findings = findingsFor(analysis, entry.directory, entry.secure_path).filter(isSecurityFinding);
    assert.deepEqual(findings.map(describe), [], `${where}/${entry.secure_path}: das sichere Gegenbeispiel darf keinen Sicherheitsbefund erzeugen.`);
  });

  test(`${entry.slug}: both examples analyse cleanly apart from the expected finding`, () => {
    for (const relativePath of [entry.vulnerable_path, entry.secure_path]) {
      const noise = findingsFor(analysis, entry.directory, relativePath).filter((finding) => !isSecurityFinding(finding));
      assert.deepEqual(noise.map(describe), [], `${where}/${relativePath}: enthält allgemeine Analysefehler und ist damit kein realistisches Codebeispiel.`);
    }
  });
}

test('every declared rule identifier is covered by a fixture pair', () => {
  const covered = new Set(cases.map((entry) => entry.expected_identifier));
  const uncovered = declaredIdentifiers().filter((identifier) => !covered.has(identifier));
  assert.deepEqual(uncovered, [], `Für diese Identifier fehlt ein Fixture-Paar: ${uncovered.join(', ')}`);
});

test('no PHP file below the fixture root escapes a reviewed case', () => {
  const claimed = new Set();
  for (const entry of cases) {
    for (const relativePath of [entry.vulnerable_path, entry.secure_path]) {
      claimed.add(path.resolve(path.join(entry.directory, relativePath)));
    }
  }

  // Supporting classes (models, repositories) legitimately live next to the two
  // named files; they must still sit inside a declared case directory.
  const caseDirectories = cases.map((entry) => path.resolve(entry.directory) + path.sep);
  const orphans = allFixtureFiles().filter((file) => !claimed.has(file) && !caseDirectories.some((directory) => file.startsWith(directory)));
  assert.deepEqual(orphans, [], 'Diese Fixture-Dateien gehören zu keinem Fall mit case.json.');
});

test('advisory-bound fixtures never overstate their provenance', () => {
  for (const entry of cases.filter((item) => item.origin.kind === 'ADVISORY')) {
    // DOCUMENTED_ROOT_CAUSE asserts the example reproduces the cause the
    // advisory actually describes. That claim needs the advisory text on record,
    // not just a link to it.
    if (entry.origin.causal_fidelity === 'DOCUMENTED_ROOT_CAUSE') {
      assert.ok(
        entry.origin.documented_cause?.trim(),
        `${entry.slug}: causal_fidelity=DOCUMENTED_ROOT_CAUSE verlangt origin.documented_cause mit dem belegten Ursachentext.`,
      );
    }
  }
});

test('an approval is bound to the reviewed content and expires when it changes', (t) => {
  const [sample] = cases;
  const manifest = path.join(sample.directory, 'case.json');
  const vulnerable = path.join(sample.directory, sample.vulnerable_path);
  const originalManifest = fs.readFileSync(manifest, 'utf8');
  const originalSource = fs.readFileSync(vulnerable, 'utf8');
  t.after(() => {
    fs.writeFileSync(manifest, originalManifest);
    fs.writeFileSync(vulnerable, originalSource);
  });

  const approve = () => {
    const stored = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    stored.review = {
      status: 'APPROVED',
      reviewed_by: 'test reviewer',
      reviewed_at: '2026-09-18',
      content_digest: contentDigest(sample, sample.directory),
      note: null,
    };
    fs.writeFileSync(manifest, `${JSON.stringify(stored, null, 2)}\n`);
    return loadCases().find((entry) => entry.slug === sample.slug);
  };

  assert.equal(effectiveStatus(approve()), 'APPROVED');

  // Editing an example after the fact must not keep a green review status:
  // the approval was a statement about the code that was read.
  fs.appendFileSync(vulnerable, '\n// edited after approval\n');
  assert.equal(effectiveStatus(loadCases().find((entry) => entry.slug === sample.slug)), 'STALE');

  fs.writeFileSync(vulnerable, originalSource);
  assert.equal(effectiveStatus(loadCases().find((entry) => entry.slug === sample.slug)), 'APPROVED');
});

test('an approval without a content digest is rejected as hand-edited', (t) => {
  const [sample] = cases;
  const manifest = path.join(sample.directory, 'case.json');
  const original = fs.readFileSync(manifest, 'utf8');
  t.after(() => fs.writeFileSync(manifest, original));

  const stored = JSON.parse(original);
  stored.review = { status: 'APPROVED', reviewed_by: 'someone', reviewed_at: '2026-09-18' };
  fs.writeFileSync(manifest, `${JSON.stringify(stored, null, 2)}\n`);

  assert.throws(() => loadCases(), /content_digest/u);
});
