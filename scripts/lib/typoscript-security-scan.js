import fs from 'node:fs';
import path from 'node:path';

/** Stable identifiers for the TypoScript rules; same contract as the PHP and JS sides. */
export const TS_IDENTIFIER = {
  UNESCAPED_INPUT: 'typo3Security.ts.unescapedUserInput',
  OPEN_REDIRECT: 'typo3Security.ts.openRedirect',
  UNSAFE_PARSE_FUNC: 'typo3Security.ts.unsafeParseFunc',
  CACHE_DISABLED: 'typo3Security.ts.cacheDisabled',
  DEBUG_EXPOSURE: 'typo3Security.ts.debugExposure',
};

export const TS_IDENTIFIERS = Object.values(TS_IDENTIFIER);

/**
 * Data sources whose value is shaped by the request. Anything read from these
 * is attacker-influenced until it is escaped.
 */
const REQUEST_SOURCES = /^(?:gp|getenv|tsfe|global|gpvar|post|get)\s*:/iu;

/** Tags that turn "rich text" into script execution. */
const DANGEROUS_TAGS = ['script', 'iframe', 'object', 'embed', 'form', 'base', 'link', 'meta'];

/**
 * Parses TypoScript into fully qualified path/value pairs.
 *
 * A line-based regex cannot answer the question that decides whether a finding
 * is real: a `data = GP:x` is only dangerous when no sibling `htmlSpecialChars`
 * neutralizes it, and that sibling can sit many lines away inside a block.
 */
