// MCP-Server aus dem Katalog bei Claude Code, Codex und Copilot CLI eintragen und erkennen.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { HOME, readJson, expand } from './common.mjs';

export const AGENTS = ['claude', 'codex', 'copilot', 'antigravity'];
const CODEX_TOML = path.join(HOME, '.codex', 'config.toml');
const AGY_JSON = path.join(HOME, '.gemini', 'config', 'mcp_config.json');
const COPILOT_JSON = path.join(process.env.COPILOT_HOME || path.join(HOME, '.copilot'), 'mcp-config.json');

const tomlString = (s) => JSON.stringify(s); // JSON-Strings sind gültige TOML-Basic-Strings

export function configured(agent, cwd) {
  const names = new Set();
  const add = (obj) => Object.keys(obj?.mcpServers || {}).forEach((n) => names.add(n));
  if (agent === 'codex') {
    const toml = fs.existsSync(CODEX_TOML) ? fs.readFileSync(CODEX_TOML, 'utf8') : '';
    for (const m of toml.matchAll(/^\s*\[mcp_servers\.("?)([\w-]+)\1\]/gm)) names.add(m[2]);
  } else if (agent === 'copilot' || agent === 'antigravity') {
    add(readJson(agent === 'copilot' ? COPILOT_JSON : AGY_JSON, {}));
  } else {
    const claudeJson = readJson(path.join(HOME, '.claude.json'), {});
    add(claudeJson);
    for (const [dir, proj] of Object.entries(claudeJson.projects || {})) {
      if (cwd === dir || cwd.startsWith(dir + path.sep)) add(proj);
    }
    for (let dir = cwd; ; dir = path.dirname(dir)) {
      add(readJson(path.join(dir, '.mcp.json'), {}));
      if (dir === path.dirname(dir)) break;
    }
  }
  return names;
}

// Befehl, den der Nutzer selbst ausführen kann.
export function addCommand(agent, name) {
  return `~/.claude/ai_tools/install.sh --mcp ${name}${agent === 'claude' ? '' : ` --agent ${agent}`}`;
}

export function addServer(agent, name, entry) {
  const cmd = (entry.add || []).map(expand);
  if (agent === 'claude') {
    const args = entry.url ? ['--transport', 'http', name, entry.url] : [name, '--', ...cmd];
    return spawnSync('claude', ['mcp', 'add', '-s', 'user', ...args], { encoding: 'utf8', timeout: 30_000 }).status === 0;
  }
  if (configured(agent, HOME).has(name)) return true;
  if (agent === 'codex') {
    const body = entry.url
      ? `url = ${tomlString(entry.url)}`
      : `command = ${tomlString(cmd[0])}\nargs = [${cmd.slice(1).map(tomlString).join(', ')}]`;
    fs.mkdirSync(path.dirname(CODEX_TOML), { recursive: true });
    fs.appendFileSync(CODEX_TOML, `\n[mcp_servers.${name}]\n${body}\n`);
    return true;
  }
  if (agent === 'copilot' || agent === 'antigravity') {
    const file = agent === 'copilot' ? COPILOT_JSON : AGY_JSON;
    const conf = readJson(file, {});
    conf.mcpServers ||= {};
    if (agent === 'copilot') {
      conf.mcpServers[name] = entry.url
        ? { type: 'http', url: entry.url, tools: ['*'] }
        : { type: 'local', command: cmd[0], args: cmd.slice(1), env: {}, tools: ['*'] };
    } else {
      conf.mcpServers[name] = entry.url ? { serverUrl: entry.url } : { command: cmd[0], args: cmd.slice(1) };
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(conf, null, 2) + '\n');
    return true;
  }
  return false;
}
