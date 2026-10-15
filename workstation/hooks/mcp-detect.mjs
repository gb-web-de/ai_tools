#!/usr/bin/env node
// UserPromptSubmit-Hook: erkennt am Prompt, welche MCP-Server und Skills passen,
// sagt Claude, welche schon da sind, und schlägt fehlende vor (mcp.mode=suggest)
// oder trägt lokale, schlüssellose Server selbst ein (mcp.mode=auto).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { WORKSTATION, HOME, STATE_DIR, readStdinJson, readJson, loadConfig, expand, emit } from '../lib/common.mjs';

const input = readStdinJson();
const prompt = String(input.prompt || '');
const cwd = input.cwd || process.cwd();
const config = loadConfig();
if (config.mcp.mode === 'off' || prompt.trim().length < 3 || prompt.trim().startsWith('/')) process.exit(0);

const catalog = readJson(path.join(WORKSTATION, 'mcp-catalog.json'), { servers: {}, extras: {} });

function score(text, keywords) {
  let hits = 0;
  for (const kw of keywords) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${kw})(?![\\p{L}\\p{N}])`, 'iu');
    if (re.test(text)) hits++;
  }
  return hits;
}

function configuredServers() {
  const names = new Set();
  const add = (obj) => Object.keys(obj?.mcpServers || {}).forEach((n) => names.add(n));
  const claudeJson = readJson(path.join(HOME, '.claude.json'), {});
  add(claudeJson);
  for (const [dir, proj] of Object.entries(claudeJson.projects || {})) {
    if (cwd === dir || cwd.startsWith(dir + path.sep)) add(proj);
  }
  for (let dir = cwd; ; dir = path.dirname(dir)) {
    add(readJson(path.join(dir, '.mcp.json'), {}));
    if (dir === path.dirname(dir)) break;
  }
  return names;
}

function enabledPlugins() {
  const settings = readJson(path.join(HOME, '.claude', 'settings.json'), {});
  return new Set(Object.entries(settings.enabledPlugins || {}).filter(([, on]) => on).map(([id]) => id));
}

function stateFile() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const cutoff = Date.now() - 2 * 86400_000;
  for (const f of fs.readdirSync(STATE_DIR)) {
    const p = path.join(STATE_DIR, f);
    if (f.startsWith('mcp-hints-') && fs.statSync(p).mtimeMs < cutoff) fs.rmSync(p, { force: true });
  }
  const id = String(input.session_id || 'ohne-session').replace(/[^\w-]/g, '');
  return path.join(STATE_DIR, `mcp-hints-${id}.json`);
}

function addServer(name, entry) {
  const args = entry.addRaw
    ? ['mcp', 'add', '-s', 'user', ...entry.add.map(expand)]
    : ['mcp', 'add', '-s', 'user', name, '--', ...entry.add.map(expand)];
  const res = spawnSync('claude', args, { encoding: 'utf8', timeout: 30_000 });
  return res.status === 0;
}

function addCommand(name, entry) {
  const parts = entry.addRaw ? entry.add.map(expand) : [name, '--', ...entry.add.map(expand)];
  return `claude mcp add -s user ${parts.join(' ')}`;
}

const servers = configuredServers();
const plugins = enabledPlugins();
const file = stateFile();
const hinted = new Set(readJson(file, []));

const matches = [];
for (const [name, entry] of Object.entries(catalog.servers || {})) {
  const s = score(prompt, entry.keywords || []);
  if (s) matches.push({ name, entry, s, kind: 'mcp' });
}
for (const [name, entry] of Object.entries(catalog.extras || {})) {
  const s = score(prompt, entry.keywords || []);
  if (s) matches.push({ name, entry, s, kind: 'extra' });
}
matches.sort((a, b) => b.s - a.s);

const ready = [];
const missing = [];
const added = [];
for (const m of matches.slice(0, config.mcp.maxHints)) {
  const { name, entry, kind } = m;
  const present = kind === 'mcp'
    ? servers.has(name) || (entry.plugin && plugins.has(entry.plugin))
    : (entry.plugin && plugins.has(entry.plugin)) || (entry.skill && fs.existsSync(path.join(HOME, '.claude', 'skills', entry.skill)));
  if (present) {
    ready.push(`${name} (${entry.description})`);
    continue;
  }
  if (hinted.has(name)) continue;
  hinted.add(name);
  if (kind === 'mcp' && entry.requires && !fs.existsSync(expand(entry.requires))) continue;
  if (kind === 'mcp' && config.mcp.mode === 'auto' && entry.auto && entry.local && entry.add && addServer(name, entry)) {
    added.push(name);
    continue;
  }
  let how;
  if (kind === 'extra') how = `./workstation/install.sh --extra ${name} (in ai_tools)`;
  else if (entry.manual) how = entry.manual;
  else how = addCommand(name, entry);
  missing.push(`${name}: ${entry.description}${entry.local ? '' : ' [verlässt den Rechner]'}. Einrichten: \`${how}\``);
}
fs.writeFileSync(file, JSON.stringify([...hinted]));

if (!ready.length && !missing.length && !added.length) process.exit(0);

const lines = ['[ai_tools MCP-Erkennung]'];
if (ready.length) lines.push(`Passend und eingerichtet, bevorzugt nutzen: ${ready.join('; ')}.`);
if (added.length) lines.push(`Gerade eingetragen (user scope, ab der nächsten Sitzung aktiv): ${added.join(', ')}. Sag das dem Nutzer in einem Satz.`);
if (missing.length) {
  lines.push('Passend, aber nicht eingerichtet. Schlage es dem Nutzer in einem Satz vor und richte es nur nach seinem Ja ein:');
  lines.push(...missing.map((l) => `- ${l}`));
}

const visible = [
  added.length ? `MCP eingetragen: ${added.join(', ')}` : '',
  missing.length ? `MCP-Tipp: ${missing.map((l) => l.split(':')[0]).join(', ')}` : '',
].filter(Boolean).join(' · ');

emit({
  ...(visible ? { systemMessage: visible } : {}),
  hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: lines.join('\n') },
});
