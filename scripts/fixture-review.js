#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { contentDigest, loadCases } from './lib/regression-fixtures.js';
import { resolveLanguage, translator } from './lib/i18n.js';

/**
 * Records a human review decision for a regression fixture pair.
 *
 * There is deliberately no "approve everything" switch. The point of the gate
 * is that someone read the two examples; a bulk flag would turn it into a
 * formality and the review status would stop meaning anything.
 *
 * Output language follows --lang, then TYPO3_AI_LANG, then the system locale.
 *
 * Usage:
 *   npm run fixtures:review -- --show <slug>
 *   npm run fixtures:review -- --slug <slug> --by "Name"
 *   npm run fixtures:review -- --slug <slug> --reject --by "Name" --note "reason"
 */
function show(entry, t) {
  console.log(`${entry.slug}\n${'='.repeat(entry.slug.length)}\n`);
  console.log(`${t('review.fieldTitle')}${entry.title}`);
  console.log(`${t('review.fieldRule')}${entry.rule}`);
  console.log(`${t('review.fieldIdentifier')}${entry.expected_identifier}`);
  console.log(`${t('review.fieldOrigin')}${entry.origin.kind}${entry.origin.advisory_id ? ` ${entry.origin.advisory_id}` : ''}${entry.origin.link ? ` (${entry.origin.link})` : ''}`);
  console.log(`${t('review.fieldClaim')}${entry.origin.causal_fidelity}`);
  console.log(`${t('review.fieldNote')}${entry.origin.note}`);
  console.log(`\n${t('review.fieldCause')}\n  ${entry.root_cause}\n`);

  for (const [label, key] of [[t('review.labelVulnerable'), 'vulnerable_path'], [t('review.labelSecure'), 'secure_path']]) {
    console.log(`--- ${label}: ${entry[key]} ${'-'.repeat(Math.max(0, 56 - entry[key].length))}`);
    console.log(fs.readFileSync(path.join(entry.directory, entry[key]), 'utf8').trimEnd());
    console.log();
  }

  console.log(t('review.checklistHeading'));
  for (const key of ['review.check1', 'review.check2', 'review.check3', 'review.check4', 'review.check5']) console.log(`  - ${t(key)}`);
  console.log(`\n${t('review.checkNotYours')}`);
  console.log(`\n${t('review.hintApprove')}  npm run fixtures:review -- --slug ${entry.slug} --by "<name>"`);
  console.log(`${t('review.hintReject')}  npm run fixtures:review -- --slug ${entry.slug} --reject --by "<name>" --note "<reason>"`);
}

try {
  const { values } = parseArgs({ options: {
    slug: { type: 'string' },
    show: { type: 'string' },
    by: { type: 'string' },
    note: { type: 'string' },
    reject: { type: 'boolean' },
    lang: { type: 'string' },
  } });

  const t = translator(resolveLanguage(values.lang));
  const cases = loadCases();
  const find = (slug) => {
    const entry = cases.find((item) => item.slug === slug);
    if (!entry) throw new Error(t('review.unknownCase', { slug, available: cases.map((item) => item.slug).join(', ') }));
    return entry;
  };

  if (values.show) {
    show(find(values.show), t);
    process.exit(0);
  }

  if (!values.slug) throw new Error(t('review.slugRequired'));
  if (!values.by?.trim()) throw new Error(t('review.byRequired'));
  if (values.note !== undefined && (typeof values.note !== 'string' || values.note.length > 2000)) throw new Error(t('review.noteTooLong'));
  if (values.reject && !values.note?.trim()) throw new Error(t('review.rejectNeedsNote'));

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
  if (status === 'APPROVED') console.log(`\n${t('review.staleHint')}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
