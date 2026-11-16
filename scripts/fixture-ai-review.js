#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { loadCases } from './lib/regression-fixtures.js';
import { aiReviewStatus, DEFAULT_MODEL, reviewCase } from './lib/fixture-ai-review.js';
import { resolveLanguage, translator } from './lib/i18n.js';

/**
 * Asks a second model for its opinion on each regression fixture pair, along the
 * five checks of the human review, and stores it as ai_review in case.json.
 *
 * It approves nothing: review.status stays a human decision made with
 * fixtures:review. The verdict is bound to its input and turns stale when the
 * examples, case.json or the rule change. Without --slug only missing or stale
 * pre-reviews run.
 *
 * Output language follows --lang, then TYPO3_AI_LANG, then the system locale.
 *
 * Usage:
 *   npm run fixtures:ai-review
 *   npm run fixtures:ai-review -- --slug <slug> [--model <agy model>]
 */
try {
  const { values } = parseArgs({ options: {
    slug: { type: 'string' },
    model: { type: 'string' },
    lang: { type: 'string' },
  } });

  const language = resolveLanguage(values.lang);
  const t = translator(language);
  const cases = loadCases();
  if (values.slug && !cases.some((entry) => entry.slug === values.slug)) {
    throw new Error(t('review.unknownCase', { slug: values.slug, available: cases.map((entry) => entry.slug).join(', ') }));
  }
  const selected = values.slug
    ? cases.filter((entry) => entry.slug === values.slug)
    : cases.filter((entry) => aiReviewStatus(entry) !== 'CURRENT');
  if (selected.length === 0) console.log(t('aiReview.nothingToDo'));

  let failed = 0;
  for (const entry of selected) {
    console.log(t('aiReview.running', { slug: entry.slug }));
    try {
      const record = reviewCase(entry, { language, model: values.model || DEFAULT_MODEL });
      const manifest = path.join(entry.directory, 'case.json');
      const stored = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      stored.ai_review = record;
      fs.writeFileSync(manifest, `${JSON.stringify(stored, null, 2)}\n`, 'utf8');
      const concerns = record.checks.filter((check) => check.verdict === 'CONCERN').map((check) => check.id);
      console.log(concerns.length > 0
        ? t('aiReview.concerns', { slug: entry.slug, checks: concerns.join(', ') })
        : t('aiReview.clean', { slug: entry.slug }));
    } catch (error) {
      failed += 1;
      console.error(t('aiReview.failed', { slug: entry.slug, message: error.message }));
      // Without the CLI every further case would fail the same way.
      if (error.code === 'ENOENT') break;
    }
  }

  if (selected.length > 0) console.log(`\n${t('aiReview.notApproval')}`);
  if (failed > 0) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
