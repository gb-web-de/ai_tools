import process from 'node:process';

export const LANGUAGES = ['en', 'de'];
export const DEFAULT_LANGUAGE = 'en';

/**
 * Resolution order for console output, highest priority first:
 *
 *   1. --lang de|en          explicit, for a single invocation
 *   2. TYPO3_AI_LANG         project-wide, e.g. in CI or .envrc
 *   3. LC_ALL / LC_MESSAGES / LANG   the POSIX convention, so a German
 *                            workstation gets German without configuring anything
 *   4. 'en'                  CI usually reports LANG=C, which keeps build logs
 *                            and issue reports readable for everyone
 *
 * An unsupported value is ignored rather than rejected: a tool should not fail
 * because a machine is set to a locale it has no translation for.
 */
export function resolveLanguage(explicit, env = process.env) {
  const candidates = [explicit, env.TYPO3_AI_LANG, env.LC_ALL, env.LC_MESSAGES, env.LANG];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    const tag = candidate.trim().toLowerCase().split(/[._@-]/u)[0];
    if (LANGUAGES.includes(tag)) return tag;
  }
  return DEFAULT_LANGUAGE;
}

const MESSAGES = {
  // --- shared ---
  'cli.langOption': {
    en: 'Output language: en or de. Falls back to TYPO3_AI_LANG, then the system locale.',
    de: 'Ausgabesprache: en oder de. Fällt zurück auf TYPO3_AI_LANG, dann die System-Locale.',
  },

  // --- knowledge import ---
  'import.inRequired': {
    en: '--in <file|directory> is required.',
    de: '--in <datei|verzeichnis> ist erforderlich.',
  },
  'import.sourceNotFound': {
    en: 'Exchange source not found: {target}',
    de: 'Austauschquelle nicht gefunden: {target}',
  },
  'import.setupIntro': {
    en: 'The shared knowledge lives in its own (private) Git repository, which has to be set up first. Once per workstation:',
    de: 'Der gemeinsame Wissensbestand liegt in einem eigenen (privaten) Git-Repository, das zuerst eingerichtet werden muss. Einmalig pro Arbeitsplatz:',
  },
  'import.setupNoRepo': {
    en: 'No shared repository yet? Create one locally and distribute it later:',
    de: 'Noch kein Share-Repository vorhanden? Dann lokal anlegen und später verteilen:',
  },
  'import.setupDetails': {
    en: 'Details: docs/en/CONTINUOUS_LEARNING.md, section "Git-based team workflow".',
    de: 'Details: docs/de/CONTINUOUS_LEARNING.md, Abschnitt "Git-basierter Team-Workflow".',
  },
  'import.noBundles': {
    en: 'No .json exchange files in {target}. Is a project already exporting there? See docs/en/CONTINUOUS_LEARNING.md.',
    de: 'Keine .json-Austauschdateien in {target}. Exportiert ein Projekt bereits dorthin? Siehe docs/de/CONTINUOUS_LEARNING.md.',
  },
  'import.note': {
    en: 'Imported developer fixes are local PENDING. An import grants no approval and activates no Rector rule.',
    de: 'Importierte Entwickler-Fixes stehen lokal auf PENDING. Ein Import erteilt keine Freigabe und aktiviert keine Rector-Regel.',
  },
  'import.problems': {
    en: '{conflict} conflict(s) and {invalid} invalid record(s). Existing knowledge was left unchanged.',
    de: '{conflict} Konflikt(e) und {invalid} ungültige(r) Eintrag/Einträge. Bestehendes Wissen wurde nicht verändert.',
  },

  // --- knowledge export ---
  'export.outRequired': {
    en: '--out <file> is required (or --dry-run for a preview).',
    de: '--out <datei> ist erforderlich (oder --dry-run für eine Vorschau).',
  },
  'export.sensitiveWarning': {
    en: 'Warning: {count} record(s) were exported despite possibly confidential content (--allow-sensitive).',
    de: 'Warnung: {count} Eintrag/Einträge wurden trotz möglicher vertraulicher Daten exportiert (--allow-sensitive).',
  },

  // --- fixture status ---
  'status.summary': {
    en: 'Regression cases: {total} (approved {approved}, open {pending}, rejected {rejected}{stale})',
    de: 'Regressionsfälle: {total} (freigegeben {approved}, offen {pending}, abgelehnt {rejected}{stale})',
  },
  'status.staleSuffix': {
    en: ', stale {count}',
    de: ', veraltet {count}',
  },
  'status.markApproved': { en: '[ok]   ', de: '[ok]   ' },
  'status.markPending': { en: '[open] ', de: '[offen]' },
  'status.markRejected': { en: '[rejected]', de: '[abgelehnt]' },
  'status.markStale': { en: '[stale]', de: '[veraltet]' },
  'status.uncovered': {
    en: 'Without a fixture pair: {identifiers}',
    de: 'Ohne Fixture-Paar: {identifiers}',
  },
  'status.staleWarning': {
    en: '{count} approval(s) stale: the example pair changed after approval. Review again and approve with "npm run fixtures:review".',
    de: '{count} Freigabe(n) veraltet: Das Beispielpaar wurde nach der Freigabe geändert. Erneut prüfen und mit "npm run fixtures:review" freigeben.',
  },
  'status.gateFailed': {
    en: '{count} fixture pair(s) without a valid human approval. A review is required before use in CI gates or rule generation.',
    de: '{count} Fixture-Paar(e) ohne gültige menschliche Freigabe. Ein Review ist Voraussetzung für die Nutzung in CI-Gates oder Regelerzeugung.',
  },

  // --- fixture review ---
  'review.slugRequired': {
    en: '--slug <slug> or --show <slug> is required. Overview: npm run fixtures:status',
    de: '--slug <slug> oder --show <slug> ist erforderlich. Übersicht: npm run fixtures:status',
  },
  'review.byRequired': {
    en: '--by "<name>" is required: an approval needs a nameable reviewer.',
    de: '--by "<Name>" ist erforderlich: eine Freigabe braucht einen benennbaren Reviewer.',
  },
  'review.noteTooLong': {
    en: '--note is too long (max. 2000 characters).',
    de: '--note ist zu lang (max. 2000 Zeichen).',
  },
  'review.rejectNeedsNote': {
    en: '--reject requires --note "<reason>" so the rejection stays traceable.',
    de: '--reject benötigt --note "<Grund>", damit die Ablehnung nachvollziehbar bleibt.',
  },
  'review.unknownCase': {
    en: 'Unknown case: {slug}\nAvailable: {available}',
    de: 'Unbekannter Fall: {slug}\nVerfügbar: {available}',
  },
  'review.fieldTitle': { en: 'Title:      ', de: 'Titel:      ' },
  'review.fieldRule': { en: 'Rule:       ', de: 'Regel:      ' },
  'review.fieldIdentifier': { en: 'Identifier: ', de: 'Identifier: ' },
  'review.fieldOrigin': { en: 'Provenance: ', de: 'Herkunft:   ' },
  'review.fieldClaim': { en: 'Claim:      ', de: 'Aussage:    ' },
  'review.fieldNote': { en: 'Note:       ', de: 'Hinweis:    ' },
  'review.fieldCause': { en: 'Root cause:', de: 'Ursache:' },
  'review.labelVulnerable': { en: 'VULNERABLE', de: 'VERWUNDBAR' },
  'review.labelSecure': { en: 'SECURE', de: 'SICHER' },
  'review.checklistHeading': { en: 'Check:', de: 'Prüfpunkte:' },
  'review.check1': {
    en: 'Does the vulnerable example show a flaw that occurs this way in real TYPO3 code?',
    de: 'Bildet das verwundbare Beispiel eine Schwachstelle ab, die in echtem TYPO3-Code so vorkommt?',
  },
  'review.check2': {
    en: 'Does the root_cause stated in case.json apply to exactly this code?',
    de: 'Trifft die in case.json beschriebene Ursache (root_cause) auf genau diesen Code zu?',
  },
  'review.check3': {
    en: 'Is the secure counterpart functionally equivalent - same job, done safely?',
    de: 'Ist das sichere Gegenbeispiel fachlich gleichwertig - löst es dieselbe Aufgabe, nur sicher?',
  },
  'review.check4': {
    en: 'Is the provenance right: does origin claim no more than the source supports?',
    de: 'Stimmt die Herkunft: behauptet origin nicht mehr, als die Quelle hergibt?',
  },
  'review.check5': {
    en: 'Is the expected identifier the rule responsible for this vulnerability class?',
    de: 'Ist der erwartete Identifier die Regel, die für diese Schwachstellenklasse zuständig ist?',
  },
  'review.checkNotYours': {
    en: 'That the rule detects the vulnerable example and stays silent on the secure one is already covered by the regression test - not part of this review.',
    de: 'Dass die Regel das verwundbare Beispiel erkennt und beim sicheren schweigt, prüft bereits der Regressionstest - das ist nicht Aufgabe des Reviews.',
  },
  'review.hintApprove': { en: 'Approve:  ', de: 'Freigeben:' },
  'review.hintReject': { en: 'Reject:   ', de: 'Ablehnen: ' },
  'review.staleHint': {
    en: 'Note: if either example is changed afterwards, the approval expires (status STALE).',
    de: 'Hinweis: Wird eines der beiden Beispiele danach geändert, verfällt die Freigabe (Status STALE).',
  },

  // --- advisory learning ---
  'learn.usage': {
    en: 'Usage: npm run learn:advisories -- [--input <rss|json>] [--limit <1-100>] [--knowledge-dir <path>] [--lang <en|de>] [--dry-run]',
    de: 'Aufruf: npm run learn:advisories -- [--input <rss|json>] [--limit <1-100>] [--knowledge-dir <pfad>] [--lang <en|de>] [--dry-run]',
  },
  'learn.failed': {
    en: 'Advisory learning failed: {message}',
    de: 'Advisory-Lernen fehlgeschlagen: {message}',
  },
  'learn.unknownOption': {
    en: 'Unknown option: {option}',
    de: 'Unbekannte Option: {option}',
  },
  'learn.limitRange': {
    en: '--limit must be an integer between 1 and 100.',
    de: '--limit muss eine ganze Zahl zwischen 1 und 100 sein.',
  },
};

/**
 * @param {string} language a value from LANGUAGES
 * @returns {(key: string, params?: Record<string, string|number>) => string}
 */
export function translator(language) {
  const lang = LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE;
  return (key, params = {}) => {
    const entry = MESSAGES[key];
    // A missing key is a bug in the caller, not a reason to print nothing.
    if (!entry) throw new Error(`Unbekannter Übersetzungsschlüssel: ${key}`);
    const template = entry[lang] ?? entry[DEFAULT_LANGUAGE];
    return template.replace(/\{(\w+)\}/gu, (match, name) => (name in params ? String(params[name]) : match));
  };
}

/** Every key must exist in every language; a gap would surface as English in a German run. */
export function missingTranslations() {
  const gaps = [];
  for (const [key, entry] of Object.entries(MESSAGES)) {
    for (const language of LANGUAGES) {
      if (typeof entry[language] !== 'string' || !entry[language]) gaps.push(`${key}:${language}`);
    }
  }
  return gaps;
}

export const messageKeys = () => Object.keys(MESSAGES);
