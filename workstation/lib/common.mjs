// Gemeinsame Helfer für die Claude-Code-Hooks in workstation/hooks.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const WORKSTATION = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const AI_TOOLS = path.resolve(WORKSTATION, '..');
export const HOME = os.homedir();
export const STATE_DIR = path.join(process.env.XDG_STATE_HOME || path.join(HOME, '.local', 'state'), 'ai-tools');

const DEFAULT_CONFIG = {
  mcp: { mode: 'suggest', maxHints: 3 },
  shield: { mode: 'block', allowPaths: [] },
};

export function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// Persönliche Einstellungen liegen außerhalb des Repos: ~/.config/ai-tools/workstation.json
export function loadConfig() {
  const file = path.join(process.env.XDG_CONFIG_HOME || path.join(HOME, '.config'), 'ai-tools', 'workstation.json');
  const user = readJson(file, {});
  const config = {
    mcp: { ...DEFAULT_CONFIG.mcp, ...(user.mcp || {}) },
    shield: { ...DEFAULT_CONFIG.shield, ...(user.shield || {}) },
  };
  if (process.env.AI_TOOLS_MCP_MODE) config.mcp.mode = process.env.AI_TOOLS_MCP_MODE;
  if (process.env.AI_TOOLS_SHIELD) config.shield.mode = process.env.AI_TOOLS_SHIELD;
  return config;
}

export function expand(value) {
  return value.replaceAll('{AI_TOOLS}', AI_TOOLS).replace(/^~(?=\/|$)/, HOME);
}

export function emit(obj) {
  process.stdout.write(JSON.stringify(obj));
}
