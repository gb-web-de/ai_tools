#!/usr/bin/env node
import process from 'node:process';
import { parseArgs } from 'node:util';
import { exportKnowledge, writeBundle } from './lib/knowledge-exchange.js';
import { resolveKnowledgeDir } from './lib/knowledge-paths.js';

/**
 * Writes a shareable bundle from the local knowledge store.
 *
 * Usage:
 *   npm run knowledge:export -- --out ../typo3-knowledge-share/bundle.json
 *   npm run knowledge:export -- --out b.json --label "project-a" --include-pending
 *   npm run knowledge:export -- --dry-run
 */
try {
  const { values } = parseArgs({ options: {
    out: { type: 'string' },
    label: { type: 'string' },
    'knowledge-dir': { type: 'string' },
    'include-pending': { type: 'boolean' },
    'allow-sensitive': { type: 'boolean' },
    'dry-run': { type: 'boolean' },
  } });

  const directory = resolveKnowledgeDir(values['knowledge-dir']);
  const { bundle, summary } = exportKnowledge(directory, {
    includePending: values['include-pending'],
    allowSensitive: values['allow-sensitive'],
    label: values.label || undefined,
  });

  if (!values['dry-run'] && !values.out) throw new Error('--out <datei> ist erforderlich (oder --dry-run für eine Vorschau).');
  const file = values['dry-run'] ? null : writeBundle(values.out, bundle);

  console.log(JSON.stringify({
    knowledgeDir: directory,
    file,
    dryRun: Boolean(values['dry-run']),
    exported_from: bundle.exported_from,
    format_version: bundle.format_version,
    ...summary,
  }, null, 2));

  if (summary.sensitive.length > 0) {
    console.error(`\nWarnung: ${summary.sensitive.length} Eintrag/Einträge wurden trotz möglicher vertraulicher Daten exportiert (--allow-sensitive).`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
