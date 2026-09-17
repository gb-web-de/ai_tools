# TYPO3 AI & Security Suite

[![TYPO3 v12](https://img.shields.io/badge/TYPO3-v12%20%7C%20v13%20%7C%20v14-orange.svg)](https://typo3.org/)
[![PHP 8.2+](https://img.shields.io/badge/PHP-8.2%20%7C%208.3%20%7C%208.4-blue.svg)](https://php.net/)
[![MCP](https://img.shields.io/badge/MCP-Protocol-purple.svg)](https://modelcontextprotocol.io/)
[![PHPStan Level 6](https://img.shields.io/badge/PHPStan-Level%206-brightgreen.svg)](https://phpstan.org/)

Eine universelle, produktionsreife Entwicklungs- und Sicherheits-Suite für **TYPO3 (v12 / v13 / v14)**.
Sie verbindet **alle modernen KI-Systeme** (Cursor, Claude Code/Desktop, Windsurf, GitHub Copilot, Antigravity) über ein zentrales Regelwerk mit einem **Model Context Protocol (MCP) Server**, tiefgehenden **PHPStan AST-Sicherheitsregeln** und einem **Fluid XSS Auto-Fixer**.

---

## ⚡ 1-Klick Projekt-Setup

Um ein beliebiges TYPO3-Projekt mit allen KI-Regeln und MCP-Anbindungen auszustatten:

```bash
node scripts/setup-project.js /pfad/zu/deinem/typo3-projekt
```

Dieses Skript installiert automatisch:
* **Cursor**: `.cursorrules`, `.cursor/rules/typo3-rules.mdc` und `.cursor/mcp.json`
* **Claude Code / Desktop**: `CLAUDE.md`
* **GitHub Copilot**: `.github/copilot-instructions.md`
* **Windsurf**: `.windsurfrules`
* **VS Code / Continue**: `.vscode/mcp.json`
* **Universal Standard**: `AGENTS.md`

---

## 📁 Architektur

```
ai_tools/
├── ai-rules/                     # 🌟 Single Source of Truth für alle KI-Regeln
│   ├── 01-security.md            # SQLi, XSS, CSRF, Insecure Deserialization, TCA
│   ├── 02-core-apis.md           # DBAL (QueryBuilder), FAL, Context API, Caching
│   ├── 03-extension-arch...md    # TCA, Services.yaml, RequestMiddlewares, Site Sets
│   ├── 04-php-architecture.md    # DI, Constructor Promotion, PSR-14 Events, PSR-15
│   ├── 05-site-configuration.md  # config/sites/, Site Sets (v13+), TypoScript
│   ├── 06-coding-standards.md    # PSR-12/PER, declare(strict_types=1), PHP 8.2+
│   ├── 07-testing.md             # Unit- & Functional-Tests (typo3/testing-framework)
│   └── 08-administration.md      # Symfony Console Commands (#[AsCommand]), CLI
├── scripts/
│   ├── sync-ai-configs.js        # Kompiliert ai-rules/ in alle KI-Zielformate
│   └── setup-project.js          # Exportiert Regeln & MCP in externe TYPO3-Instanzen
├── typo3-mcp-server/             # 🤖 TypeScript MCP-Server (Brücke für LLMs)
│   ├── src/index.ts              # Stellt Tools für Instanz-Audit, PHPStan AST & Fixer bereit
│   └── build/index.js            # Kompilierte ausführbare Node.js-Binärdatei
├── typo3-security-suite/         # 🛡️ Statische Code-Analyse & CI/CD Pipeline
│   ├── rules/                    # Eigene PHPStan AST-Sicherheitsregeln
│   ├── scripts/scan_fluid_xss.py # Python Scanner & Auto-Fixer für Fluid-Templates
│   ├── rector.php                # Rector-Konfiguration für Refactoring & Quality
│   └── .github/workflows/        # Einsatzbereite CI/CD GitHub Action
└── tests/fixtures/               # 🧪 Verwundbare Test-Extension für Verifikationstests
```

---

## 🤖 Model Context Protocol (MCP) Server

Der MCP Server (`typo3-mcp-server`) stellt KI-Agenten folgende Werkzeuge live zur Verfügung:

| MCP Tool | Funktion |
| :--- | :--- |
| `audit_typo3_instance` | Prüft `settings.php` / `LocalConfiguration.php` (`displayErrors`, `devIPmask`, etc.) und Webroot-Exposure (`.env`, `composer.lock`). |
| `analyze_typo3_extension` | Tiefenscan einer Extension: Nutzt die PHPStan AST-Regeln und den Python Fluid-Scanner (mit automatischem Fallback). |
| `run_phpstan_security_audit` | Führt die dedizierten AST-Regeln (SQLi, Broken Access Control, Echo XSS, Data Leaks) auf PHP-Dateien aus. |
| `fix_fluid_xss` | **Auto-Fix**: Repariert `f:format.raw()` und unsicheres Escaping in Fluid-Templates automatisch. |
| `apply_rector_fixes` | Führt Rector-Refactorings zur Code-Modernisierung aus (`--dry-run` oder live). |
| `sync_security_advisories` | Liest die neuesten TYPO3 Security Advisories via RSS-Feed ein. |
| `check_fluid_templates` | Gezielte Untersuchung von Fluid-Templates auf XSS. |

### Integration in Claude Desktop

Füge in deiner `claude_desktop_config.json` hinzu:

```json
{
  "mcpServers": {
    "typo3-security": {
      "command": "node",
      "args": ["/ABSOLUTER/PFAD/ZU/ai_tools/typo3-mcp-server/build/index.js"]
    }
  }
}
```

---

## 🛡️ PHPStan AST-Sicherheitsregeln

Die Suite prüft PHP-Code auf AST-Ebene (`PhpParser\Node`), wodurch False Positives minimiert und echte Sicherheitslücken zuverlässig aufgedeckt werden:

1. **`SqlInjectionQueryBuilderRule`**: Verhindert String-Verkettung (`Concat`) oder Interpolation (`Encapsed`) in QueryBuilder-Methoden (`where`, `andWhere`, `orWhere`, `statement`).
2. **`IgnoreValidationOnMutationRule`**: Blockiert `@ignorevalidation` und `#[IgnoreValidation]` auf datenverändernden Extbase-Aktionen (`updateAction`, `deleteAction`, `createAction`, `saveAction`).
3. **`RawFluidOrEchoXssRule`**: Verhindert direkte `echo`-Befehle in Controllern und ViewHelpern.
4. **`ExtbaseQuerySettingsDataLeakRule`**: Verhindert das unbedachte Deaktivieren von Zugriffsbeschränkungen via `setIgnoreEnableFields(true)` oder `setRespectStoragePage(false)`.

---

## 🚀 Entwicklung & Befehle

```bash
# Alle KI-Konfigurationen aus ai-rules/ synchronisieren
npm run sync-ai

# MCP Server kompilieren
npm run build

# Vollständigen Testlauf starten (Sync + MCP Build + PHPStan-Rules)
npm test

# Fluid Template XSS Scanner testen
npm run test:fluid
```

---

## 📜 Lizenz & Richtlinien

Alle Komponenten folgen strikt den offiziellen [TYPO3 Coding Guidelines](https://docs.typo3.org/m/typo3/reference-coreapi/main/en-us/CodingGuidelines/Index.html) und den PSR-Standards (PSR-12, PSR-14, PSR-15).
Lizenz: GPL-2.0-or-later.
