import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const MAX_FILES = 300;
export const MAX_FILE_BYTES = 500_000;
export function safeFilePath(filename) {
  return typeof filename === 'string' && filename.length < 500 && !/[\x00-\x1f\\`]/u.test(filename)
    && !filename.startsWith('/') && filename.split('/').every((part) => part && part !== '..' && part !== '.');
}

export function addedLines(patch) {
  const lines = new Map();
  if (typeof patch !== 'string') return lines;
  let current = 0;
  for (const line of patch.split('\n')) {
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/u);
    if (hunk) { current = Number(hunk[1]); continue; }
    if (!current) continue;
    if (line.startsWith('+')) { lines.set(current++, line.slice(1)); }
    else if (line.startsWith(' ')) current++;
  }
  return lines;
}

function inHtmlText(content, end) {
  let inTag = false;
  let quote = '';
  let raw = '';
  for (let index = 0; index < end; index++) {
    if (!inTag && content.startsWith('<!--', index)) {
      const closing = content.indexOf('-->', index + 4);
      if (closing === -1 || closing >= end) return false;
      index = closing + 2;
      continue;
    }
    if (raw) {
      if (!content.slice(index).toLowerCase().startsWith(`</${raw}`)) continue;
      raw = '';
    }
    if (!inTag && content[index] === '<') {
      const special = content.slice(index).match(/^<(script|style|textarea|title)\b/iu);
      if (special) raw = special[1].toLowerCase();
      inTag = true;
    } else if (inTag) {
      if (quote) { if (content[index] === quote) quote = ''; }
      else if (/["']/u.test(content[index])) quote = content[index];
      else if (content[index] === '>') inTag = false;
    }
  }
  return !inTag && !raw;
}

function inspectFluid(content) {
  const findings = [];
  const lines = content.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!/f:format\.raw|escapeOutput\s*=\s*["']false["']/u.test(line)) continue;
    const finding = { line: index + 1, type: 'XSS', message: 'Fluid-Escaping ist deaktiviert. Herkunft und gewünschtes HTML prüfen.' };
    // Whole-line text expression only; do not suggest changes inside JS, CSS or attributes.
    const match = line.match(/^(\s*)\{\s*([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*->\s*f:format\.raw\(\)\s*\}(\s*)$/u);
    const offset = lines.slice(0, index).reduce((sum, text) => sum + text.length + 1, 0);
    if (match && inHtmlText(content, offset)) finding.replacement = `${match[1]}{${match[2]}}${match[3]}`;
    findings.push(finding);
  }
  return findings;
}

export function auditFiles(files) {
  const warnings = [];
  const eligible = [];
  for (const file of files) {
    if (!safeFilePath(file.filename)) throw new Error('Unsicherer Dateipfad im Review.');
    if (file.status === 'removed' || !/\.(php|html)$/u.test(file.filename)) continue;
    if (/(^|\/)(vendor|node_modules|tests|Tests|templates\/rector)(\/|$)/u.test(file.filename)) continue;
    if (file.content === undefined || typeof file.patch !== 'string' || Buffer.byteLength(file.content) > MAX_FILE_BYTES) {
      warnings.push(`Nicht analysiert (Inhalt/Patch fehlt oder zu groß): ${file.filename}`);
      continue;
    }
    eligible.push(file);
  }
  if (files.length >= MAX_FILES) warnings.push('Dateigrenze erreicht: Review ist möglicherweise unvollständig.');
  const phpFiles = eligible.filter((file) => file.filename.endsWith('.php'));
  let phpResults = {};
  if (phpFiles.length) {
    const inspection = spawnSync('php', [fileURLToPath(new URL('../../typo3-security-suite/scripts/inspect-php.php', import.meta.url))], {
      input: JSON.stringify(phpFiles), encoding: 'utf8', timeout: 30_000, maxBuffer: 5_000_000,
    });
    if (inspection.error || inspection.status !== 0) throw new Error(`PHP-Analyse fehlgeschlagen: ${inspection.error?.message || inspection.stderr}`);
    phpResults = JSON.parse(inspection.stdout);
  }
  const findings = [];
  for (const file of eligible) {
    const added = addedLines(file.patch);
    const sourceLines = file.content.split('\n');
    for (const [number, text] of added) {
      if (sourceLines[number - 1] !== text) throw new Error(`Patch und Datei passen nicht zusammen: ${file.filename}:${number}`);
    }
    const issues = file.filename.endsWith('.php') ? phpResults[file.filename] : inspectFluid(file.content);
    for (const finding of issues) {
      if (finding.type === 'PHP_PARSE_ERROR') warnings.push(`PHP-Parsefehler: ${file.filename}:${finding.line}`);
      if (!added.has(finding.line)) continue;
      const original = sourceLines[finding.line - 1];
      // No Markdown injection into suggestion blocks; other findings remain plain comments.
      const replacement = typeof finding.replacement === 'string' && !/[`\r\n]/u.test(finding.replacement) ? finding.replacement : undefined;
      findings.push({ ...finding, replacement, original, path: file.filename, no_final_newline: !file.content.endsWith('\n') && finding.line === sourceLines.length });
    }
  }
  return { schema_version: 1, scanned_files: eligible.length, complete: warnings.length === 0, warnings, findings };
}

export function patchFor(report) {
  const byPath = new Map();
  for (const finding of report.findings.filter((item) => item.replacement !== undefined)) {
    byPath.set(finding.path, [...(byPath.get(finding.path) || []), finding]);
  }
  return [...byPath.entries()].map(([file, findings]) => [
    `diff --git ${JSON.stringify(`a/${file}`)} ${JSON.stringify(`b/${file}`)}`,
    `--- ${JSON.stringify(`a/${file}`)}`, `+++ ${JSON.stringify(`b/${file}`)}`,
    ...findings.sort((a, b) => a.line - b.line).flatMap((finding) => [
      `@@ -${finding.line} +${finding.line} @@`, `-${finding.original}`,
      ...(finding.no_final_newline ? ['\\ No newline at end of file'] : []), `+${finding.replacement}`,
      ...(finding.no_final_newline ? ['\\ No newline at end of file'] : []),
    ]), '',
  ].join('\n')).join('');
}

export function reviewComments(report) {
  return report.findings.slice(0, 40).map((finding) => ({
    path: finding.path, line: finding.line, side: 'RIGHT',
    body: `${finding.type}: ${finding.message}${finding.replacement === undefined ? '' : `\n\n\`\`\`suggestion\n${finding.replacement}\n\`\`\``}`,
  }));
}
