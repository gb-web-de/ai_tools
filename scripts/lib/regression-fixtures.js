import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const suiteDirectory = path.join(root, 'typo3-security-suite');
const identifierSource = path.join(suiteDirectory, 'rules/SecurityRuleIdentifier.php');

export const FIXTURE_ROOT = path.join(root, 'tests/fixtures/regression');
export const SECURITY_IDENTIFIER_PREFIX = 'typo3Security.';

const REQUIRED_FIELDS = ['slug', 'title', 'finding_type', 'severity', 'expected_identifier', 'rule', 'root_cause', 'vulnerable_path', 'secure_path', 'origin', 'review'];
const ORIGIN_KINDS = ['ADVISORY', 'RULE_CONTRACT'];
const CAUSAL_FIDELITY = ['DOCUMENTED_ROOT_CAUSE', 'VULNERABILITY_CLASS'];
const REVIEW_STATUS = ['PENDING', 'APPROVED', 'REJECTED'];

/**
 * The identifiers the PHP rule set actually defines. Parsing them from the
 * source keeps the JavaScript harness from asserting against an identifier that
 * no rule can ever emit.
 */
export function declaredIdentifiers() {
  const source = fs.readFileSync(identifierSource, 'utf8');
  const matches = [...source.matchAll(/public const [A-Z_]+ = '([^']+)';/gu)].map((match) => match[1]);
  if (matches.length === 0) throw new Error(`Keine Identifier in ${identifierSource} gefunden.`);
  return matches;
}

function validateCase(entry, directory) {
  const where = path.relative(FIXTURE_ROOT, directory);
  const missing = REQUIRED_FIELDS.filter((field) => entry[field] === undefined || entry[field] === null || entry[field] === '');
  if (missing.length > 0) throw new Error(`${where}/case.json: Pflichtfelder fehlen: ${missing.join(', ')}`);
  if (entry.slug !== path.basename(directory)) throw new Error(`${where}/case.json: slug "${entry.slug}" passt nicht zum Verzeichnisnamen.`);
  if (!declaredIdentifiers().includes(entry.expected_identifier)) throw new Error(`${where}/case.json: expected_identifier "${entry.expected_identifier}" ist in SecurityRuleIdentifier.php nicht definiert.`);

  const { origin, review } = entry;
  if (!ORIGIN_KINDS.includes(origin.kind)) throw new Error(`${where}/case.json: origin.kind muss einer von ${ORIGIN_KINDS.join(', ')} sein.`);
  if (!CAUSAL_FIDELITY.includes(origin.causal_fidelity)) throw new Error(`${where}/case.json: origin.causal_fidelity muss einer von ${CAUSAL_FIDELITY.join(', ')} sein.`);
  if (!origin.note?.trim()) throw new Error(`${where}/case.json: origin.note muss die Grenzen der Herkunft benennen.`);
  // An advisory-bound fixture must name a resolvable source; a rule-contract
  // fixture must say which documented contract it encodes. Neither may claim a
  // provenance it does not have.
  if (origin.kind === 'ADVISORY' && !/^https:\/\/\S+$/u.test(String(origin.link || ''))) throw new Error(`${where}/case.json: origin.kind=ADVISORY benötigt einen https-Link auf das veröffentlichte Advisory.`);
  if (origin.kind === 'ADVISORY' && !origin.advisory_id?.trim()) throw new Error(`${where}/case.json: origin.kind=ADVISORY benötigt eine advisory_id.`);
  if (origin.kind === 'RULE_CONTRACT' && !origin.reference?.trim()) throw new Error(`${where}/case.json: origin.kind=RULE_CONTRACT benötigt eine reference.`);
  if (!REVIEW_STATUS.includes(review.status)) throw new Error(`${where}/case.json: review.status muss einer von ${REVIEW_STATUS.join(', ')} sein.`);
  if (review.status === 'APPROVED' && (!review.reviewed_by?.trim() || !review.reviewed_at?.trim())) throw new Error(`${where}/case.json: review.status=APPROVED benötigt reviewed_by und reviewed_at.`);

  for (const key of ['vulnerable_path', 'secure_path']) {
    const target = path.join(directory, entry[key]);
    if (!path.resolve(target).startsWith(path.resolve(directory) + path.sep)) throw new Error(`${where}/case.json: ${key} zeigt aus dem Fixture-Verzeichnis heraus.`);
    if (!fs.existsSync(target)) throw new Error(`${where}/case.json: ${key} verweist auf die fehlende Datei ${entry[key]}.`);
  }
  return entry;
}

export function loadCases() {
  if (!fs.existsSync(FIXTURE_ROOT)) return [];
  return fs.readdirSync(FIXTURE_ROOT, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => path.join(FIXTURE_ROOT, item.name))
    .sort()
    .map((directory) => {
      const manifest = path.join(directory, 'case.json');
      if (!fs.existsSync(manifest)) throw new Error(`${path.relative(FIXTURE_ROOT, directory)}: case.json fehlt.`);
      let parsed;
      try {
        parsed = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      } catch (error) {
        throw new Error(`${path.relative(FIXTURE_ROOT, directory)}/case.json ist kein gültiges JSON: ${error.message}`);
      }
      return { ...validateCase(parsed, directory), directory };
    });
}

/**
 * Runs the security rule set over every fixture once and returns the findings
 * grouped by absolute file path. One analysis run keeps the suite fast enough
 * to stay in the default `npm test` path.
 */
export function analyseFixtures() {
  const binary = path.join(suiteDirectory, 'vendor/bin/phpstan');
  const config = path.join(suiteDirectory, 'phpstan-fixtures.neon');
  if (!fs.existsSync(binary) || !fs.existsSync(config)) {
    throw new Error(`PHPStan oder phpstan-fixtures.neon fehlt in ${suiteDirectory}. Führe dort 'composer install' aus.`);
  }

  // PHPStan's result cache keys on the analysed files and the configuration,
  // not on the custom rule classes. Reusing it would let a broken rule keep
  // reporting cached findings, so the fixture cache starts empty every run.
  fs.rmSync(path.join(suiteDirectory, 'var/phpstan-fixtures-cache'), { recursive: true, force: true });

  const result = spawnSync(binary, ['analyse', '-c', config, '--error-format=json', '--no-progress'], {
    cwd: suiteDirectory,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;

  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error(`PHPStan lieferte keine JSON-Ausgabe.\nstdout: ${result.stdout.slice(0, 2000)}\nstderr: ${result.stderr.slice(0, 2000)}`);
  }
  if (report.errors?.length) throw new Error(`PHPStan meldete Konfigurationsfehler: ${report.errors.join('; ')}`);

  const byFile = new Map();
  for (const [file, info] of Object.entries(report.files || {})) {
    byFile.set(path.resolve(file), (info.messages || []).map((message) => ({
      line: message.line,
      identifier: message.identifier ?? null,
      message: message.message,
    })));
  }
  return byFile;
}

export function findingsFor(byFile, directory, relativePath) {
  return byFile.get(path.resolve(path.join(directory, relativePath))) ?? [];
}

export const isSecurityFinding = (finding) => String(finding.identifier ?? '').startsWith(SECURITY_IDENTIFIER_PREFIX);

/** Every PHP file under the fixture root, so stray files cannot escape review. */
export function allFixtureFiles() {
  const found = [];
  const walk = (directory) => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, item.name);
      if (item.isDirectory()) walk(target);
      else if (item.name.endsWith('.php')) found.push(path.resolve(target));
    }
  };
  if (fs.existsSync(FIXTURE_ROOT)) walk(FIXTURE_ROOT);
  return found;
}
