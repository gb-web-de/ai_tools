import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import test from 'node:test';
import { exportKnowledge, importKnowledge } from '../scripts/lib/knowledge-exchange.js';
import { recordDeveloperFix, reviewDeveloperFix } from '../scripts/lib/knowledge-store.js';

const require = createRequire(new URL('../typo3-mcp-server/package.json', import.meta.url));
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

test('MCP records, queries and reviews feedback with runtime validation', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'typo3-mcp-learning-'));
  const client = new Client({ name: 'learning-integration', version: '1.0.0' });
  t.after(async () => { await client.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  await client.connect(new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL('../typo3-mcp-server/build/index.js', import.meta.url))],
    env: { ...process.env, TYPO3_KNOWLEDGE_PATH: directory }, stderr: 'pipe',
  }));
  const tools = await client.listTools();
  assert.ok(tools.tools.some((tool) => tool.name === 'review_developer_fix'));
  const args = { title: 'Native deserialization', domain: 'Core', finding_type: 'DESERIALIZATION',
    explanation: 'Restrict object creation.', diff: "--- a/File.php\n+++ b/File.php\n@@ -4 +4 @@\n-$a = \\unserialize($b);\n+$a = \\unserialize($b, ['allowed_classes' => false]);" };
  const call = async (name, arguments_) => client.callTool({ name, arguments: arguments_ });
  const saved = JSON.parse((await call('record_developer_fix', args)).content[0].text);
  assert.equal(saved.status, 'SUCCESS');
  assert.equal(JSON.parse((await call('record_developer_fix', args)).content[0].text).status, 'DUPLICATE');
  const query = JSON.parse((await call('query_security_knowledge', { query: 'Deserialisierung' })).content[0].text);
  assert.equal(query.totalMatched, 1);
  assert.equal(query.results[0].data.review_status, 'PENDING');
  assert.equal((await call('query_security_knowledge', { limit: -1 })).isError, true);
  assert.equal((await call('record_developer_fix', {})).isError, true);
  const reviewed = await call('review_developer_fix', { fix_id: saved.developer_fix.fix_id, review_status: 'APPROVED', reviewed_by: 'test reviewer' });
  assert.equal(JSON.parse(reviewed.content[0].text).developer_fix.review_status, 'APPROVED');
});

test('MCP search in a second project finds imported knowledge with its provenance', async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'typo3-mcp-exchange-'));
  const projectA = path.join(base, 'a');
  const projectB = path.join(base, 'b');
  const client = new Client({ name: 'exchange-integration', version: '1.0.0' });
  t.after(async () => { await client.close(); fs.rmSync(base, { recursive: true, force: true }); });

  const { developer_fix: fix } = recordDeveloperFix(projectA, {
    title: 'Harden payload decoding', domain: 'Core', finding_type: 'DESERIALIZATION',
    explanation: 'Restrict object creation in the session payload decoder.', source: 'TICKET-4711',
    diff: "--- a/Decoder.php\n+++ b/Decoder.php\n@@ -4 +4 @@\n-$a = \\unserialize($b);\n+$a = \\unserialize($b, ['allowed_classes' => false]);",
  });
  reviewDeveloperFix(projectA, { fix_id: fix.fix_id, review_status: 'APPROVED', reviewed_by: 'reviewer-a' });
  importKnowledge(projectB, exportKnowledge(projectA, { label: 'project-a' }).bundle);

  // The MCP server resolves the store the same way the CLIs do, so project B's
  // agents search the imported knowledge through the tool they already use.
  await client.connect(new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL('../typo3-mcp-server/build/index.js', import.meta.url))],
    env: { ...process.env, TYPO3_KNOWLEDGE_PATH: projectB }, stderr: 'pipe',
  }));

  const query = JSON.parse((await client.callTool({ name: 'query_security_knowledge', arguments: { query: 'Deserialisierung' } })).content[0].text);
  assert.equal(query.totalMatched, 1);
  const [found] = query.developer_fixes;
  assert.equal(found.fingerprint, fix.fingerprint);
  assert.equal(found.imported.from, 'project-a');
  assert.equal(found.imported.origin_review.status, 'APPROVED');
  // The approval from project A is provenance, not a local release.
  assert.equal(found.review_status, 'PENDING');
});

test('MCP scans JavaScript and TypoScript of an extension', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'typo3-mcp-assets-'));
  const client = new Client({ name: 'asset-scan-integration', version: '1.0.0' });
  t.after(async () => { await client.close(); fs.rmSync(directory, { recursive: true, force: true }); });

  fs.mkdirSync(path.join(directory, 'Resources/Public/JavaScript'), { recursive: true });
  fs.mkdirSync(path.join(directory, 'Configuration/TypoScript'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'Resources/Public/JavaScript/module.js'),
    "const box = document.querySelector('.box');\nbox.innerHTML = window.name;\n");
  fs.writeFileSync(path.join(directory, 'Configuration/TypoScript/setup.typoscript'),
    'lib.term = TEXT\nlib.term.data = GP:q\n');

  await client.connect(new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL('../typo3-mcp-server/build/index.js', import.meta.url))],
    env: { ...process.env, TYPO3_KNOWLEDGE_PATH: directory }, stderr: 'pipe',
  }));

  const tools = await client.listTools();
  assert.ok(tools.tools.some((tool) => tool.name === 'scan_frontend_assets'));

  const result = JSON.parse((await client.callTool({ name: 'scan_frontend_assets', arguments: { targetPath: directory } })).content[0].text);
  assert.equal(result.total, 2);
  assert.equal(result.javascript.files[0].findings[0].identifier, 'typo3Security.js.domXss');
  assert.equal(result.typoscript.files[0].findings[0].identifier, 'typo3Security.ts.unescapedUserInput');

  // Restricting to one language must not silently scan the other anyway.
  const jsOnly = JSON.parse((await client.callTool({ name: 'scan_frontend_assets', arguments: { targetPath: directory, only: 'javascript' } })).content[0].text);
  assert.equal(jsOnly.typoscript, null);
  assert.equal(jsOnly.total, 1);

  assert.equal((await client.callTool({ name: 'scan_frontend_assets', arguments: { targetPath: path.join(directory, 'nope') } })).isError, true);
});
