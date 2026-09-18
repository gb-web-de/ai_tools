#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { generateRector } from './lib/rector-learning.js';

try {
  const { values } = parseArgs({ options: { 'knowledge-dir': { type: 'string' }, 'output-dir': { type: 'string' }, 'dry-run': { type: 'boolean' } } });
  const knowledgeDir = path.resolve(values['knowledge-dir'] || process.env.TYPO3_KNOWLEDGE_PATH || fileURLToPath(new URL('../.typo3-knowledge', import.meta.url)));
  console.log(JSON.stringify(generateRector({ knowledgeDir, outputDir: values['output-dir'] && path.resolve(values['output-dir']), dryRun: values['dry-run'] }), null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
