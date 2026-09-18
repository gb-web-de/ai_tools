import fs from 'node:fs';
import path from 'node:path';
import { atomicWrite, digest, readRecords, validateFix, withStoreLock } from './knowledge-store.js';

export const EXCHANGE_FORMAT = 'typo3-security-knowledge-exchange';
export const EXCHANGE_FORMAT_VERSION = 1;
const MAX_BUNDLE_BYTES = 20_000_000;

/**
 * The three shared source files and how a record in each is identified.
 * graph.jsonl is deliberately absent: it is derived and is rebuilt locally
 * after an import, so shipping it would only create a second source of truth.
 */
const COLLECTIONS = [
  { key: 'advisories', file: 'advisories.json', idField: 'id' },
  { key: 'learned_patterns', file: 'learned_patterns.json', idField: 'pattern_id' },
  { key: 'developer_fixes', file: 'fixes_history.jsonl', idField: 'fix_id' },
];

/**
 * Patterns that must not leave a project without someone looking at them.
 * A developer fix carries a real code diff, so it can easily contain an internal
 * hostname, a customer path, or a credential that was part of the bug.
 */
const SENSITIVE_PATTERNS = [
  { id: 'private_key', label: 'privater Schlüssel', pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/u },
  { id: 'aws_access_key', label: 'AWS Access Key', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/u },
  { id: 'credential_assignment', label: 'Zugangsdaten im Klartext', pattern: /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)\b\s*[:=]\s*['"]?[^\s'"<>{}$,;)]{6,}/iu },
  { id: 'internal_host', label: 'interner Hostname', pattern: /\b[a-z0-9-]+\.(?:local|internal|intern|lan|corp|home)\b/iu },
  { id: 'private_ip', label: 'private IP-Adresse', pattern: /\b(?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/u },
  { id: 'local_path', label: 'lokaler Benutzerpfad', pattern: /(?:\/home\/[a-z0-9._-]+|\/Users\/[A-Za-z0-9._-]+|[A-Z]:\\Users\\)/u },
  { id: 'email_address', label: 'E-Mail-Adresse', pattern: /\b[A-Za-z0-9._%+-]+@(?!example\.(?:com|org|net)\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/u },
];

/**
 * Address literals that routinely appear in security documentation as examples
 * of what to block. Flagging them would train reviewers to wave the scanner
 * through, which is worse than not scanning at all.
 */
const DOCUMENTED_ADDRESSES = /^(?:127\.0\.0\.1|0\.0\.0\.0|169\.254\.169\.254)$/u;
const CIDR_SUFFIX = /\/\d{1,2}\b/u;

function isDocumentationExample(finding, match, text) {
  if (finding !== 'private_ip') return false;
  if (DOCUMENTED_ADDRESSES.test(match)) return true;
  // A range such as 10.0.0.0/8 describes a network class, not a reachable host.
  const following = text.slice(text.indexOf(match) + match.length, text.indexOf(match) + match.length + 4);
  return CIDR_SUFFIX.test(following);
}

const SCAN_SKIP_FIELDS = ['fingerprint', 'fix_id', 'recorded_at', 'reviewed_at', 'imported'];

/**
 * @returns {{id: string, label: string, field: string, excerpt: string}[]} findings,
 * empty when the record looks shareable. The field and excerpt are what make a
 * finding actionable: without them nobody can tell a real leak from an example.
 */
export function scanSensitive(record) {
  const findings = [];
  for (const [field, value] of Object.entries(record)) {
    if (SCAN_SKIP_FIELDS.includes(field)) continue;
    const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
    if (!text) continue;

    for (const { id, label, pattern } of SENSITIVE_PATTERNS) {
      const match = text.match(pattern);
      if (!match) continue;
      if (isDocumentationExample(id, match[0], text)) continue;
      const start = Math.max(0, text.indexOf(match[0]) - 20);
      findings.push({ id, label, field, excerpt: text.slice(start, start + match[0].length + 40).replace(/\s+/gu, ' ').trim() });
    }
  }
  return findings;
}

/** Content digest over the payload, ignoring purely local bookkeeping fields. */
function contentDigest(record) {
  const { imported, review_status, reviewed_by, reviewed_at, recorded_at, ...payload } = record;
  const ordered = Object.keys(payload).sort().map((key) => [key, payload[key]]);
  return digest(JSON.stringify(ordered));
}

function identify(collection, record) {
  if (collection.key === 'developer_fixes') {
    // Recomputed from the payload, never trusted from the bundle: a hand-edited
    // fingerprint must not be able to masquerade as a different fix.
    const { diff, type } = validateFix(record);
    return digest(`${type}\n${diff}`);
  }
  const value = record[collection.idField];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${collection.idField} fehlt oder ist leer.`);
  if (value.length > 200) throw new Error(`${collection.idField} überschreitet 200 Zeichen.`);
  return value;
}

const fixKey = (record) => {
  try {
    return identify(COLLECTIONS[2], record);
  } catch {
    return null;
  }
};

const localKey = (collection, record) => (collection.key === 'developer_fixes' ? (record.fingerprint ?? fixKey(record)) : record[collection.idField]);

/**
 * Builds an exchange bundle from a knowledge store.
 *
 * Only approved developer fixes are shared by default: PENDING and REJECTED are
 * local working state, and shipping them would push another project's reviewers
 * into re-judging material their colleague has not finished with.
 */
export function exportKnowledge(directory, options = {}) {
  const { includePending = false, allowSensitive = false, label = path.basename(directory) } = options;
  if (typeof label !== 'string' || !label.trim() || label.length > 200) throw new Error('label muss ein nicht-leerer String mit maximal 200 Zeichen sein.');

  const records = {};
  const skipped = [];
  const sensitive = [];

  for (const collection of COLLECTIONS) {
    const rows = readRecords(directory, collection.file);
    const selected = [];

    for (const row of rows) {
      if (collection.key === 'developer_fixes') {
        const status = row.review_status ?? 'PENDING';
        if (status === 'REJECTED') {
          skipped.push({ collection: collection.key, id: row.fix_id ?? null, reason: 'REJECTED' });
          continue;
        }
        if (status !== 'APPROVED' && !includePending) {
          skipped.push({ collection: collection.key, id: row.fix_id ?? null, reason: 'NOT_APPROVED' });
          continue;
        }
        try {
          validateFix(row);
        } catch (error) {
          skipped.push({ collection: collection.key, id: row.fix_id ?? null, reason: `INVALID: ${error.message}` });
          continue;
        }
      }

      const findings = scanSensitive(row);
      if (findings.length > 0) {
        sensitive.push({ collection: collection.key, id: localKey(collection, row) ?? null, findings });
        if (!allowSensitive) continue;
      }
      selected.push(row);
    }
    records[collection.key] = selected;
  }

  if (sensitive.length > 0 && !allowSensitive) {
    const detail = sensitive.map((entry) => `${entry.collection}/${entry.id}: ${entry.findings.map((finding) => finding.label).join(', ')}`).join('; ');
    throw Object.assign(
      new Error(`Export abgebrochen: ${sensitive.length} Eintrag/Einträge enthalten möglicherweise vertrauliche Daten (${detail}). Bereinige sie oder exportiere bewusst mit --allow-sensitive.`),
      { sensitive },
    );
  }

  return {
    bundle: {
      format: EXCHANGE_FORMAT,
      format_version: EXCHANGE_FORMAT_VERSION,
      exported_at: new Date().toISOString(),
      exported_from: label.trim(),
      records,
    },
    summary: {
      counts: Object.fromEntries(COLLECTIONS.map((collection) => [collection.key, records[collection.key].length])),
      skipped,
      sensitive,
    },
  };
}

export function writeBundle(file, bundle) {
  atomicWrite(path.resolve(file), `${JSON.stringify(bundle, null, 2)}\n`);
  return path.resolve(file);
}

export function readBundle(file) {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) throw new Error(`Austauschdatei nicht gefunden: ${resolved}`);
  if (fs.statSync(resolved).size > MAX_BUNDLE_BYTES) throw new Error('Austauschdatei überschreitet 20 MB.');
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (error) {
    throw new Error(`Austauschdatei ist kein gültiges JSON: ${error.message}`);
  }
  return validateBundle(parsed);
}

export function validateBundle(bundle) {
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) throw new Error('Austauschformat: Objekt erwartet.');
  if (bundle.format !== EXCHANGE_FORMAT) throw new Error(`Austauschformat: "format" muss "${EXCHANGE_FORMAT}" sein.`);
  if (bundle.format_version !== EXCHANGE_FORMAT_VERSION) {
    throw new Error(`Austauschformat: Version ${bundle.format_version} wird nicht unterstützt (erwartet ${EXCHANGE_FORMAT_VERSION}).`);
  }
  if (typeof bundle.exported_from !== 'string' || !bundle.exported_from.trim()) throw new Error('Austauschformat: "exported_from" fehlt.');
  if (typeof bundle.exported_at !== 'string' || Number.isNaN(Date.parse(bundle.exported_at))) throw new Error('Austauschformat: "exported_at" ist kein gültiger Zeitstempel.');
  if (!bundle.records || typeof bundle.records !== 'object' || Array.isArray(bundle.records)) throw new Error('Austauschformat: "records" fehlt.');
  for (const collection of COLLECTIONS) {
    const rows = bundle.records[collection.key];
    if (rows === undefined) continue;
    if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
      throw new Error(`Austauschformat: "records.${collection.key}" muss eine Liste von Objekten sein.`);
    }
  }
  return bundle;
}

/**
 * Plans an import without touching the store.
 *
 * Every incoming record is classified as NEW, UNCHANGED, CONFLICT or INVALID.
 * A conflict never overwrites: existing local knowledge is authoritative, and
 * the divergence is reported for a human to resolve.
 */
export function planImport(directory, bundle) {
  validateBundle(bundle);
  const plan = { source: bundle.exported_from, exported_at: bundle.exported_at, collections: {} };

  for (const collection of COLLECTIONS) {
    const incoming = bundle.records[collection.key] ?? [];
    const local = readRecords(directory, collection.file);
    const localByKey = new Map();
    for (const row of local) {
      const key = localKey(collection, row);
      if (key) localByKey.set(key, row);
    }

    const entries = { new: [], unchanged: [], conflict: [], invalid: [] };
    const seen = new Set();

    for (const row of incoming) {
      let key;
      try {
        key = identify(collection, row);
      } catch (error) {
        entries.invalid.push({ id: row[collection.idField] ?? null, reason: error.message });
        continue;
      }
      if (seen.has(key)) {
        entries.invalid.push({ id: key, reason: 'Doppelter Eintrag innerhalb der Austauschdatei.' });
        continue;
      }
      seen.add(key);

      const existing = localByKey.get(key);
      if (!existing) {
        entries.new.push({ id: key, record: row });
      } else if (contentDigest(existing) === contentDigest(row)) {
        entries.unchanged.push({ id: key });
      } else {
        entries.conflict.push({ id: key, reason: 'Gleiche Kennung, abweichender Inhalt. Lokaler Stand bleibt erhalten.' });
      }
    }
    plan.collections[collection.key] = entries;
  }

  plan.totals = Object.fromEntries(['new', 'unchanged', 'conflict', 'invalid'].map((state) => [
    state,
    Object.values(plan.collections).reduce((sum, entries) => sum + entries[state].length, 0),
  ]));
  return plan;
}

/**
 * An imported record carries its origin, and an imported developer fix always
 * lands as PENDING. Trust does not travel: an approval given in another project
 * is provenance, not a local release, so an import on its own can never feed a
 * fix into Rector rule generation.
 */
function localise(collection, record, bundle) {
  const imported = {
    from: bundle.exported_from,
    exported_at: bundle.exported_at,
    imported_at: new Date().toISOString(),
  };

  if (collection.key !== 'developer_fixes') {
    return { ...record, imported };
  }

  const { review_status, reviewed_by, reviewed_at, fingerprint, ...rest } = record;
  const key = identify(collection, record);
  return {
    ...rest,
    fix_id: `FIX-${key.slice(0, 24).toUpperCase()}`,
    fingerprint: key,
    review_status: 'PENDING',
    reviewed_by: null,
    reviewed_at: null,
    imported: {
      ...imported,
      origin_review: {
        status: review_status ?? 'PENDING',
        reviewed_by: reviewed_by ?? null,
        reviewed_at: reviewed_at ?? null,
      },
    },
  };
}

/**
 * Applies a planned import. Only NEW records are written; conflicts, duplicates
 * and invalid records are reported and change nothing. Re-importing the same
 * bundle is therefore a no-op.
 */
export function importKnowledge(directory, bundle, options = {}) {
  validateBundle(bundle);
  if (options.dryRun) return { ...planImport(directory, bundle), applied: false };

  // Plan and write share one exclusive lock: a concurrent writer between the two
  // would otherwise make the plan stale and could resurrect a record that was
  // just removed, or duplicate one that was just added.
  return withStoreLock(directory, () => {
    const plan = planImport(directory, bundle);

    for (const collection of COLLECTIONS) {
      const additions = plan.collections[collection.key].new;
      if (additions.length === 0) continue;

      const local = readRecords(directory, collection.file);
      const merged = [...local, ...additions.map((entry) => localise(collection, entry.record, bundle))];
      const file = path.join(directory, collection.file);
      atomicWrite(file, collection.file.endsWith('.jsonl')
        ? `${merged.map((row) => JSON.stringify(row)).join('\n')}\n`
        : `${JSON.stringify(merged, null, 2)}\n`);
    }

    return { ...plan, applied: true };
  });
}
