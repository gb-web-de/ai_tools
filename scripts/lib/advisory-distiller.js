import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const TAXONOMY = [
  {
    type: "SQL_INJECTION",
    severity: "CRITICAL",
    terms: ["sql injection", "sqli", "querybuilder", "order by"],
    vulnerable: "$queryBuilder->where('uid = ' . $userInput);",
    secure: "$queryBuilder->where($queryBuilder->expr()->eq('uid', $queryBuilder->createNamedParameter($userInput, \\PDO::PARAM_INT)));",
  },
  {
    type: "XSS",
    severity: "HIGH",
    terms: ["cross-site scripting", "cross site scripting", " xss", "html injection"],
    vulnerable: "echo $userInput;",
    secure: "echo htmlspecialchars($userInput, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');",
  },
  {
    type: "BROKEN_ACCESS_CONTROL",
    severity: "HIGH",
    terms: ["access control", "authorization", "authorisation", "permission bypass", "privilege escalation"],
    vulnerable: "$repository->update($model);",
    secure: "if (!$authorizationService->isAllowed($model)) { throw new \\RuntimeException('Access denied'); }",
  },
  {
    type: "DATA_LEAKAGE",
    severity: "HIGH",
    terms: ["data leakage", "information disclosure", "setignoreenablefields", "setrespectstoragepage"],
    vulnerable: "$querySettings->setIgnoreEnableFields(true);",
    secure: "$querySettings->setIgnoreEnableFields(false);",
  },
  {
    type: "DESERIALIZATION",
    severity: "CRITICAL",
    terms: ["deserialization", "deserialisation", "unserialize", "object injection"],
    vulnerable: "$value = unserialize($userInput);",
    secure: "$value = json_decode($userInput, true, 512, JSON_THROW_ON_ERROR);",
  },
  {
    type: "SSRF",
    severity: "HIGH",
    terms: ["server-side request forgery", "server side request forgery", "ssrf"],
    vulnerable: "$response = file_get_contents($userInput);",
    secure: "if (!in_array(parse_url($userInput, PHP_URL_HOST), ['api.example.com'], true)) { throw new \\InvalidArgumentException('Host not allowed'); }",
  },
  {
    type: "FILE_UPLOAD",
    severity: "HIGH",
    terms: ["unrestricted file upload", "arbitrary file upload", "file upload"],
    vulnerable: "move_uploaded_file($_FILES['upload']['tmp_name'], 'fileadmin/' . $_FILES['upload']['name']);",
    secure: "$folder->addUploadedFile($uploadedFile, \\TYPO3\\CMS\\Core\\Resource\\Enum\\DuplicationBehavior::RENAME);",
  },
  {
    type: "OPEN_REDIRECT",
    severity: "MEDIUM",
    terms: ["open redirect", "unvalidated redirect"],
    vulnerable: "header('Location: ' . $userInput);",
    secure: "if (parse_url($userInput, PHP_URL_HOST) !== null || !str_starts_with($userInput, '/')) { throw new \\InvalidArgumentException('Only relative redirect targets are allowed'); }",
  },
  {
    type: "PATH_TRAVERSAL",
    severity: "HIGH",
    terms: ["path traversal", "directory traversal", "local file inclusion"],
    vulnerable: "$content = file_get_contents(\\TYPO3\\CMS\\Core\\Core\\Environment::getPublicPath() . '/fileadmin/' . $userInput);",
    secure: "$path = \\TYPO3\\CMS\\Core\\Utility\\GeneralUtility::getFileAbsFileName('fileadmin/' . $userInput); if ($path === '') { throw new \\InvalidArgumentException('Invalid path'); }",
  },
  {
    type: "SSTI",
    severity: "CRITICAL",
    terms: ["server-side template injection", "server side template injection", "template injection", "ssti"],
    vulnerable: "$view->setTemplateSource($userInput);",
    secure: "$view->assign('userInput', $userInput);",
  },
  {
    type: "RCE",
    severity: "CRITICAL",
    terms: ["remote code execution", "code execution", "command injection", " rce"],
    vulnerable: "shell_exec('convert ' . $userInput . ' output.png');",
    secure: "\\TYPO3\\CMS\\Core\\Utility\\CommandUtility::exec('convert ' . escapeshellarg($userInput) . ' output.png');",
  },
];

