import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import test from 'node:test';

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
