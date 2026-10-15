#!/usr/bin/env bash
# Richtet die ai_tools-Arbeitsumgebung für Claude Code ein (Linux und macOS).
# Gilt für Terminal, PhpStorm (Claude-Code-Plugin) und jede andere Oberfläche, die die claude-CLI startet.
#
#   ./workstation/install.sh                  Hooks (MCP-Erkennung + Datenschutzschild) einrichten
#   ./workstation/install.sh --extras         zusätzlich alle Extras (Skills/Plugins) installieren
#   ./workstation/install.sh --extra ponytail nur ein Extra installieren
#   ./workstation/install.sh --mcp playwright einen MCP-Server aus dem Katalog eintragen
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

install_mcp() {
  local name="$1" entry
  entry="$(catalog servers "$name")" || die "MCP-Server '$name' steht nicht im Katalog."
  node --input-type=module -e "
    import { spawnSync } from 'node:child_process';
    import { expand } from '$HERE/lib/common.mjs';
    const e = $entry;
    if (e.manual) { console.log(e.manual); process.exit(0); }
    const args = e.addRaw ? e.add.map(expand) : ['$name', '--', ...e.add.map(expand)];
    const r = spawnSync('claude', ['mcp', 'add', '-s', 'user', ...args], { stdio: 'inherit' });
    process.exit(r.status ?? 1);"
}

need node nodejs
need git
command -v claude >/dev/null 2>&1 || die "claude fehlt. Installieren: curl -fsSL https://claude.ai/install.sh | bash"

case "${1:-}" in
  --uninstall)
    node "$HERE/lib/merge-settings.mjs" "$HOOKS" --remove
    [[ -L "$LINK" ]] && rm "$LINK"
    exit 0 ;;
  --extra) install_extra "${2:?Name fehlt}"; exit 0 ;;
  --mcp) install_mcp "${2:?Name fehlt}"; exit 0 ;;
esac

mkdir -p "$HOME/.claude"
if [[ -e "$LINK" && ! -L "$LINK" ]]; then die "$LINK existiert und ist kein Link. Bitte prüfen."; fi
ln -sfn "$HERE" "$LINK"
say "Verknüpft: $LINK → $HERE"

node "$HERE/lib/merge-settings.mjs" "$HOOKS"

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

say "Fertig. Neue Claude-Code-Sitzungen (Terminal und PhpStorm) laden die Hooks; laufende Sitzungen neu starten."
