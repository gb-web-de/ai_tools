# TYPO3 Security MCP Server & Security Automation Framework

Willkommen beim **TYPO3 Security MCP Server** — einer fertigen Model Context Protocol (MCP) Schnittstelle, mit der KI-Agenten (wie Claude, Cursor, Windsurf etc.) TYPO3-Instanzen und -Extensions automatisiert auf Sicherheitslücken auditieren und abfragen können.

---

## 📖 Inhaltsverzeichnis
1. [Übersicht & Architektur](#übersicht--architektur)
2. [Enthaltene Security-Methoden & Tools](#enthaltene-security-methoden--tools)
3. [Prüf-Kriterien & Sicherheits-Muster](#prüf-kriterien--sicherheits-muster)
4. [Installation & Build](#installation--build)
5. [Einbindung in MCP Clients (Claude / Cursor)](#einbindung-in-mcp-clients)
6. [Selbstlern-Mechanismus (Continuous Security Sync)](#selbstlern-mechanismus)

---

## 1. Übersicht & Architektur

Der MCP Server fungiert als Brücke zwischen einem Large Language Model (LLM) und Ihren TYPO3-Projekten. Er stellt strukturierte Tools zur Verfügung, um Quellcode, System-Konfigurationen, Composer-Pakete und offizielle TYPO3 Security Advisories zu analysieren.

```
┌─────────────────────────────────┐
│        AI Agent / LLM           │
└────────────────┬────────────────┘
                 │ (Model Context Protocol / stdio)
┌────────────────▼─────────────────────────────────────────────────┐
│                   TYPO3 Security MCP Server                      │
├──────────────────┬──────────────────┬────────────────────────────┤
│ 1. Instance Audit│ 2. Extension Code│ 3. Security Advisories Sync│
│    (Config/Vars) │    (AST/Patterns)│    (TYPO3 RSS Feed)        │
└──────────────────┴──────────────────┴────────────────────────────┘
```

---

## 2. Enthaltene Security-Methoden & Tools

Der MCP Server stellt folgende 4 Kern-Werkzeuge bereit:

| Tool Name | Beschreibung | Input Parameter |
| :--- | :--- | :--- |
| `audit_typo3_instance` | Prüft `settings.php` / `LocalConfiguration.php`, Exponierung sensibler Dateien im Webroot (`.env`, `composer.lock`) und führt `composer audit` aus. | `projectRoot`: Absoluter Pfad zum Projektroot |
| `analyze_typo3_extension` | Scannt PHP- und HTML-Dateien einer Extension auf SQL Injections, `@ignorevalidation` Missbrauch, `unserialize()`, und File Upload Risiken. | `extensionPath`: Pfad zum Extension-Ordner |
| `sync_security_advisories` | Liest den offiziellen TYPO3 Security RSS-Feed (`news.typo3.com/security/rss-security`) aus. | `limit`: Anzahl (Standard: 10) |
| `check_fluid_templates` | Untersucht Fluid-Templates gezielt auf unbereinigte Ausgaben via `f:format.raw()` und HTML Parsing Schwachstellen. | `templatesPath`: Pfad zum Template-Ordner |

---

## 3. Prüf-Kriterien & Sicherheits-Muster

### A. SQL Injection (SQLi)
* **Risiko:** Variablen im SQL-String ohne Parameter-Binding (`->statement()`, `->where()`).
* **Empfehlung:** Nutzung von `$queryBuilder->createNamedParameter($val)`.

### B. Broken Access Control (BAC)
* **Risiko:** Verwendung von `@ignorevalidation` an verändernden Extbase Controller Actions (`updateAction`, `deleteAction`).
* **Empfehlung:** Manuelle Autorisierung & Ownership-Checks in der Methodensignatur.

### C. Cross-Site Scripting (XSS)
* **Risiko:** Nutzung von `{variable -> f:format.raw()}` in Fluid-Templates bei User-Inputs.
* **Empfehlung:** Standard-Escaping beibehalten oder Nutzung von HTMLPurifier.

### D. Insecure Deserialization
* **Risiko:** `unserialize($data)` ohne Beschränkung von `allowed_classes`.
* **Empfehlung:** Umstieg auf `json_encode()` / `json_decode()` oder `allowed_classes => false`.

---

## 4. Installation & Build

### Voraussetzungen
* Node.js v18+ 
* npm oder yarn
* TYPO3 v10, v11, v12 oder v13 Projektumgebung

### Schritte

```bash
# 1. Verzeichnis betreten
cd typo3-mcp-server

# 2. Abhängigkeiten installieren
npm install

# 3. TypeScript kompilieren
npm run build
```

Nach dem Build befindet sich die ausführbare Datei unter `build/index.js`.

---

## 5. Einbindung in MCP Clients

### Claude Desktop Integration
Trage den Server in deine `claude_desktop_config.json` ein:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "typo3-security": {
      "command": "node",
      "args": [
        "/ABSOLUTER/PFAD/ZU/typo3-mcp-server/build/index.js"
      ]
    }
  }
}
```

---

## 6. Selbstlern-Mechanismus

Sobald neue TYPO3 Security Advisories (TYPO3-PSA / TYPO3-EXT-SA) veröffentlicht werden, nutzt der Agent das Tool `sync_security_advisories`, liest die neuesten Bedrohungsmuster aus und kann darauf aufbauend neue Prüfregeln im MCP Server erweitern.
