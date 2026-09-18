import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { scanJavaScript, JS_IDENTIFIERS } from '../scripts/lib/js-security-scan.js';
import { scanTypoScript, TS_IDENTIFIERS } from '../scripts/lib/typoscript-security-scan.js';

const FIXTURE_ROOT = fileURLToPath(new URL('./fixtures/regression-assets/', import.meta.url));

const SCANNERS = {
  javascript: { scan: (source) => scanJavaScript(source, { sourceType: 'module' }), extension: 'js', identifiers: JS_IDENTIFIERS },
  typoscript: { scan: scanTypoScript, extension: 'typoscript', identifiers: TS_IDENTIFIERS },
};

const REQUIRED_FIELDS = ['slug', 'title', 'language', 'expected_identifier', 'root_cause', 'origin', 'review'];

function loadCases() {
  return fs.readdirSync(FIXTURE_ROOT, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => path.join(FIXTURE_ROOT, item.name))
    .sort()
    .map((directory) => {
      const manifest = path.join(directory, 'case.json');
      assert.ok(fs.existsSync(manifest), `${path.basename(directory)}: case.json fehlt.`);
      const entry = JSON.parse(fs.readFileSync(manifest, 'utf8'));

      const missing = REQUIRED_FIELDS.filter((field) => !entry[field]);
      assert.deepEqual(missing, [], `${path.basename(directory)}/case.json: Pflichtfelder fehlen: ${missing.join(', ')}`);
      assert.equal(entry.slug, path.basename(directory), 'slug passt nicht zum Verzeichnisnamen.');
      assert.ok(SCANNERS[entry.language], `${entry.slug}: unbekannte Sprache "${entry.language}".`);
      assert.ok(entry.origin.reference?.trim(), `${entry.slug}: origin.reference fehlt.`);

      const scanner = SCANNERS[entry.language];
      assert.ok(
        scanner.identifiers.includes(entry.expected_identifier),
        `${entry.slug}: expected_identifier "${entry.expected_identifier}" wird von keinem Scanner ausgegeben.`,
      );
      return { ...entry, directory, scanner };
    });
}

const cases = loadCases();
const read = (entry, variant) => fs.readFileSync(path.join(entry.directory, `${variant}.${entry.scanner.extension}`), 'utf8');
const describe = (finding) => `${finding.identifier} (Zeile ${finding.line})`;

test('the asset fixture corpus is not empty', () => {
  assert.ok(cases.length > 0);
});

for (const entry of cases) {
  test(`${entry.slug}: the vulnerable example is detected with ${entry.expected_identifier}`, () => {
    const findings = entry.scanner.scan(read(entry, 'vulnerable'));
    const matching = findings.filter((finding) => finding.identifier === entry.expected_identifier);
    assert.ok(
      matching.length > 0,
      `${entry.slug}: erwartet ${entry.expected_identifier}, gefunden: ${findings.map(describe).join(' | ') || 'kein Befund'}`,
    );

    // A fixture that also trips a different rule stops isolating the one it
    // claims to cover, so the pair would no longer be evidence for it.
    const foreign = findings.filter((finding) => finding.identifier !== entry.expected_identifier);
    assert.deepEqual(foreign.map(describe), [], `${entry.slug}: das verwundbare Beispiel löst zusätzlich fremde Regeln aus.`);
  });

  test(`${entry.slug}: the secure counterpart produces no finding`, () => {
    const findings = entry.scanner.scan(read(entry, 'secure'));
    assert.deepEqual(findings.map(describe), [], `${entry.slug}: das sichere Gegenbeispiel darf keinen Befund erzeugen.`);
  });
}

test('every scanner identifier is covered by a fixture pair', () => {
  const covered = new Set(cases.map((entry) => entry.expected_identifier));
  const uncovered = [...JS_IDENTIFIERS, ...TS_IDENTIFIERS].filter((identifier) => !covered.has(identifier));
  assert.deepEqual(uncovered, [], `Für diese Identifier fehlt ein Fixture-Paar: ${uncovered.join(', ')}`);
});

test('static markup and fixed navigation targets are not reported', () => {
  // The precision rule that keeps the scanner usable: a value static analysis
  // can prove constant is the author's own, not an attacker's.
  assert.deepEqual(scanJavaScript(`
    el.innerHTML = '<span class="badge">new</span>';
    el.innerHTML = \`<b>fixed</b>\`;
    el.innerHTML = '<a href="' + '/static' + '">go</a>';
    location.href = '/typo3/module/web/list';
    frame.postMessage(data, window.location.origin);
    window.addEventListener('message', (event) => { if (event.origin !== origin) return; use(event.data); });
    const token = 'changeme';
  `).map(describe), []);

  assert.deepEqual(scanTypoScript(`
    lib.a = TEXT
    lib.a.data = GP:q
    lib.a.htmlSpecialChars = 1
    lib.b = TEXT
    lib.b {
      data = GP:page
      intval = 1
    }
    lib.c.parseFunc.allowTags = p,b,i,a
    config.no_cache = 0
    config.debug = 0
  `).map(describe), []);
});

test('an unparsable JavaScript file is reported, never silently passed', () => {
  // A clean result over a file nobody could analyse is the worst possible
  // outcome: it reads as "no problems found".
  assert.throws(() => scanJavaScript('function ( { syntax error'), /Parsefehler/u);
});

test('TypoScript paths are resolved through blocks and conditions', () => {
  const findings = scanTypoScript(`
    lib.outer {
      inner {
        data = GP:x
      }
    }
  `);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].path, 'lib.outer.inner.data', 'Der Pfad wurde nicht über beide Blockebenen aufgelöst.');
});

test('comments and strings do not produce findings', () => {
  assert.deepEqual(scanJavaScript(`
    // el.innerHTML = value;
    /* eval(source); */
    const help = 'use eval() only for data you trust';
  `).map(describe), []);

  assert.deepEqual(scanTypoScript(`
    # lib.x.data = GP:q
    // config.no_cache = 1
    /* lib.y.data = GP:z */
  `).map(describe), []);
});
