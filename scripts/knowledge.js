#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { indexKnowledge, queryKnowledge } from './lib/knowledge-store.js';

try {
  const { values } = parseArgs({ options: {
    index: { type: 'boolean' }, query: { type: 'string' }, type: { type: 'string' },
    limit: { type: 'string', default: '10' }, 'knowledge-dir': { type: 'string' },
  } });
  const directory = path.resolve(values['knowledge-dir'] || process.env.TYPO3_KNOWLEDGE_PATH || fileURLToPath(new URL('../.typo3-knowledge', import.meta.url)));
  console.log(JSON.stringify(values.index ? indexKnowledge(directory) : queryKnowledge(directory, {
    query: values.query, type: values.type, limit: Number(values.limit),
  }), null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
