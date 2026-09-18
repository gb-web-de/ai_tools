import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository-local store used when nothing else is configured. */
export const DEFAULT_KNOWLEDGE_DIR = fileURLToPath(new URL('../../.typo3-knowledge', import.meta.url));

/**
 * Single resolution order for every learning CLI and the MCP server:
 * explicit argument, then TYPO3_KNOWLEDGE_PATH, then the repository store.
 *
 * Sharing one store across projects only works if every entry point agrees on
 * where it is. Before this existed the advisory import wrote to the repository
 * store unconditionally while queries read from the configured one, so imported
 * advisories could silently land somewhere nobody was searching.
 */
export function resolveKnowledgeDir(explicit) {
  const configured = explicit || process.env.TYPO3_KNOWLEDGE_PATH || DEFAULT_KNOWLEDGE_DIR;
  return path.resolve(configured);
}