export function parseTypoScript(source) {
  const assignments = [];
  const stack = [];
  const lines = source.split(/\r?\n/u);
  let inComment = false;
  let multiline = null;
  let condition = null;

  for (const [index, raw] of lines.entries()) {
    const lineNumber = index + 1;
    let line = raw;

    if (multiline) {
      if (/^\s*\)/u.test(line)) {
        assignments.push({ ...multiline, value: multiline.value.join('\n') });
        multiline = null;
      } else {
        multiline.value.push(line);
      }
      continue;
    }

    if (inComment) {
      if (line.includes('*/')) { inComment = false; line = line.slice(line.indexOf('*/') + 2); } else continue;
    }
    if (line.includes('/*')) { inComment = !line.includes('*/'); line = line.slice(0, line.indexOf('/*')); }

    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
    // Conditions do not change the path structure, but they decide whether an
    // assignment applies everywhere or only in a restricted context.
    const conditionMatch = trimmed.match(/^\[([^\]]*)\]$/u);
    if (conditionMatch) {
      const body = conditionMatch[1].trim();
      condition = /^(?:END|GLOBAL)$/iu.test(body) ? null : body;
      continue;
    }

    const prefix = stack.join('.');
    const qualify = (key) => (prefix ? `${prefix}.${key}` : key);

    if (trimmed === '}') { stack.pop(); continue; }

    const blockOpen = trimmed.match(/^([^=<>(){}\s][^=<>({]*?)\s*\{$/u);
    if (blockOpen) { stack.push(blockOpen[1].trim()); continue; }

    const multilineOpen = trimmed.match(/^([^=<>(){}\s][^=<>({]*?)\s*\(\s*$/u);
    if (multilineOpen) {
      multiline = { path: qualify(multilineOpen[1].trim()), line: lineNumber, value: [], operator: '(', condition };
      continue;
    }

    const assignment = trimmed.match(/^([^=<>{}()\s][^=<>{}()]*?)\s*(:?=|<|>)\s*(.*)$/u);
    if (assignment) {
      assignments.push({
        path: qualify(assignment[1].trim()),
        operator: assignment[2],
        value: assignment[3].trim(),
        line: lineNumber,
        condition,
      });
    }
  }
  return assignments;
}

const parentOf = (objectPath) => objectPath.split('.').slice(0, -1).join('.');

/**
 * A condition that restricts the assignment to a non-production context.
 *
 * Enabling debug output inside `[applicationContext matches "/^Development/"]`
 * is the documented way to have it where it belongs. Reporting that would tell
 * developers their correct solution is wrong.
 */
const isContextRestricted = (condition) => Boolean(condition)
  && /applicationContext|ENV\s*:|getenv|TYPO3_CONTEXT/iu.test(condition);

/**
 * `key` selects a branch of a CASE object; its value is compared, never
 * rendered. Escaping a selector would change which branch is chosen, not
 * whether output is safe.
 */
const isCaseSelector = (objectPath) => /(?:^|\.)key$/iu.test(objectPath);

export function scanTypoScript(source) {
  const assignments = parseTypoScript(source);
  const findings = [];
  const byPath = new Map();
  for (const entry of assignments) byPath.set(entry.path.toLowerCase(), entry);

  const truthy = (value) => /^(?:1|true)$/iu.test(String(value ?? '').trim());
  const valueAt = (objectPath, key) => byPath.get(`${objectPath}.${key}`.toLowerCase())?.value;

  /** htmlSpecialChars on the same object, or on its stdWrap, neutralizes the output. */
  const isEscaped = (objectPath) => truthy(valueAt(objectPath, 'htmlSpecialChars'))
    || truthy(valueAt(objectPath, 'stdWrap.htmlSpecialChars'))
    || truthy(valueAt(objectPath, 'intval'))
    || valueAt(objectPath, 'parseFunc') !== undefined && truthy(valueAt(objectPath, 'parseFunc.htmlSanitize'));

  for (const entry of assignments) {
    const lowerPath = entry.path.toLowerCase();
    const leaf = lowerPath.split('.').pop();
    const objectPath = parentOf(entry.path);

    if (['data', 'insertdata'].includes(leaf) && REQUEST_SOURCES.test(entry.value)) {
      // typolink parameters are a navigation target, not text: escaping does not
      // make them safe, so they are reported under their own identifier.
      if (/(?:^|\.)typolink\.parameter$/iu.test(objectPath) || /(?:^|\.)typolink$/iu.test(parentOf(objectPath))) {
        findings.push({
          identifier: TS_IDENTIFIER.OPEN_REDIRECT,
          line: entry.line,
          path: entry.path,
          message: `Open redirect: typolink target is taken from "${entry.value}". A request value can point the link off-site or at a javascript: URI. Map the input through an allow-list of page ids or routes.`,
        });
      } else if (!isEscaped(objectPath) && !isCaseSelector(objectPath)) {
        findings.push({
          identifier: TS_IDENTIFIER.UNESCAPED_INPUT,
          line: entry.line,
          path: entry.path,
          message: `XSS: request data "${entry.value}" is rendered without escaping. Add htmlSpecialChars = 1 on ${objectPath || 'the object'}, or intval = 1 for numeric values.`,
        });
      }
    }

    if (leaf === 'parameter' && REQUEST_SOURCES.test(entry.value) && /typolink$/iu.test(objectPath)) {
      findings.push({
        identifier: TS_IDENTIFIER.OPEN_REDIRECT,
        line: entry.line,
        path: entry.path,
        message: `Open redirect: typolink parameter comes from "${entry.value}". Map the input through an allow-list before it becomes a link target.`,
      });
    }

    if (leaf === 'allowtags') {
      const tags = entry.value.toLowerCase().split(',').map((tag) => tag.trim());
      const dangerous = DANGEROUS_TAGS.filter((tag) => tags.includes(tag));
      if (dangerous.length > 0) {
        findings.push({
          identifier: TS_IDENTIFIER.UNSAFE_PARSE_FUNC,
          line: entry.line,
          path: entry.path,
          message: `XSS: parseFunc allows the tag(s) ${dangerous.join(', ')}. These execute script or load external content. Remove them from allowTags.`,
        });
      }
    }

    if (leaf === 'htmlsanitize' && /^(?:0|false)$/iu.test(entry.value)) {
      findings.push({
        identifier: TS_IDENTIFIER.UNSAFE_PARSE_FUNC,
        line: entry.line,
        path: entry.path,
        message: 'XSS: htmlSanitize = 0 switches off the TYPO3 HTML sanitizer for this parseFunc, so editor or user markup is rendered verbatim.',
      });
    }

    if (/(?:^|\.)config\.no_cache$/iu.test(lowerPath) && truthy(entry.value) && !isContextRestricted(entry.condition)) {
      findings.push({
        identifier: TS_IDENTIFIER.CACHE_DISABLED,
        line: entry.line,
        path: entry.path,
        message: 'config.no_cache = 1 disables the page cache globally. Every request is rendered from scratch, which turns ordinary traffic into a denial-of-service surface. Mark the individual dynamic object as USER_INT instead.',
      });
    }

    if (/(?:^|\.)config\.(?:debug|admpanel)$/iu.test(lowerPath) && truthy(entry.value) && !isContextRestricted(entry.condition)) {
      findings.push({
        identifier: TS_IDENTIFIER.DEBUG_EXPOSURE,
        line: entry.line,
        path: entry.path,
        message: `${entry.path} = ${entry.value} exposes internal state to visitors. Restrict it to a development context instead of setting it unconditionally.`,
      });
    }

    if (/(?:^|\.)config\.contentobjectexceptionhandler$/iu.test(lowerPath) && /^0$/u.test(entry.value.trim()) && !isContextRestricted(entry.condition)) {
      findings.push({
        identifier: TS_IDENTIFIER.DEBUG_EXPOSURE,
        line: entry.line,
        path: entry.path,
        message: 'contentObjectExceptionHandler = 0 lets exceptions surface in the frontend, which can leak stack traces and paths to visitors.',
      });
    }
  }

  return findings.sort((a, b) => a.line - b.line);
}

const SKIP_DIRECTORIES = new Set(['node_modules', 'vendor', '.git', 'var', 'build', 'dist']);
const TYPOSCRIPT_FILE = /\.(?:typoscript|tsconfig)$/u;
/** Legacy names still used for TypoScript in many extensions. */
const LEGACY_NAMES = new Set(['setup.txt', 'constants.txt', 'setup.ts', 'constants.ts', 'page.ts']);

export function collectTypoScriptFiles(target) {
  const resolved = path.resolve(target);
  if (!fs.existsSync(resolved)) throw new Error(`Pfad nicht gefunden: ${resolved}`);
  if (fs.statSync(resolved).isFile()) return [resolved];

  const found = [];
  const walkDirectory = (directory) => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      if (item.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(item.name)) walkDirectory(path.join(directory, item.name));
      } else if (TYPOSCRIPT_FILE.test(item.name) || LEGACY_NAMES.has(item.name)) {
        found.push(path.join(directory, item.name));
      }
    }
  };
  walkDirectory(resolved);
  return found.sort();
}

export function scanTypoScriptPath(target) {
  const files = collectTypoScriptFiles(target);
  const results = [];
  for (const file of files) {
    const findings = scanTypoScript(fs.readFileSync(file, 'utf8'));
    if (findings.length > 0) results.push({ file, findings });
  }
  return {
    scanned: files.length,
    findings: results.reduce((sum, entry) => sum + entry.findings.length, 0),
    files: results,
  };
}
