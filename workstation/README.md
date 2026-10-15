# Arbeitsplatz-Setup für Claude Code

Ein Ort für Hooks, MCP-Katalog und Skills, der auf jedem Rechner gleich eingerichtet wird. Alles läuft lokal; es werden keine API-Keys gebraucht und keine Abo-Tokens über Dritte geleitet.

```bash
git clone git@github.com:gb-web-de/ai_tools.git ~/Projekte/ai_tools   # oder: git pull
~/Projekte/ai_tools/workstation/install.sh            # Hooks
~/Projekte/ai_tools/workstation/install.sh --extras   # plus Skills/Plugins
```

Linux und macOS gleich. Auf dem Mac braucht es `node` und `git` (`brew install node git`) und die `claude`-CLI.

## Was eingerichtet wird

| Teil | Wirkung |
| --- | --- |
| `hooks/mcp-detect.mjs` (UserPromptSubmit) | Erkennt am Prompt passende MCP-Server und Skills aus `mcp-catalog.json`. Eingerichtete nennt es Claude zur Nutzung, fehlende schlägt es mit dem fertigen `claude mcp add`-Befehl vor. Mit `mcp.mode: "auto"` trägt es lokale Server ohne Zugangsdaten selbst ein (aktiv ab der nächsten Sitzung). |
| `hooks/privacy-shield.mjs` (UserPromptSubmit + PreToolUse) | Datenschutzschild. Prompts mit Passwörtern, API-Keys, Tokens, privaten Schlüsseln, IBAN (Prüfsumme) oder Kartennummern (Luhn) werden nicht gesendet. `.env`, `~/.ssh`, CLI-Logins (`~/.claude/.credentials.json`, `~/.codex/auth.json`, `jarvis/auth/` …) darf Claude nicht lesen; Shell-Befehle und Schreibzugriffe darauf brauchen eine Freigabe. Ein bewusst harmloser Prompt geht mit `#shield-ok` durch. |
| `~/.claude/ai_tools` | Link auf diesen Ordner, damit `settings.json` auf allen Rechnern gleich aussieht. |
| `~/.config/ai-tools/workstation.json` | Persönliche Einstellungen (nicht im Repo): `mcp.mode` = `suggest`/`auto`/`off`, `shield.mode` = `block`/`warn`/`off`, `shield.allowPaths`. |

Einzelne Teile: `install.sh --mcp playwright`, `install.sh --extra ponytail`, Rückbau mit `install.sh --uninstall`.

## Extras

`context-mode` (große Ausgaben aus dem Kontext halten, lokal), `ponytail` (minimaler Code), `agent-skills` (/spec … /ship), `unlazy` (Abnahme mit Nachweis). Bewusst nicht enthalten: OmniRoute, weil es Abo-OAuth-Tokens über einen eigenen Proxy leitet und Claude-Code-Header nachbaut.

## PhpStorm

Das Claude-Code-Plugin für JetBrains startet dieselbe `claude`-CLI. Hooks, MCP-Server und Skills aus `~/.claude` gelten dort also ohne weiteres Zutun. Zusätzlich kann PhpStorm selbst MCP-Server sein: Einstellungen › Tools › MCP Server › Enable, dann bei Claude Code auf Auto-Configure.

## Handy (Android)

Lokale Hooks laufen nur auf den Rechnern. Auf dem Handy wirkt, was am claude.ai-Konto hängt: hochgeladene Skills, Connectors, Projekte, und Remote Control auf eine laufende Sitzung am Rechner. Über Remote Control greifen die Hooks des Rechners auch für Prompts vom Handy.

## Katalog erweitern

Neuer Eintrag in `mcp-catalog.json` unter `servers` (oder `extras`): `keywords` sind Regex-Fragmente, `add` ist der Startbefehl, `local` sagt, ob Daten den Rechner verlassen, `auto` erlaubt das selbstständige Eintragen.
