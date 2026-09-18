#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { importKnowledge, readBundle } from './lib/knowledge-exchange.js';
import { indexKnowledge } from './lib/knowledge-store.js';
import { resolveKnowledgeDir } from './lib/knowledge-paths.js';
import { resolveLanguage, translator } from './lib/i18n.js';

/**
 * Merges a shared bundle into the local knowledge store.
 *
 * Only new records are written. Conflicts keep the local state and are
 * reported, and an imported developer fix always arrives as PENDING: an
 * approval from another project is provenance, not a local release.
 *
 * --in accepts a single bundle or a directory of them. A shared repository
 * keeps one bundle per project, so every project exports to its own file and
 * merging the directory never produces a Git conflict over shared knowledge.
 *
 * Usage:
 *   npm run knowledge:import -- --in ../typo3-knowledge-share/bundles --dry-run
 *   npm run knowledge:import -- --in ../typo3-knowledge-share/bundles
 */
try {
  const { values } = parseArgs({ options: {
    in: { type: 'string' },
    'knowledge-dir': { type: 'string' },
    'dry-run': { type: 'boolean' },
    'no-index': { type: 'boolean' },
    lang: { type: 'string' },
  } });

  const t = translator(resolveLanguage(values.lang));
  if (!values.in) throw new Error(t('import.inRequired'));
  const directory = resolveKnowledgeDir(values['knowledge-dir']);

  const target = path.resolve(values.in);
  if (!fs.existsSync(target)) {
    // The shared repository is a deliberate setup step, not something this
    // command creates on the fly: where team knowledge lives is the team's
    // decision, and silently creating a local directory would look like a
    // working sync while nothing is actually shared.
    const repository = target.replace(/\/bundles$/u, '');
    throw new Error([
      t('import.sourceNotFound', { target }),
      '',
      t('import.setupIntro'),
      '',
      `  git clone <url> ${repository}`,
      '',
      t('import.setupNoRepo'),
      '',
      `  mkdir -p ${target}`,
      `  git -C ${repository} init`,
      `  npm run knowledge:export -- --out ${path.join(target, '<project>.json')} --label <project>`,
      '',
      t('import.setupDetails'),
    ].join('\n'));
  }
  const files = fs.statSync(target).isDirectory()
    ? fs.readdirSync(target).filter((name) => name.endsWith('.json')).sort().map((name) => path.join(target, name))
    : [target];
  if (files.length === 0) {
    throw new Error(t('import.noBundles', { target }));
  }

  const runs = [];
  for (const file of files) {
    // Each bundle is applied on its own, so one malformed file cannot stop the
    // rest of a shared directory from being merged.
    const result = importKnowledge(directory, readBundle(file), { dryRun: values['dry-run'] });
    runs.push({
      file: path.relative(process.cwd(), file),
      source: result.source,
      exported_at: result.exported_at,
      applied: result.applied,
      totals: result.totals,
      collections: Object.fromEntries(Object.entries(result.collections).map(([key, entries]) => [key, {
        new: entries.new.map((entry) => entry.id),
        unchanged: entries.unchanged.length,
        conflict: entries.conflict,
        invalid: entries.invalid,
      }])),
    });
  }

  const totals = ['new', 'unchanged', 'conflict', 'invalid'].reduce((sum, state) => {
    sum[state] = runs.reduce((count, run) => count + run.totals[state], 0);
    return sum;
  }, {});

  // A fresh local index makes the imported knowledge findable through the same
  // CLI and MCP search that local knowledge uses.
  const index = runs.some((run) => run.applied) && !values['no-index'] ? indexKnowledge(directory) : null;

  console.log(JSON.stringify({
    knowledgeDir: directory,
    bundles: runs.length,
    applied: runs.some((run) => run.applied),
    totals,
    runs,
    index,
    note: t('import.note'),
  }, null, 2));

  if (totals.conflict > 0 || totals.invalid > 0) {
    console.error(`\n${t('import.problems', { conflict: totals.conflict, invalid: totals.invalid })}`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
