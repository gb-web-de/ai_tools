#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const suiteRoot = path.resolve(__dirname, '..');

const targetProject = process.argv[2];

if (!targetProject) {
  console.log(`
Usage:
  node scripts/setup-project.js <path-to-typo3-project>

Description:
  Injects TYPO3 AI rules and MCP server configuration into any target TYPO3 project.
  Compatible with: Cursor, Claude Code / Desktop, Windsurf, GitHub Copilot, Continue.dev.
  `);
  process.exit(1);
}

const targetPath = path.resolve(targetProject);
if (!fs.existsSync(targetPath)) {
  console.error(`❌ Target directory does not exist: ${targetPath}`);
  process.exit(1);
}

console.log(`🚀 Injecting TYPO3 AI Suite configurations into: ${targetPath}`);

// Files to copy
const filesToCopy = [
  'AGENTS.md',
  'CLAUDE.md',
  '.cursorrules',
  '.windsurfrules'
];

for (const file of filesToCopy) {
  const src = path.join(suiteRoot, file);
  const dest = path.join(targetPath, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`  ✅ Installed ${file}`);
  }
}

// Nested files
const nested = [
  { src: '.cursor/rules/typo3-rules.mdc', dest: '.cursor/rules/typo3-rules.mdc' },
  { src: '.github/copilot-instructions.md', dest: '.github/copilot-instructions.md' }
];

for (const item of nested) {
  const src = path.join(suiteRoot, item.src);
  const dest = path.join(targetPath, item.dest);
  if (fs.existsSync(src)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log(`  ✅ Installed ${item.dest}`);
  }
}

// Setup MCP server in target project (.cursor/mcp.json and .vscode/mcp.json)
const mcpBinary = path.join(suiteRoot, 'typo3-mcp-server', 'build', 'index.js');
const mcpConfig = {
  mcpServers: {
    "typo3-security": {
      command: "node",
      args: [mcpBinary]
    }
  }
};

const cursorMcp = path.join(targetPath, '.cursor', 'mcp.json');
fs.mkdirSync(path.dirname(cursorMcp), { recursive: true });
fs.writeFileSync(cursorMcp, JSON.stringify(mcpConfig, null, 2), 'utf8');
console.log('  ✅ Configured .cursor/mcp.json');

const vscodeMcp = path.join(targetPath, '.vscode', 'mcp.json');
fs.mkdirSync(path.dirname(vscodeMcp), { recursive: true });
fs.writeFileSync(vscodeMcp, JSON.stringify(mcpConfig, null, 2), 'utf8');
console.log('  ✅ Configured .vscode/mcp.json');

console.log('\n🎉 Successfully equipped target TYPO3 project with AI Rules & Security MCP!');
