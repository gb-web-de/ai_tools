#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { distillAdvisory, parseRss, persistLearning } from "./lib/advisory-distiller.js";

function parseArguments(argv) {
  const options = { input: "https://news.typo3.com/security/rss-security", limit: 10, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--input") options.input = argv[++index];
    else if (argument === "--limit") options.limit = Number.parseInt(argv[++index], 10);
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--help") options.help = true;
    else throw new Error(`Unbekannte Option: ${argument}`);
  }
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100) {
    throw new Error("--limit muss eine ganze Zahl zwischen 1 und 100 sein.");
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
    console.log("Usage: npm run learn:advisories -- [--input <rss|json>] [--limit <1-100>] [--dry-run]");
    return;
  }

  const { body, contentType } = await readInput(options.input);
  const rawItems = contentType.includes("json") || options.input.endsWith(".json") ? JSON.parse(body) : parseRss(body);
  if (!Array.isArray(rawItems)) throw new Error("Die Advisory-Quelle muss eine Liste liefern.");

  const advisories = rawItems.slice(0, options.limit).map(distillAdvisory);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = persistLearning(advisories, {
    knowledgeDir: path.join(root, ".typo3-knowledge"),
    fixturesDir: path.join(root, "tests/fixtures/learned"),
    dryRun: options.dryRun,
  });

  console.log(JSON.stringify({ source: options.input, dryRun: options.dryRun, ...result }, null, 2));
}

main().catch((error) => {
  console.error(`Advisory-Lernen fehlgeschlagen: ${error.message}`);
  process.exitCode = 1;
});
