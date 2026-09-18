#!/usr/bin/env node

import process from 'node:process';
import { loadCases, declaredIdentifiers } from './lib/regression-fixtures.js';

/**
 * Reports the human-review state of the versioned regression fixtures.
 *
 * Milestone 4 requires a human review and a stated provenance before a fixture
 * pair may be relied on for CI gating or rule generation. The regression tests
 * prove that a pair detects what it claims; this command shows whether a person
 * has actually signed off on it.
 *
 * --require-approved exits non-zero while any case is still PENDING. Use it in
 * pipelines that must not consume unreviewed fixtures.
 */
const requireApproved = process.argv.includes('--require-approved');
const asJson = process.argv.includes('--json');

const cases = loadCases();
const byStatus = { APPROVED: [], PENDING: [], REJECTED: [] };
for (const entry of cases) byStatus[entry.review.status].push(entry);

const covered = new Set(cases.map((entry) => entry.expected_identifier));
const uncovered = declaredIdentifiers().filter((identifier) => !covered.has(identifier));

if (asJson) {
  console.log(JSON.stringify({
    total: cases.length,
    approved: byStatus.APPROVED.length,
    pending: byStatus.PENDING.length,
    rejected: byStatus.REJECTED.length,
    uncoveredIdentifiers: uncovered,
    cases: cases.map((entry) => ({
      slug: entry.slug,
      expected_identifier: entry.expected_identifier,
      origin_kind: entry.origin.kind,
      advisory_id: entry.origin.advisory_id ?? null,
      causal_fidelity: entry.origin.causal_fidelity,
      review: entry.review,
    })),
  }, null, 2));
} else {
  console.log(`Regressionsfälle: ${cases.length} (freigegeben ${byStatus.APPROVED.length}, offen ${byStatus.PENDING.length}, abgelehnt ${byStatus.REJECTED.length})\n`);
  for (const entry of cases) {
    const mark = { APPROVED: '[ok]  ', PENDING: '[offen]', REJECTED: '[abgelehnt]' }[entry.review.status];
    const provenance = entry.origin.kind === 'ADVISORY' ? entry.origin.advisory_id : entry.origin.kind;
    const reviewer = entry.review.status === 'APPROVED' ? ` - ${entry.review.reviewed_by}, ${entry.review.reviewed_at}` : '';
    console.log(`${mark} ${entry.slug}`);
    console.log(`        ${entry.expected_identifier} | ${provenance} | ${entry.origin.causal_fidelity}${reviewer}`);
  }
  if (uncovered.length > 0) console.log(`\nOhne Fixture-Paar: ${uncovered.join(', ')}`);
}

if (requireApproved && byStatus.PENDING.length > 0) {
  console.error(`\n${byStatus.PENDING.length} Fixture-Paar(e) ohne menschliche Freigabe. Ein Review ist Voraussetzung für die Nutzung in CI-Gates oder Regelerzeugung.`);
  process.exitCode = 1;
}
