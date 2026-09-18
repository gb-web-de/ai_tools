import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_LANGUAGE, LANGUAGES, messageKeys, missingTranslations, resolveLanguage, translator } from '../scripts/lib/i18n.js';

const root = fileURLToPath(new URL('../', import.meta.url));

test('every message exists in every language', () => {
  // A gap would surface as an English sentence in the middle of a German run.
  assert.deepEqual(missingTranslations(), []);
  assert.ok(messageKeys().length > 0);
});

test('the language resolution order is explicit, project, locale, default', () => {
  assert.equal(resolveLanguage('de', { LANG: 'en_US.UTF-8', TYPO3_AI_LANG: 'en' }), 'de', '--lang schlägt alles andere.');
  assert.equal(resolveLanguage(undefined, { TYPO3_AI_LANG: 'de', LANG: 'en_US.UTF-8' }), 'de', 'TYPO3_AI_LANG schlägt die System-Locale.');
  assert.equal(resolveLanguage(undefined, { LC_ALL: 'de_DE.UTF-8' }), 'de');
  assert.equal(resolveLanguage(undefined, { LC_MESSAGES: 'de_DE.UTF-8', LANG: 'en_US' }), 'de');
  assert.equal(resolveLanguage(undefined, { LANG: 'de_AT@euro' }), 'de', 'Regionale Varianten zählen zur Sprache.');

  // CI typically reports LANG=C, which has to land on the default rather than
  // on whatever the last developer had configured.
  assert.equal(resolveLanguage(undefined, { LANG: 'C' }), DEFAULT_LANGUAGE);
  assert.equal(resolveLanguage(undefined, {}), DEFAULT_LANGUAGE);

  // An unsupported locale is ignored, never an error: a tool must not fail
  // because a machine is set to a language it has no translation for.
  assert.equal(resolveLanguage(undefined, { LANG: 'fr_FR.UTF-8' }), DEFAULT_LANGUAGE);
  assert.equal(resolveLanguage('klingon', { LANG: 'de_DE.UTF-8' }), 'de', 'Ein unbekanntes --lang fällt auf die nächste Quelle zurück.');
});

test('translations differ per language and interpolate parameters', () => {
  const de = translator('de');
  const en = translator('en');
  assert.notEqual(de('import.inRequired'), en('import.inRequired'));
  assert.match(de('import.problems', { conflict: 2, invalid: 3 }), /2 Konflikt/u);
  assert.match(en('import.problems', { conflict: 2, invalid: 3 }), /2 conflict/u);
  // A missing parameter must stay visible instead of rendering as "undefined".
  assert.match(en('import.problems', { conflict: 1 }), /\{invalid\}/u);
  assert.throws(() => en('does.not.exist'), /Unbekannter Übersetzungsschlüssel/u);
});

test('every user-facing CLI accepts --lang', () => {
  const clis = ['fixture-status.js', 'fixture-review.js', 'knowledge-import.js', 'knowledge-export.js', 'learn-advisories.js'];
  for (const cli of clis) {
    const source = fs.readFileSync(path.join(root, 'scripts', cli), 'utf8');
    assert.match(source, /--lang|lang: \{ type: 'string' \}/u, `${cli} bietet keine Sprachwahl an.`);
    assert.match(source, /resolveLanguage/u, `${cli} nutzt die gemeinsame Sprachauflösung nicht.`);
  }
});

test('the documentation exists in both languages with the same structure', () => {
  const headings = (file) => fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => /^#{1,6} /u.test(line))
    .map((line) => line.match(/^#+/u)[0].length);

  for (const document of ['CONTINUOUS_LEARNING.md', 'SELF_LEARNING_ARCHITECTURE.md']) {
    const versions = LANGUAGES.map((language) => path.join(root, 'docs', language, document));
    for (const file of versions) assert.ok(fs.existsSync(file), `Fehlt: ${path.relative(root, file)}`);

    // Same heading levels in the same order: the two versions may word things
    // differently, but a section added on one side must not be missing on the
    // other, which is how bilingual docs silently drift apart.
    const [first, ...rest] = versions.map(headings);
    for (const [index, other] of rest.entries()) {
      assert.deepEqual(other, first, `${document}: ${LANGUAGES[index + 1]} hat eine andere Abschnittsstruktur als ${LANGUAGES[0]}.`);
    }
  }
});

test('each documentation page links to its counterpart', () => {
  for (const document of ['CONTINUOUS_LEARNING.md', 'SELF_LEARNING_ARCHITECTURE.md']) {
    for (const language of LANGUAGES) {
      const other = LANGUAGES.find((candidate) => candidate !== language);
      const source = fs.readFileSync(path.join(root, 'docs', language, document), 'utf8');
      assert.match(source, new RegExp(`\\.\\./${other}/${document.replace('.', '\\.')}`, 'u'), `${language}/${document} verlinkt die andere Sprachfassung nicht.`);
    }
  }
});
