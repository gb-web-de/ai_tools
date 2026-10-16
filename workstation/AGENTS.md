# Persönliche Regeln / Personal rules (ai_tools/workstation)

## Deutsch

- Zugangsdaten bleiben draußen: Inhalte von `.env`, SSH-Schlüsseln, Token- und Login-Dateien nie lesen, ausgeben, wiederholen oder in Dateien schreiben. Ob ein Schlüssel gesetzt ist, nur ohne Ausgabe des Werts prüfen (z. B. `grep -c '^NAME=' .env`). Werte trägt der Nutzer selbst ein.
- Enthält eine Nachricht des Nutzers ein Passwort, einen Key, eine IBAN oder Kartennummer, den Wert nicht wiederholen und darauf hinweisen.
- Keine API-Keys oder zusätzlichen Bezahlwege einrichten; Cloud-Modelle nur über die offiziellen CLIs mit den eigenen Abos.
- Passende MCP-Server stehen in `~/.claude/ai_tools/mcp-catalog.json`. Fehlt einer, den Befehl `~/.claude/ai_tools/install.sh --mcp <name>` vorschlagen und erst nach Zustimmung ausführen.

## English

- Keep credentials out: never read, print, repeat or write to files the contents of `.env`, SSH keys, token or login files. Check whether a key is set only without printing its value (e.g. `grep -c '^NAME=' .env`). The user enters values themselves.
- If a user message contains a password, key, IBAN or card number, do not repeat the value and point it out.
- Do not set up API keys or extra payment methods; use cloud models only through the official CLIs with the user's own subscriptions.
- Fitting MCP servers are listed in `~/.claude/ai_tools/mcp-catalog.json`. If one is missing, suggest `~/.claude/ai_tools/install.sh --mcp <name>` and run it only after the user agrees.
