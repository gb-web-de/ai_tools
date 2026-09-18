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
