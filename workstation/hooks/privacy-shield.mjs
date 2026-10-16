#!/usr/bin/env node
// Datenschutzschild für Claude Code.
// UserPromptSubmit: hält Prompts mit Zugangsdaten oder Bank-/Kartendaten zurück, bevor sie den Rechner verlassen.
// PreToolUse: verweigert das Lesen von Geheimnis-Dateien (.env, SSH-Schlüssel, CLI-Logins)
// und lässt Shell-Befehle oder Schreibzugriffe darauf nur nach Rückfrage zu.
// shield.mode: block (Standard) | warn | off. Ein Prompt mit "#shield-ok" geht trotzdem durch.
import path from 'node:path';
import { HOME, readStdinJson, loadConfig, expand, emit } from '../lib/common.mjs';

const SECRET_PATTERNS = [
  ['privater Schlüssel', /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/],
  ['Anthropic-Key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['OpenAI-Key', /\bsk-(?!ant-)(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}/],
  ['GitHub-Token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})/],
  ['Google-API-Key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['AWS-Zugangsschlüssel', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['Slack-Token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['Stripe-Key', /\b[rs]k_live_[A-Za-z0-9]{20,}/],
  ['JWT/Bearer-Token', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['Passwort', /\b(?:passwor[dt]|kennwort|pass(?:phrase)?|pwd|secret|client[_-]?secret|api[_-]?key|token)\s*[:=]\s*["']?(?!\*+|x{3,}|<|\{|\$|TOKEN_HIER|BITTE)[^\s"']{6,}/i],
  ['Zugangsdaten in URL', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s@/]{4,}@/i],
];

function ibanValid(raw) {
  const s = raw.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const moved = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const d of moved) rest = (rest * 10 + Number(d)) % 97;
  return rest === 1;
}

function luhnValid(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

function findPrivateData(text) {
  const found = [];
  for (const [label, re] of SECRET_PATTERNS) if (re.test(text)) found.push(label);
  for (const m of text.matchAll(/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g)) {
    if (ibanValid(m[0])) { found.push('IBAN'); break; }
  }
  for (const m of text.matchAll(/\b(?:\d[ -]?){12,18}\d\b/g)) {
    const digits = m[0].replace(/\D/g, '');
    if (/^[3-6]/.test(digits) && luhnValid(digits)) { found.push('Kreditkartennummer'); break; }
  }
  return [...new Set(found)];
}

const SENSITIVE_PATHS = [
  /(?:^|\/)\.env(?:\.(?!example|dist|sample|template|defaults?)[\w-]+)*$/,
  /(?:^|\/)\.ssh(?:\/|$)/,
  /(?:^|\/)id_(?:rsa|dsa|ecdsa|ed25519)(?!\.pub)\b/,
  /\.(?:pem|key|p12|pfx|jks|keystore|kdbx)$/,
  /(?:^|\/)\.gnupg(?:\/|$)/,
  /(?:^|\/)\.aws\/credentials$/,
  /(?:^|\/)\.kube\/config$/,
  /(?:^|\/)\.(?:netrc|git-credentials|pgpass|npmrc|pypirc)$/,
  /(?:^|\/)\.docker\/config\.json$/,
  /(?:^|\/)\.config\/gh\/hosts\.yml$/,
  /(?:^|\/)\.claude\/\.credentials\.json$/,
  /(?:^|\/)\.codex\/auth\.json$/,
  /(?:^|\/)\.gemini\/oauth_creds\.json$/,
  /(?:^|\/)jarvis\/auth\//,
  /(?:^|\/)(?:credentials|secrets?|service-account[\w-]*|client_secret[\w-]*)\.(?:json|ya?ml|toml)$/,
  /(?:^|\/)auth\.json$/,
];

function isSensitivePath(p, allow) {
  if (!p) return false;
  const abs = path.resolve(expand(String(p)));
  if (allow.some((a) => abs === path.resolve(expand(a)) || abs.startsWith(path.resolve(expand(a)) + path.sep))) return false;
  return SENSITIVE_PATHS.some((re) => re.test(abs));
}

// Für Shell-Befehle: jedes Wort einzeln wie einen Pfad prüfen.
function sensitiveInCommand(cmd, allow) {
  const words = String(cmd).split(/[\s;|&<>()'"`=]+/).filter(Boolean);
  return words.find((w) => /[./~]/.test(w) && isSensitivePath(w.replace(/^~(?=\/)/, HOME), allow));
}

const input = readStdinJson();
const { shield } = loadConfig();
if (shield.mode === 'off') process.exit(0);
const allow = shield.allowPaths || [];
const event = input.hook_event_name;

if (event === 'UserPromptSubmit') {
  const prompt = String(input.prompt || '');
  if (prompt.includes('#shield-ok')) process.exit(0);
  const found = findPrivateData(prompt);
  if (!found.length) process.exit(0);
  const why = `Datenschutzschild: Der Prompt enthält vermutlich ${found.join(', ')}. Er wurde nicht gesendet. Entferne die Angabe oder ersetze sie durch einen Platzhalter. Ist es harmlos, hänge #shield-ok an.`;
  if (shield.mode === 'warn') {
    emit({ systemMessage: why.replace('Er wurde nicht gesendet.', 'Gesendet, weil shield.mode=warn.'),
      hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: `Der Prompt enthielt vermutlich ${found.join(', ')}. Wiederhole diese Werte nicht und schreibe sie in keine Datei.` } });
  } else {
    emit({ decision: 'block', reason: why });
  }
  process.exit(0);
}

if (event === 'PreToolUse') {
  const tool = input.tool_name || '';
  const ti = input.tool_input || {};
  const decide = (decision, reason) => emit({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: shield.mode === 'warn' ? 'ask' : decision, permissionDecisionReason: reason },
  });

  // Claude-Namen, dazu Copilot CLI (view/edit/create/bash) und Codex (apply_patch).
  const t = tool.toLowerCase();
  if (['read', 'grep', 'glob', 'notebookread', 'view'].includes(t)) {
    const target = ti.file_path || ti.path || ti.notebook_path || '';
    const pattern = ti.pattern || ti.glob || '';
    if (isSensitivePath(target, allow) || (t === 'glob' && isSensitivePath(pattern, allow))) {
      decide('deny', `Datenschutzschild: ${target || pattern} enthält Zugangsdaten. Inhalt nicht in den Kontext laden; solche Werte trägt der Nutzer selbst ein. Nur prüfen, ob ein Schlüssel gesetzt ist, z. B. mit grep -c '^NAME=' ohne Ausgabe des Werts.`);
    }
  } else if (['edit', 'write', 'multiedit', 'notebookedit', 'create', 'apply_patch'].includes(t)) {
    const patched = [...String(t === 'apply_patch' ? ti.command || '' : '').matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)].map((m) => m[1].trim());
    const target = [ti.file_path || ti.notebook_path || ti.path || '', ...patched].find((p) => isSensitivePath(p, allow));
    if (target) decide('ask', `Datenschutzschild: ${target} ist eine Geheimnis-Datei. Schreiben nur mit deiner Freigabe, und keine Werte für Passwörter oder Tokens.`);
  } else if (['bash', 'shell', 'powershell'].includes(t)) {
    const hit = sensitiveInCommand(ti.command || '', allow);
    if (hit) decide('ask', `Datenschutzschild: Der Befehl berührt ${hit}. Ausführen nur mit deiner Freigabe; der Inhalt landet sonst im Kontext.`);
  }
  process.exit(0);
}
