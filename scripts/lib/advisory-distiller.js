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
];

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
  const match = TAXONOMY
    .map((candidate) => ({
      candidate,
      score: candidate.terms.filter((term) => searchable.includes(term)).length,
    }))
    .sort((left, right) => right.score - left.score)
    .find(({ score }) => score > 0)?.candidate;

  return {
    id: inferId({ ...item, title, summary: description }),
    type: match?.type || "UNCLASSIFIED",
    severity: match?.severity || "UNKNOWN",
    title,
    description,
    link: String(item.link || ""),
    published_at: String(item.pubDate || item.published_at || ""),
    confidence: match ? "EXPERIMENTAL" : "UNCLASSIFIED",
    vulnerable_code: match?.vulnerable || "",
    secure_code: match?.secure || "",
    source: "TYPO3_SECURITY_FEED",
  };
}

function phpString(value) {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

export function fixtureFor(advisory) {
  if (advisory.confidence !== "EXPERIMENTAL" || !advisory.vulnerable_code) return null;

  const classSuffix = advisory.id.replace(/[^A-Za-z0-9]/gu, "_");
  const title = phpString(advisory.title).replaceAll("*/", "* /");
  return `<?php

declare(strict_types=1);

namespace Typo3SecuritySuite\\Tests\\Fixtures\\Learned;

/**
 * Experimental vulnerable fixture for ${advisory.id}.
 * Source title: ${title}
 * This file is test input and must never be used in production.
 */
final class ${classSuffix}
{
    public function vulnerable(object $queryBuilder, object $querySettings, object $repository, object $model, object $authorizationService, string $userInput): void
    {
        ${advisory.vulnerable_code}
    }
}
`;
}

export function persistLearning(advisories, options) {
  const knowledgeFile = path.join(options.knowledgeDir, "advisories.json");
  const fixturesDir = options.fixturesDir;
  const existing = fs.existsSync(knowledgeFile) ? JSON.parse(fs.readFileSync(knowledgeFile, "utf8")) : [];
  const byId = new Map(existing.map((item) => [item.id, item]));
  const createdFixtures = [];

  for (const advisory of advisories) {
    const existingAdvisory = byId.get(advisory.id);
    byId.set(advisory.id, {
      ...existingAdvisory,
      ...advisory,
      vulnerable_code: existingAdvisory?.vulnerable_code || advisory.vulnerable_code,
      secure_code: existingAdvisory?.secure_code || advisory.secure_code,
    });
    const fixture = fixtureFor(advisory);
    if (!fixture) continue;
    const filename = `${advisory.id.replace(/[^A-Za-z0-9._-]/gu, "_")}.php`;
    createdFixtures.push(filename);
    if (!options.dryRun) {
      fs.mkdirSync(fixturesDir, { recursive: true });
      fs.writeFileSync(path.join(fixturesDir, filename), fixture, "utf8");
    }
  }

  if (!options.dryRun) {
    fs.mkdirSync(options.knowledgeDir, { recursive: true });
    const sorted = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
    fs.writeFileSync(knowledgeFile, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
  }

  return { stored: advisories.length, createdFixtures };
}
