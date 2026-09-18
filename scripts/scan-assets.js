#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { scanJavaScriptPath, JS_IDENTIFIERS } from './lib/js-security-scan.js';
import { scanTypoScriptPath, TS_IDENTIFIERS } from './lib/typoscript-security-scan.js';
import { resolveLanguage, translator } from './lib/i18n.js';

/**
 * Scans the parts of a TYPO3 extension the PHP rules never see: browser
 * JavaScript and TypoScript.
 *
 * Usage:
 *   npm run scan:assets -- <path>
 *   npm run scan:assets -- <path> --json
 *   npm run scan:js -- <path>
 *   npm run scan:typoscript -- <path>
 */
try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      js: { type: 'boolean' },
      typoscript: { type: 'boolean' },
      json: { type: 'boolean' },
      lang: { type: 'string' },
    },
  });

  const t = translator(resolveLanguage(values.lang));
  const target = positionals[0];
  if (!target) throw new Error(t('scan.targetRequired'));

  // Neither flag means both: scanning half an extension by accident is worse
  // than scanning a bit more than asked.
  const wantJs = values.js || !values.typoscript;
  const wantTypoScript = values.typoscript || !values.js;

  const javascript = wantJs ? scanJavaScriptPath(target) : null;
  const typoscript = wantTypoScript ? scanTypoScriptPath(target) : null;
  const total = (javascript?.findings ?? 0) + (typoscript?.findings ?? 0);
  const unreadable = javascript?.unreadable ?? [];

  if (values.json) {
    console.log(JSON.stringify({ target: path.resolve(target), javascript, typoscript, total }, null, 2));
  } else {
    const relative = (file) => path.relative(process.cwd(), file);
    for (const [label, result] of [['JavaScript', javascript], ['TypoScript', typoscript]]) {
      if (!result) continue;
      console.log(`${label}: ${t('scan.scanned', { count: result.scanned, findings: result.findings })}`);
      for (const entry of result.files) {
        console.log(`\n  ${relative(entry.file)}`);
        for (const finding of entry.findings) {
          const where = finding.path ? `${finding.line} (${finding.path})` : `${finding.line}:${finding.column}`;
          console.log(`    ${where}  ${finding.identifier}`);
          console.log(`      ${finding.message}`);
        }
      }
      console.log();
    }
    if (unreadable.length > 0) {
      console.log(`${t('scan.unreadable', { count: unreadable.length })}`);
      for (const entry of unreadable) console.log(`  ${relative(entry.file)}: ${entry.reason}`);
      console.log();
    }
    console.log(t('scan.total', { total, rules: JS_IDENTIFIERS.length + TS_IDENTIFIERS.length }));
  }

  // An unparsed file is an unanalysed file, so a clean result over unreadable
  // input must not be reported as success.
  if (total > 0 || unreadable.length > 0) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
