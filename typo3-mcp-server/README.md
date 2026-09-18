# TYPO3 Security MCP Server

Ein vollständiger Model Context Protocol (MCP) Server zur Prüfung und Härtung von TYPO3-Instanzen und Extensions.

## Integration in Claude Desktop / MCP Clients

Füge folgendes in deine `claude_desktop_config.json` ein:

```json
{
  "mcpServers": {
    "typo3-security": {
      "command": "node",
      "args": ["/pfad/zu/typo3-mcp-server/build/index.js"]
    }
  }
}
```

## Tools

1. `audit_typo3_instance`: Prüft `settings.php`, Webroot-Exposures und führt `composer audit` aus.
2. `analyze_typo3_extension`: Durchsucht Extension-Code nach SQLi, XSS, `@ignorevalidation` & Unserialize-Lücken.
3. `sync_security_advisories`: Liest den offiziellen TYPO3 Security RSS-Feed aus.
4. `check_fluid_templates`: Identifiziert Unsanitized Outputs in Fluid Templates.
5. `record_developer_fix`: Persistiert einen geprüften Unified Diff dedupliziert in `fixes_history.jsonl`.
6. `query_security_knowledge`: Durchsucht Advisories, gelernte Muster und Entwickler-Fixes gemeinsam.
7. `review_developer_fix`: Hält ein tatsächliches menschliches Review als `APPROVED` oder `REJECTED` mit `reviewed_by` fest.

Die Wissenssuche liefert begriffsbasierte DE/EN-Treffer, Scores und verwandte Einträge. `limit` ist optional (1–50, Standard 10). Neue Entwickler-Fixes bleiben ohne explizites Review `PENDING`. Der Speicherpfad kann mit `TYPO3_KNOWLEDGE_PATH` gesetzt werden.

Details zur Regelerzeugung und zum PR-Bot: [Continuous Learning](../docs/en/CONTINUOUS_LEARNING.md) ([Deutsch](../docs/de/CONTINUOUS_LEARNING.md)).
