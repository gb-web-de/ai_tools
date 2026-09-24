import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { distillAdvisory, parseRss, persistLearning } from "../scripts/lib/advisory-distiller.js";

test("parses, classifies and persists a known advisory", () => {
  const xml = `<?xml version="1.0"?><rss><channel><item>
    <title>TYPO3-CORE-SA-2026-001: SQL Injection in QueryBuilder</title>
    <link>https://typo3.org/security/advisory/example</link>
    <description><![CDATA[User-controlled values cause SQL injection.]]></description>
  </item></channel></rss>`;
  const [advisory] = parseRss(xml).map(distillAdvisory);
  assert.equal(advisory.id, "TYPO3-CORE-SA-2026-001");
  assert.equal(advisory.type, "SQL_INJECTION");
  assert.equal(advisory.confidence, "EXPERIMENTAL");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "typo3-advisory-"));
  const result = persistLearning([advisory], {
    knowledgeDir: path.join(root, "knowledge"),
    draftsDir: path.join(root, "drafts"),
    dryRun: false,
  });
  assert.deepEqual(result.createdDrafts, ["TYPO3-CORE-SA-2026-001.php"]);
  const fixture = fs.readFileSync(path.join(root, "drafts/TYPO3-CORE-SA-2026-001.php"), "utf8");
  assert.match(fixture, /declare\(strict_types=1\);/u);
  assert.match(fixture, /->where\('uid = ' \. \$userInput\)/u);
  // A generic draft must state that it is not evidence and must not be committed,
  // so it cannot be mistaken for a reviewed regression fixture.
  assert.match(fixture, /EXPERIMENTAL DRAFT[\s\S]*do not commit this file/u);
  assert.match(fixture, /tests\/fixtures\/regression/u);
});

test("does not generate code for an unknown advisory category", () => {
  const advisory = distillAdvisory({ title: "TYPO3-EXT-SA-2026-999: Generic issue", summary: "No known category." });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "typo3-advisory-"));
  const result = persistLearning([advisory], {
    knowledgeDir: path.join(root, "knowledge"),
    draftsDir: path.join(root, "drafts"),
    dryRun: false,
  });
  assert.equal(advisory.confidence, "UNCLASSIFIED");
  assert.deepEqual(result.createdDrafts, []);
  assert.equal(fs.existsSync(path.join(root, "drafts")), false);
});

test("prefers the most specific taxonomy match and preserves curated examples", () => {
  const advisory = distillAdvisory({
    id: "TYPO3-PSA-2026-002",
    title: "Permission bypass via Extbase QuerySettings",
    description: "setIgnoreEnableFields causes data leakage",
  });
  assert.equal(advisory.type, "DATA_LEAKAGE");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "typo3-advisory-"));
  const knowledgeDir = path.join(root, "knowledge");
  fs.mkdirSync(knowledgeDir);
  fs.writeFileSync(
    path.join(knowledgeDir, "advisories.json"),
    JSON.stringify([{ id: advisory.id, vulnerable_code: "$curatedUnsafeCall();", secure_code: "$curatedSafeCall();" }]),
  );
  persistLearning([advisory], {
    knowledgeDir,
    draftsDir: path.join(root, "drafts"),
    dryRun: false,
  });
  const [stored] = JSON.parse(fs.readFileSync(path.join(knowledgeDir, "advisories.json"), "utf8"));
  assert.equal(stored.vulnerable_code, "$curatedUnsafeCall();");
  assert.equal(stored.secure_code, "$curatedSafeCall();");
});

test("lets the specific title win over a contradicting generic feed teaser", () => {
  // Real feed entry: the title names the class, the teaser is boilerplate.
  const advisory = distillAdvisory({
    title: "TYPO3-CORE-SA-2026-018: Insecure Deserialization in Core API",
    summary: "It has been discovered that TYPO3 CMS is susceptible to broken access control.",
  });
  assert.equal(advisory.type, "DESERIALIZATION");
  assert.match(advisory.vulnerable_code, /unserialize/u);
});

