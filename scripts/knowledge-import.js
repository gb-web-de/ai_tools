#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { importKnowledge, readBundle } from './lib/knowledge-exchange.js';
import { indexKnowledge } from './lib/knowledge-store.js';
import { resolveKnowledgeDir } from './lib/knowledge-paths.js';

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
  } });

  if (!values.in) throw new Error('--in <datei|verzeichnis> ist erforderlich.');
  const directory = resolveKnowledgeDir(values['knowledge-dir']);

  const target = path.resolve(values.in);
  if (!fs.existsSync(target)) {
    // The shared repository is a deliberate setup step, not something this
    // command creates on the fly: where team knowledge lives is the team's
    // decision, and silently creating a local directory would look like a
    // working sync while nothing is actually shared.
    throw new Error([
      `Austauschquelle nicht gefunden: ${target}`,
      '',
      'Der gemeinsame Wissensbestand liegt in einem eigenen (privaten) Git-Repository,',
      'das zuerst eingerichtet werden muss. Einmalig pro Arbeitsplatz:',
      '',
      `  git clone <url-des-share-repos> ${target.replace(/\/bundles$/u, '')}`,
      '',
      'Noch kein Share-Repository vorhanden? Dann lokal anlegen und später verteilen:',
      '',
      `  mkdir -p ${target}`,
      `  git -C ${target.replace(/\/bundles$/u, '')} init`,
      '  npm run knowledge:export -- --out ' + path.join(target, '<projektname>.json') + ' --label <projektname>',
      '',
      'Details: docs/CONTINUOUS_LEARNING.md, Abschnitt "Git-basierter Team-Workflow".',
    ].join('\n'));
  }
  const files = fs.statSync(target).isDirectory()
    ? fs.readdirSync(target).filter((name) => name.endsWith('.json')).sort().map((name) => path.join(target, name))
    : [target];
  if (files.length === 0) {
    throw new Error(`Keine .json-Austauschdateien in ${target}. Exportiert ein Projekt bereits dorthin? Siehe "npm run knowledge:export -- --help" bzw. docs/CONTINUOUS_LEARNING.md.`);
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
    note: 'Importierte Entwickler-Fixes stehen lokal auf PENDING. Ein Import erteilt keine Freigabe und aktiviert keine Rector-Regel.',
  }, null, 2));

  if (totals.conflict > 0 || totals.invalid > 0) {
    console.error(`\n${totals.conflict} Konflikt(e) und ${totals.invalid} ungültige(r) Eintrag/Einträge. Bestehendes Wissen wurde nicht verändert.`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