// Templates the distiller wrote itself. A stored example that is not one of
// these was curated by a person and must survive a re-classification.
const GENERATED_EXAMPLES = new Set(TAXONOMY.flatMap(({ vulnerable, secure }) => [vulnerable, secure]));

const SEVERITY_RANK = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };

function decodeXml(value = "") {
  return value
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/u, "$1")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .trim();
}

function tagValue(xml, names) {
  for (const name of names) {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const match = xml.match(new RegExp(`<${escapedName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapedName}>`, "iu"));
    if (match) return decodeXml(match[1]);
  }
  return "";
}

export function parseRss(xml) {
  const itemMatches = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/giu) || [];
  return itemMatches.map((item) => ({
    title: tagValue(item, ["title"]),
    link: tagValue(item, ["link", "guid"]),
    pubDate: tagValue(item, ["pubDate", "dc:date"]),
    summary: tagValue(item, ["description", "content:encoded"]),
  }));
}

function plainText(value) {
  return value
    .replace(/<[^>]+>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function inferId(item) {
  if (/^TYPO3-(?:CORE-SA|EXT-SA|PSA)-\d{4}-\d+$/iu.test(String(item.id || ""))) {
    return String(item.id).toUpperCase();
  }
  const haystack = `${item.title} ${item.link} ${item.summary}`;
  const officialId = haystack.match(/TYPO3-(?:CORE-SA|EXT-SA|PSA)-\d{4}-\d+/iu)?.[0];
  if (officialId) return officialId.toUpperCase();

  return `TYPO3-ADVISORY-${crypto.createHash("sha256").update(`${item.title}|${item.link}`).digest("hex").slice(0, 12).toUpperCase()}`;
}

export function distillAdvisory(item) {
  const title = plainText(String(item.title || "Untitled TYPO3 security advisory"));
  const description = plainText(String(item.summary || item.description || ""));
  const searchable = ` ${title} ${description}`.toLowerCase();
  const searchableTitle = ` ${title}`.toLowerCase();
  // Core advisories in the feed often carry a generic teaser ("susceptible to
  // broken access control") that contradicts the specific title. On a tie the
  // title therefore wins, then the more severe class.
  const matches = TAXONOMY
    .map((candidate) => ({
      candidate,
      score: candidate.terms.filter((term) => searchable.includes(term)).length,
      titleScore: candidate.terms.filter((term) => searchableTitle.includes(term)).length,
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score
      || right.titleScore - left.titleScore
      || SEVERITY_RANK[right.candidate.severity] - SEVERITY_RANK[left.candidate.severity]);
  const primary = matches[0]?.candidate;

  // One advisory may name several classes ("Privilege Escalation & SQL
  // Injection", "Multiple vulnerabilities ... Broken Access Control and SSTI").
  // A class named in the title is trusted; the teaser only counts when the
  // title names none, because only then does it list the actual classes.
  const titled = matches.filter(({ titleScore }) => titleScore > 0);
  const classes = [primary, ...(titled.length > 0 ? titled : matches).map(({ candidate }) => candidate)]
    .filter((candidate, index, all) => candidate && all.indexOf(candidate) === index);
  const findings = classes.map((candidate) => ({
    type: candidate.type,
    severity: candidate.severity,
    vulnerable_code: candidate.vulnerable,
    secure_code: candidate.secure,
  }));
  const severity = findings.map((finding) => finding.severity)
    .sort((left, right) => SEVERITY_RANK[right] - SEVERITY_RANK[left])[0];

  return {
    id: inferId({ ...item, title, summary: description }),
    type: primary?.type || "UNCLASSIFIED",
    severity: severity || "UNKNOWN",
    title,
    description,
    link: String(item.link || ""),
    published_at: String(item.pubDate || item.published_at || ""),
    confidence: primary ? "EXPERIMENTAL" : "UNCLASSIFIED",
    vulnerable_code: primary?.vulnerable || "",
    secure_code: primary?.secure || "",
    findings,
    source: "TYPO3_SECURITY_FEED",
  };
}

function phpString(value) {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function methodName(type) {
  return `vulnerable${type.toLowerCase().replace(/(?:^|_)([a-z])/gu, (_, letter) => letter.toUpperCase())}`;
}

export function draftFixtureFor(advisory) {
  if (advisory.confidence !== "EXPERIMENTAL" || !advisory.vulnerable_code) return null;

  const findings = advisory.findings?.length
    ? advisory.findings
    : [{ type: advisory.type, vulnerable_code: advisory.vulnerable_code }];
  const methods = findings.map((finding) => `    public function ${methodName(finding.type)}(object $queryBuilder, object $querySettings, object $repository, object $model, object $authorizationService, object $view, string $userInput): void
    {
        ${finding.vulnerable_code}
    }`).join("\n\n");

  const classSuffix = advisory.id.replace(/[^A-Za-z0-9]/gu, "_");
  const title = phpString(advisory.title).replaceAll("*/", "* /");
  return `<?php

declare(strict_types=1);

namespace Typo3SecuritySuite\\Tests\\Fixtures\\Learned;

/**
 * EXPERIMENTAL DRAFT for ${advisory.id} - do not commit this file.
 *
 * Source title: ${title}
 *
 * Each method is a generic one-liner derived from one vulnerability class the
 * advisory names, not from its documented root cause, and no rule has been
 * shown to detect it.
 * It is therefore not evidence of anything. To turn it into a regression case,
 * follow docs/en/CONTINUOUS_LEARNING.md: write a realistic vulnerable example and
 * an equivalent secure counterpart under tests/fixtures/regression/<slug>/ with
 * a reviewed case.json. This file is test input and must never run in production.
 */
final class ${classSuffix}
{
${methods}
}
`;
}

export function persistLearning(advisories, options) {
  const knowledgeFile = path.join(options.knowledgeDir, "advisories.json");
  const draftsDir = options.draftsDir;
  const existing = fs.existsSync(knowledgeFile) ? JSON.parse(fs.readFileSync(knowledgeFile, "utf8")) : [];
  const byId = new Map(existing.map((item) => [item.id, item]));
  const createdDrafts = [];

  for (const advisory of advisories) {
    const existingAdvisory = byId.get(advisory.id);
    // Keep an example a person curated, but replace one the distiller generated
    // itself: otherwise an improved classification could never correct it.
    const curated = (value) => (value && !GENERATED_EXAMPLES.has(value) ? value : "");
    const vulnerable = curated(existingAdvisory?.vulnerable_code) || advisory.vulnerable_code;
    const secure = curated(existingAdvisory?.secure_code) || advisory.secure_code;
    const findings = advisory.findings.map((finding, index) => (index === 0
      ? { ...finding, vulnerable_code: vulnerable, secure_code: secure }
      : finding));
    const merged = { ...existingAdvisory, ...advisory, vulnerable_code: vulnerable, secure_code: secure, findings };
    byId.set(advisory.id, merged);
    const fixture = draftFixtureFor(merged);
    if (!fixture) continue;
    const filename = `${advisory.id.replace(/[^A-Za-z0-9._-]/gu, "_")}.php`;
    createdDrafts.push(filename);
    if (!options.dryRun) {
      fs.mkdirSync(draftsDir, { recursive: true });
      fs.writeFileSync(path.join(draftsDir, filename), fixture, "utf8");
    }
  }

  if (!options.dryRun) {
    fs.mkdirSync(options.knowledgeDir, { recursive: true });
    const sorted = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
    fs.writeFileSync(knowledgeFile, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
  }

  return { stored: advisories.length, createdDrafts };
}
