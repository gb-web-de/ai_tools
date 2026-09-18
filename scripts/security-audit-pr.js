#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { auditFiles, patchFor, MAX_FILE_BYTES } from './lib/security-review.js';
import { atomicWrite } from './lib/knowledge-store.js';

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 5_000_000, timeout: 30_000 });
  if (result.status !== 0 || result.error) throw new Error(`Git-Lesezugriff fehlgeschlagen: ${result.error?.message || result.stderr}`);
  return result.stdout;
}

try {
  const { values } = parseArgs({ options: { base: { type: 'string' }, head: { type: 'string' }, output: { type: 'string', default: '.cache/security-review' } } });
  if (![values.base, values.head].every((ref) => typeof ref === 'string' && /^[a-f0-9]{40}$/u.test(ref))) throw new Error('--base und --head müssen vollständige Commit-SHAs sein.');
  const mergeBase = git(['merge-base', values.base, values.head]).trim();
  const filenames = git(['diff', '--no-renames', '--name-only', '-z', '--diff-filter=AM', mergeBase, values.head, '--']).split('\0').filter(Boolean);
  const files = filenames.filter((name) => /\.(php|html)$/u.test(name)).slice(0, 300).map((filename) => {
    const spec = `${values.head}:${filename}`;
    if (Number(git(['cat-file', '-s', spec])) > MAX_FILE_BYTES) return { filename };
    return { filename, content: git(['show', spec]), patch: git(['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--unified=0', mergeBase, values.head, '--', filename]) };
  });
  const report = { ...auditFiles(files), base_sha: values.base, merge_base: mergeBase, head_sha: values.head };
  if (filenames.length > 300) { report.complete = false; report.warnings.push('Mehr als 300 geänderte Dateien: Scan begrenzt.'); }
  atomicWrite(path.join(values.output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  atomicWrite(path.join(values.output, 'security-fixes.patch'), patchFor(report));
  console.log(JSON.stringify({ findings: report.findings.length, complete: report.complete, output: values.output }));
  if (report.findings.length || !report.complete) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
