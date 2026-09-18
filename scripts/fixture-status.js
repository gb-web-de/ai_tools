#!/usr/bin/env node

import process from 'node:process';
import { parseArgs } from 'node:util';
import { loadCases, declaredIdentifiers, effectiveStatus } from './lib/regression-fixtures.js';
import { resolveLanguage, translator } from './lib/i18n.js';

/**
 * Reports the human-review state of the versioned regression fixtures.
 *
 * Milestone 4 requires a human review and a stated provenance before a fixture
 * pair may be relied on for CI gating or rule generation. The regression tests
 * prove that a pair detects what it claims; this command shows whether a person
 * has actually signed off on it.
 *
 * An approval is bound to the content of the two example files. If either is
 * edited afterwards the approval turns STALE rather than silently vouching for
 * code nobody has read.
 *
 * --require-approved exits non-zero while any case is PENDING or STALE. Use it
 * in pipelines that must not consume unreviewed fixtures.
 */
const { values } = parseArgs({ options: {
  'require-approved': { type: 'boolean' },
  json: { type: 'boolean' },
  lang: { type: 'string' },
} });

const t = translator(resolveLanguage(values.lang));

const cases = loadCases().map((entry) => ({ ...entry, status: effectiveStatus(entry) }));
const byStatus = { APPROVED: [], PENDING: [], REJECTED: [], STALE: [] };
for (const entry of cases) byStatus[entry.status].push(entry);

const covered = new Set(cases.map((entry) => entry.expected_identifier));
const uncovered = declaredIdentifiers().filter((identifier) => !covered.has(identifier));

if (values.json) {
  console.log(JSON.stringify({
    total: cases.length,
    approved: byStatus.APPROVED.length,
    pending: byStatus.PENDING.length,
    rejected: byStatus.REJECTED.length,
    stale: byStatus.STALE.length,
    uncoveredIdentifiers: uncovered,
    cases: cases.map((entry) => ({
      slug: entry.slug,
      expected_identifier: entry.expected_identifier,
      origin_kind: entry.origin.kind,
      advisory_id: entry.origin.advisory_id ?? null,
      causal_fidelity: entry.origin.causal_fidelity,
      review: entry.review,
      effective_status: entry.status,
    })),
  }, null, 2));
} else {
  const stale = byStatus.STALE.length > 0 ? t('status.staleSuffix', { count: byStatus.STALE.length }) : '';
  console.log(`${t('status.summary', {
    total: cases.length,
    approved: byStatus.APPROVED.length,
    pending: byStatus.PENDING.length,
    rejected: byStatus.REJECTED.length,
    stale,
  })}\n`);

  const marks = { APPROVED: t('status.markApproved'), PENDING: t('status.markPending'), REJECTED: t('status.markRejected'), STALE: t('status.markStale') };
  for (const entry of cases) {
    const provenance = entry.origin.kind === 'ADVISORY' ? entry.origin.advisory_id : entry.origin.kind;
    const reviewer = entry.review.reviewed_by ? ` - ${entry.review.reviewed_by}, ${entry.review.reviewed_at}` : '';
    console.log(`${marks[entry.status]} ${entry.slug}`);
    console.log(`        ${entry.expected_identifier} | ${provenance} | ${entry.origin.causal_fidelity}${reviewer}`);
  }
  if (uncovered.length > 0) console.log(`\n${t('status.uncovered', { identifiers: uncovered.join(', ') })}`);
}

if (byStatus.STALE.length > 0) {
  console.error(`\n${t('status.staleWarning', { count: byStatus.STALE.length })}`);
}

const unapproved = byStatus.PENDING.length + byStatus.STALE.length;
if (values['require-approved'] && unapproved > 0) {
  console.error(`\n${t('status.gateFailed', { count: unapproved })}`);
  process.exitCode = 1;
}
