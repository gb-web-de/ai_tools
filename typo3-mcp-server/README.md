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