test("classifies the feed's former blind spots", () => {
  // Titles and teasers as published in the TYPO3 security feed.
  const cases = [
    ["TYPO3-CORE-SA-2026-020: Unrestricted File Upload in Form Framework", "susceptible to security misconfiguration.", "FILE_UPLOAD"],
    ["TYPO3-CORE-SA-2026-009: Open Redirect in TYPO3 CMS", "susceptible to open redirect.", "OPEN_REDIRECT"],
    ['TYPO3-EXT-SA-2026-017: Path Traversal in extension "Mask" (mask)', "vulnerable to Path Traversal.", "PATH_TRAVERSAL"],
    ['TYPO3-EXT-SA-2026-022: Server-Side Template Injection (SSTI) in extension "powermail"', "vulnerable to Server-Side Template Injection (SSTI).", "SSTI"],
    ['TYPO3-EXT-SA-2026-014: Remote Code Execution in extension "HTML5 Video Player vs. Powermail"', "vulnerable to Remote Code Execution.", "RCE"],
  ];
  for (const [title, summary, type] of cases) {
    const advisory = distillAdvisory({ title, summary });
    assert.equal(advisory.type, type, title);
    assert.equal(advisory.confidence, "EXPERIMENTAL", title);
    assert.deepEqual(advisory.findings.map((finding) => finding.type), [type], title);
  }
});

test("records every class an advisory names", () => {
  const combined = distillAdvisory({
    title: "TYPO3-CORE-SA-2026-017: Privilege Escalation & SQL Injection in Form Framework",
    summary: "It has been discovered that TYPO3 CMS is susceptible to broken access control.",
  });
  assert.deepEqual(combined.findings.map((finding) => finding.type).sort(), ["BROKEN_ACCESS_CONTROL", "SQL_INJECTION"]);
  assert.equal(combined.severity, "CRITICAL", "The advisory is as severe as its worst class.");

  // "Multiple vulnerabilities" titles name no class; the teaser lists them.
  const multiple = distillAdvisory({
    title: 'TYPO3-EXT-SA-2026-025: Multiple Vulnerabilities in extension "Apache Solr for TYPO3" (solr)',
    summary: "vulnerable to Broken Access Control, Insecure Deserialization and Information Disclosure.",
  });
  assert.deepEqual(multiple.findings.map((finding) => finding.type).sort(), ["BROKEN_ACCESS_CONTROL", "DATA_LEAKAGE", "DESERIALIZATION"]);

  // A teaser class the title contradicts must not become a finding.
  const contradicted = distillAdvisory({
    title: "TYPO3-CORE-SA-2026-018: Insecure Deserialization in Core API",
    summary: "It has been discovered that TYPO3 CMS is susceptible to broken access control.",
  });
  assert.deepEqual(contradicted.findings.map((finding) => finding.type), ["DESERIALIZATION"]);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "typo3-advisory-"));
  persistLearning([combined], { knowledgeDir: path.join(root, "knowledge"), draftsDir: path.join(root, "drafts"), dryRun: false });
  const draft = fs.readFileSync(path.join(root, "drafts/TYPO3-CORE-SA-2026-017.php"), "utf8");
  assert.match(draft, /function vulnerableSqlInjection\(/u);
  assert.match(draft, /function vulnerableBrokenAccessControl\(/u);
});

test("replaces a generated example once the classification improves", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "typo3-advisory-"));
  const knowledgeDir = path.join(root, "knowledge");
  fs.mkdirSync(knowledgeDir);
  // Stored by the earlier, misclassifying distiller.
  fs.writeFileSync(path.join(knowledgeDir, "advisories.json"), JSON.stringify([{
    id: "TYPO3-CORE-SA-2026-018",
    type: "BROKEN_ACCESS_CONTROL",
    vulnerable_code: "$repository->update($model);",
    secure_code: "if (!$authorizationService->isAllowed($model)) { throw new \\RuntimeException('Access denied'); }",
  }]));
  const advisory = distillAdvisory({
    title: "TYPO3-CORE-SA-2026-018: Insecure Deserialization in Core API",
    summary: "It has been discovered that TYPO3 CMS is susceptible to broken access control.",
  });
  persistLearning([advisory], { knowledgeDir, draftsDir: path.join(root, "drafts"), dryRun: false });
  const [stored] = JSON.parse(fs.readFileSync(path.join(knowledgeDir, "advisories.json"), "utf8"));
  assert.equal(stored.type, "DESERIALIZATION");
  assert.match(stored.vulnerable_code, /unserialize/u);
  assert.match(stored.findings[0].vulnerable_code, /unserialize/u);
});
