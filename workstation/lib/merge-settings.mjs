#!/usr/bin/env node
// Trägt die ai_tools-Hooks idempotent in die Hook-Datei eines Agenten ein und lässt alles andere unverändert.
// Aufruf: node merge-settings.mjs <hooks-verzeichnis> <claude|codex|copilot> [--remove]
import fs from 'node:fs';
import path from 'node:path';
import { HOME, readJson } from './common.mjs';

const [hooksDir, agent = 'claude'] = process.argv.slice(2);
const remove = process.argv.includes('--remove');
const MARK = 'ai_tools/hooks/';
const run = (script, args = '') => `node "${hooksDir}/${script}"${args}`;

const FILES = {
  claude: path.join(HOME, '.claude', 'settings.json'),
  codex: path.join(HOME, '.codex', 'hooks.json'),
  copilot: path.join(process.env.COPILOT_HOME || path.join(HOME, '.copilot'), 'hooks', 'ai_tools.json'),
};
const file = FILES[agent];
if (!file) throw new Error(`Unbekannter Agent: ${agent}`);

function claudeStyle(matcher, detectArgs) {
  return {
    UserPromptSubmit: [
      { hooks: [{ type: 'command', command: run('privacy-shield.mjs'), timeout: 10 }] },
      { hooks: [{ type: 'command', command: run('mcp-detect.mjs', detectArgs), timeout: 45 }] },
    ],
    PreToolUse: [{ matcher, hooks: [{ type: 'command', command: run('privacy-shield.mjs'), timeout: 10 }] }],
  };
}

if (agent === 'copilot') {
  // Eigene Datei, gehört ganz uns. PascalCase-Events liefern dieselben snake_case-Felder wie Claude.
  // Copilot verwirft die Ausgabe von UserPromptSubmit, deshalb wirkt dort nur der Werkzeug-Schild.
  if (remove) fs.rmSync(file, { force: true });
  else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ version: 1, hooks: { PreToolUse: [{ type: 'command', bash: run('privacy-shield.mjs'), timeoutSec: 10 }] } }, null, 2) + '\n');
  }
  console.log(remove ? 'Copilot-Hooks entfernt.' : `Hooks eingetragen in ${file}`);
  process.exit(0);
}

const wanted = agent === 'codex'
  ? claudeStyle('Bash|apply_patch', ' --agent codex')
  : claudeStyle('Read|Grep|Glob|NotebookRead|Edit|Write|MultiEdit|NotebookEdit|Bash', '');

const settings = readJson(file, {});
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
console.log(remove ? `Hooks entfernt aus ${file}` : `Hooks eingetragen in ${file}`);
