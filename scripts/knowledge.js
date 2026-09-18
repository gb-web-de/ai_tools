#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { indexKnowledge, queryKnowledge } from './lib/knowledge-store.js';
import { resolveKnowledgeDir } from './lib/knowledge-paths.js';

try {
  const { values } = parseArgs({ options: {
    index: { type: 'boolean' }, query: { type: 'string' }, type: { type: 'string' },
    limit: { type: 'string', default: '10' }, 'knowledge-dir': { type: 'string' },
  } });
  const directory = resolveKnowledgeDir(values['knowledge-dir']);
  console.log(JSON.stringify(values.index ? indexKnowledge(directory) : queryKnowledge(directory, {
    query: values.query, type: values.type, limit: Number(values.limit),
  }), null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
