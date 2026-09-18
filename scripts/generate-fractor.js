#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { generateFractor } from './lib/fractor-learning.js';
import { resolveKnowledgeDir } from './lib/knowledge-paths.js';

/**
 * Generates a verified Fractor candidate from repeated approved TypoScript
 * fixes - the non-PHP counterpart to `npm run learn:rector`.
 *
 * Usage:
 *   npm run learn:fractor -- --dry-run
 *   npm run learn:fractor
 */
try {
  const { values } = parseArgs({ options: {
    'knowledge-dir': { type: 'string' },
    'output-dir': { type: 'string' },
    'dry-run': { type: 'boolean' },
  } });

  console.log(JSON.stringify(generateFractor({
    knowledgeDir: resolveKnowledgeDir(values['knowledge-dir']),
    outputDir: values['output-dir'] && path.resolve(values['output-dir']),
    dryRun: values['dry-run'],
  }), null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
