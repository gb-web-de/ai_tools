#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { contentDigest, loadCases } from './lib/regression-fixtures.js';

/**
 * Records a human review decision for a regression fixture pair.
 *
 * There is deliberately no "approve everything" switch. The point of the gate
 * is that someone read the two examples; a bulk flag would turn it into a
 * formality and the review status would stop meaning anything.
 *
 * Usage:
 *   npm run fixtures:review -- --show <slug>
 *   npm run fixtures:review -- --slug <slug> --by "Name"
 *   npm run fixtures:review -- --slug <slug> --reject --by "Name" --note "Grund"
 */
const CHECKLIST = [
  'Bildet das verwundbare Beispiel eine Schwachstelle ab, die in echtem TYPO3-Code so vorkommt?',
  'Trifft die in case.json beschriebene Ursache (root_cause) auf genau diesen Code zu?',
  'Ist das sichere Gegenbeispiel fachlich gleichwertig - loest es dieselbe Aufgabe, nur sicher?',
  'Stimmt die Herkunft: behauptet origin nicht mehr, als die Quelle hergibt?',
  'Ist der erwartete Identifier die Regel, die fuer diese Schwachstellenklasse zustaendig ist?',
];

function show(entry) {
  console.log(`${entry.slug}\n${'='.repeat(entry.slug.length)}\n`);
  console.log(`Titel:      ${entry.title}`);
  console.log(`Regel:      ${entry.rule}`);
  console.log(`Identifier: ${entry.expected_identifier}`);
  console.log(`Herkunft:   ${entry.origin.kind}${entry.origin.advisory_id ? ` ${entry.origin.advisory_id}` : ''}${entry.origin.link ? ` (${entry.origin.link})` : ''}`);
  console.log(`Aussage:    ${entry.origin.causal_fidelity}`);
  console.log(`Hinweis:    ${entry.origin.note}`);
  console.log(`\nUrsache:\n  ${entry.root_cause}\n`);

  for (const [label, key] of [['VERWUNDBAR', 'vulnerable_path'], ['SICHER', 'secure_path']]) {
    console.log(`--- ${label}: ${entry[key]} ${'-'.repeat(Math.max(0, 56 - entry[key].length))}`);
    console.log(fs.readFileSync(path.join(entry.directory, entry[key]), 'utf8').trimEnd());
    console.log();
  }

  console.log('Pruefpunkte:');
  for (const item of CHECKLIST) console.log(`  - ${item}`);
  console.log(`\nFreigeben:  npm run fixtures:review -- --slug ${entry.slug} --by "Dein Name"`);
  console.log(`Ablehnen:   npm run fixtures:review -- --slug ${entry.slug} --reject --by "Dein Name" --note "Grund"`);
}

try {
  const { values } = parseArgs({ options: {
    slug: { type: 'string' },
    show: { type: 'string' },
    by: { type: 'string' },
    note: { type: 'string' },
    reject: { type: 'boolean' },
  } });

  const cases = loadCases();
  const find = (slug) => {
    const entry = cases.find((item) => item.slug === slug);
    if (!entry) throw new Error(`Unbekannter Fall: ${slug}\nVerfügbar: ${cases.map((item) => item.slug).join(', ')}`);
    return entry;
  };

  if (values.show) {
    show(find(values.show));
    process.exit(0);
  }

  if (!values.slug) throw new Error('--slug <slug> oder --show <slug> ist erforderlich. Übersicht: npm run fixtures:status');
  if (!values.by?.trim()) throw new Error('--by "<Name>" ist erforderlich: eine Freigabe braucht einen benennbaren Reviewer.');
  if (values.note !== undefined && (typeof values.note !== 'string' || values.note.length > 2000)) throw new Error('--note ist zu lang (max. 2000 Zeichen).');
  if (values.reject && !values.note?.trim()) throw new Error('--reject benötigt --note "<Grund>", damit die Ablehnung nachvollziehbar bleibt.');

  const entry = find(values.slug);
  const status = values.reject ? 'REJECTED' : 'APPROVED';
  const manifest = path.join(entry.directory, 'case.json');
  const stored = JSON.parse(fs.readFileSync(manifest, 'utf8'));

  stored.review = {
    status,
    reviewed_by: values.by.trim(),
    reviewed_at: new Date().toISOString().slice(0, 10),
    // Binds the decision to the code that was read: editing either example
    // afterwards invalidates the approval instead of silently keeping it.
    content_digest: status === 'APPROVED' ? contentDigest(entry, entry.directory) : null,
    note: values.note?.trim() || null,
  };

  fs.writeFileSync(manifest, `${JSON.stringify(stored, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ slug: entry.slug, ...stored.review }, null, 2));
  if (status === 'APPROVED') console.log('\nHinweis: Wird eines der beiden Beispiele danach geändert, verfällt die Freigabe (Status STALE).');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
