#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { distillAdvisory, parseRss, persistLearning } from "./lib/advisory-distiller.js";
import { resolveKnowledgeDir } from "./lib/knowledge-paths.js";
import { resolveLanguage, translator } from "./lib/i18n.js";

function parseArguments(argv) {
  const options = { input: "https://news.typo3.com/security/rss-security", limit: 10, dryRun: false, knowledgeDir: undefined, lang: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--input") options.input = argv[++index];
    else if (argument === "--limit") options.limit = Number.parseInt(argv[++index], 10);
    else if (argument === "--knowledge-dir") options.knowledgeDir = argv[++index];
    else if (argument === "--lang") options.lang = argv[++index];
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--help") options.help = true;
    else throw new Error(translator(resolveLanguage(options.lang))("learn.unknownOption", { option: argument }));
  }
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100) {
    throw new Error(translator(resolveLanguage(options.lang))("learn.limitRange"));
  }
  return options;
}

async function readInput(input) {
  if (/^https:\/\//u.test(input)) {
    const response = await fetch(input, { headers: { "user-agent": "typo3-ai-security-suite/1.0" } });
    if (!response.ok) throw new Error(`Feed antwortete mit HTTP ${response.status}.`);
    return { body: await response.text(), contentType: response.headers.get("content-type") || "" };
  }

  return { body: await fs.readFile(path.resolve(input), "utf8"), contentType: path.extname(input) };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(translator(resolveLanguage(options.lang))("learn.usage"));
    return;
  }

  const { body, contentType } = await readInput(options.input);
  const rawItems = contentType.includes("json") || options.input.endsWith(".json") ? JSON.parse(body) : parseRss(body);
  if (!Array.isArray(rawItems)) throw new Error("Die Advisory-Quelle muss eine Liste liefern.");

  const advisories = rawItems.slice(0, options.limit).map(distillAdvisory);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const knowledgeDir = resolveKnowledgeDir(options.knowledgeDir);
  const result = persistLearning(advisories, {
    knowledgeDir,
    // Generic drafts stay out of the versioned fixture tree: only a reviewed
    // vulnerable/secure pair under tests/fixtures/regression/ may be committed.
    draftsDir: path.join(root, "var/advisory-drafts"),
    dryRun: options.dryRun,
  });

  console.log(JSON.stringify({ source: options.input, knowledgeDir, dryRun: options.dryRun, ...result }, null, 2));
}

main().catch((error) => {
  console.error(translator(resolveLanguage()).call(null, "learn.failed", { message: error.message }));
  process.exitCode = 1;
});
