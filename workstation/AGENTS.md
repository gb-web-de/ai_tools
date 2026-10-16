# Persönliche Regeln (ai_tools/workstation)

- Zugangsdaten bleiben draußen: Inhalte von `.env`, SSH-Schlüsseln, Token- und Login-Dateien nie lesen, ausgeben, wiederholen oder in Dateien schreiben. Ob ein Schlüssel gesetzt ist, nur ohne Ausgabe des Werts prüfen (z. B. `grep -c '^NAME=' .env`). Werte trägt der Nutzer selbst ein.
- Enthält eine Nachricht des Nutzers ein Passwort, einen Key, eine IBAN oder Kartennummer, den Wert nicht wiederholen und darauf hinweisen.
- Keine API-Keys oder zusätzlichen Bezahlwege einrichten; Cloud-Modelle nur über die offiziellen CLIs mit den eigenen Abos.
- Passende MCP-Server stehen in `~/.claude/ai_tools/mcp-catalog.json`. Fehlt einer, den Befehl `~/.claude/ai_tools/install.sh --mcp <name>` vorschlagen und erst nach Zustimmung ausführen.
