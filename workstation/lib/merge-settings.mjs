#!/usr/bin/env node
// Trägt die ai_tools-Hooks idempotent in ~/.claude/settings.json ein und lässt alles andere unverändert.
// Aufruf: node merge-settings.mjs <hooks-verzeichnis> [--remove]
import fs from 'node:fs';
import path from 'node:path';
import { HOME, readJson } from './common.mjs';

const hooksDir = process.argv[2];
const remove = process.argv.includes('--remove');
const file = path.join(HOME, '.claude', 'settings.json');
const settings = readJson(file, {});
const MARK = 'ai_tools/hooks/';

const wanted = {
  UserPromptSubmit: [
    { hooks: [{ type: 'command', command: `node "${hooksDir}/privacy-shield.mjs"`, timeout: 10 }] },
    { hooks: [{ type: 'command', command: `node "${hooksDir}/mcp-detect.mjs"`, timeout: 45 }] },
  ],
  PreToolUse: [
    { matcher: 'Read|Grep|Glob|NotebookRead|Edit|Write|MultiEdit|NotebookEdit|Bash', hooks: [{ type: 'command', command: `node "${hooksDir}/privacy-shield.mjs"`, timeout: 10 }] },
  ],
};

settings.hooks ||= {};
for (const event of Object.keys(settings.hooks)) {
  settings.hooks[event] = settings.hooks[event]
    .map((group) => ({ ...group, hooks: (group.hooks || []).filter((h) => !String(h.command || '').includes(MARK)) }))
    .filter((group) => group.hooks.length);
  if (!settings.hooks[event].length) delete settings.hooks[event];
}
if (!remove) {
  for (const [event, groups] of Object.entries(wanted)) settings.hooks[event] = [...(settings.hooks[event] || []), ...groups];
}
if (!Object.keys(settings.hooks).length) delete settings.hooks;

fs.mkdirSync(path.dirname(file), { recursive: true });
if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak-ai_tools`);
fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
console.log(remove ? 'Hooks entfernt.' : `Hooks eingetragen in ${file}`);
