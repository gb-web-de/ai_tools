#!/usr/bin/env bash
# Richtet die ai_tools-Arbeitsumgebung für Claude Code ein (Linux und macOS).
# Gilt für Claude Code, Codex (CLI, PhpStorm, ChatGPT-App) und GitHub Copilot CLI und Google Antigravity (agy), sofern auf dem Rechner vorhanden.
#
#   ./workstation/install.sh                  Hooks (MCP-Erkennung + Datenschutzschild) einrichten
#   ./workstation/install.sh --extras         zusätzlich alle Extras (Skills/Plugins) installieren
#   ./workstation/install.sh --extra ponytail nur ein Extra installieren
#   ./workstation/install.sh --mcp playwright einen MCP-Server bei allen Agenten eintragen
#   ./workstation/install.sh --mcp playwright --agent codex  nur bei einem (claude|codex|copilot|antigravity)
#   ./workstation/install.sh --uninstall      Hooks wieder austragen
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LINK="$HOME/.claude/ai_tools"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/ai-tools"
HOOKS='$HOME/.claude/ai_tools/hooks'

say() { printf '\033[1;34m»\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

need() {
  command -v "$1" >/dev/null 2>&1 && return
  case "$(uname -s)" in
    Darwin) die "$1 fehlt. Installieren mit: brew install ${2:-$1}" ;;
    *) die "$1 fehlt. Installieren mit: sudo apt install ${2:-$1}" ;;
  esac
}

catalog() { node -e "const c=require('$HERE/mcp-catalog.json');const e=(c.$1||{})['$2'];if(!e)process.exit(3);console.log(JSON.stringify(e))"; }

install_extra() {
  local name="$1" entry
  entry="$(catalog extras "$name")" || die "Extra '$name' steht nicht im Katalog."
  local market plugin repo skill
  market="$(node -e "console.log(($entry).marketplace||'')")"
  plugin="$(node -e "console.log(($entry).plugin||'')")"
  repo="$(node -e "console.log(($entry).skillRepo||'')")"
  skill="$(node -e "console.log(($entry).skill||'')")"
  if [[ -n "$plugin" ]]; then
    say "Plugin $plugin"
    claude plugin marketplace add "$market" >/dev/null 2>&1 || true
    claude plugin install "$plugin" -s user
  elif [[ -n "$skill" ]]; then
    local dest="$HOME/.claude/skills/$skill"
    if [[ -d "$dest/.git" ]]; then
      say "Skill $skill aktualisieren"; git -C "$dest" pull --ff-only --quiet
    else
      say "Skill $skill"; mkdir -p "$HOME/.claude/skills"; git clone --depth 1 --quiet "$repo" "$dest"
    fi
  fi
}

# Agenten, die auf diesem Rechner benutzt werden (Codex auch über PhpStorm/ChatGPT: ~/.codex).
agents() {
  echo claude
  { command -v codex >/dev/null 2>&1 || [[ -d "$HOME/.codex" ]]; } && echo codex
  { command -v copilot >/dev/null 2>&1 || [[ -d "${COPILOT_HOME:-$HOME/.copilot}" ]]; } && echo copilot
  { command -v agy >/dev/null 2>&1 || [[ -d "$HOME/.gemini/config" ]]; } && echo antigravity
  return 0
}

install_mcp() {
  local name="$1" only="${2:-}" entry agent
  entry="$(catalog servers "$name")" || die "MCP-Server '$name' steht nicht im Katalog."
  for agent in ${only:-$(agents)}; do
    node --input-type=module -e "
      import { addServer } from '$HERE/lib/mcp.mjs';
      const e = $entry;
      if (e.manual) { console.log(e.manual); process.exit(0); }
      process.exit(addServer('$agent', '$name', e) ? 0 : 1);" && say "MCP $name → $agent" || say "MCP $name → $agent fehlgeschlagen"
  done
}

link_rules() {
  local dest="$1"
  mkdir -p "$(dirname "$dest")"
  if [[ ! -e "$dest" ]]; then ln -s "$HERE/AGENTS.md" "$dest"; say "Regeln verknüpft: $dest"
  elif [[ "$(readlink "$dest")" != "$HERE/AGENTS.md" ]]; then say "$dest gibt es schon, Regeln aus $HERE/AGENTS.md bitte selbst übernehmen."; fi
}

need node nodejs
need git
command -v claude >/dev/null 2>&1 || die "claude fehlt. Installieren: curl -fsSL https://claude.ai/install.sh | bash"

case "${1:-}" in
  --uninstall)
    for agent in claude codex copilot; do node "$HERE/lib/merge-settings.mjs" "$HOOKS" "$agent" --remove; done
    for f in "$HOME/.codex/AGENTS.md" "${COPILOT_HOME:-$HOME/.copilot}/copilot-instructions.md"; do
      [[ "$(readlink "$f" 2>/dev/null)" == "$HERE/AGENTS.md" ]] && rm "$f"
    done
    [[ -L "$HOME/.gemini/config/plugins/ai-tools" ]] && rm "$HOME/.gemini/config/plugins/ai-tools"
    [[ -L "$LINK" ]] && rm "$LINK"
    exit 0 ;;
  --extra) install_extra "${2:?Name fehlt}"; exit 0 ;;
  --mcp) install_mcp "${2:?Name fehlt}" "$([[ "${3:-}" == --agent ]] && echo "${4:-}")"; exit 0 ;;
esac

mkdir -p "$HOME/.claude"
if [[ -e "$LINK" && ! -L "$LINK" ]]; then die "$LINK existiert und ist kein Link. Bitte prüfen."; fi
ln -sfn "$HERE" "$LINK"
say "Verknüpft: $LINK → $HERE"

for agent in $(agents); do
  [[ "$agent" == antigravity ]] || node "$HERE/lib/merge-settings.mjs" "$HOOKS" "$agent"
done
# Antigravity lädt Hooks und Regeln als Plugin aus ~/.gemini/config/plugins.
if agents | grep -qx antigravity; then
  mkdir -p "$HOME/.gemini/config/plugins"
  ln -sfn "$HERE/antigravity-plugin" "$HOME/.gemini/config/plugins/ai-tools"
  say "Antigravity-Plugin verknüpft: ~/.gemini/config/plugins/ai-tools"
fi
agents | grep -qx codex && link_rules "$HOME/.codex/AGENTS.md"
agents | grep -qx copilot && link_rules "${COPILOT_HOME:-$HOME/.copilot}/copilot-instructions.md"

mkdir -p "$CONFIG_DIR"
if [[ ! -f "$CONFIG_DIR/workstation.json" ]]; then
  cp "$HERE/workstation.example.json" "$CONFIG_DIR/workstation.json"
  say "Einstellungen angelegt: $CONFIG_DIR/workstation.json"
fi

if [[ -f "$HERE/../typo3-mcp-server/package.json" && ! -f "$HERE/../typo3-mcp-server/build/index.js" ]]; then
  say "typo3-mcp-server bauen"
  (cd "$HERE/.." && npm install --silent && npm run build --silent) || say "Build fehlgeschlagen, typo3-security bleibt aus."
fi

if [[ "${1:-}" == "--extras" ]]; then
  for name in $(node -e "console.log(Object.keys(require('$HERE/mcp-catalog.json').extras).join(' '))"); do
    install_extra "$name"
  done
fi

say "Fertig für: $(agents | tr '\n' ' ')"
say "Neue Sitzungen laden die Hooks. Codex fragt beim ersten Start einmal, ob es den Hooks vertraut."
