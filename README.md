# TYPO3 AI & Security Suite

[![TYPO3 v12](https://img.shields.io/badge/TYPO3-v12%20%7C%20v13%20%7C%20v14-orange.svg)](https://typo3.org/)
[![PHP 8.2+](https://img.shields.io/badge/PHP-8.2%20%7C%208.3%20%7C%208.4-blue.svg)](https://php.net/)
[![MCP](https://img.shields.io/badge/MCP-Protocol-purple.svg)](https://modelcontextprotocol.io/)
[![PHPStan Level 6](https://img.shields.io/badge/PHPStan-Level%206-brightgreen.svg)](https://phpstan.org/)

Eine universelle, produktionsreife Entwicklungs- und Sicherheits-Suite für **TYPO3 (v12 / v13 / v14)**.
Sie verbindet **alle modernen KI-Systeme** (Cursor, Claude Code/Desktop, Windsurf, GitHub Copilot, Antigravity) über ein zentrales Regelwerk mit einem **Model Context Protocol (MCP) Server**, tiefgehenden **PHPStan AST-Sicherheitsregeln**, einem **Fluid XSS Auto-Fixer** und einer **selbstlernenden Wissensbasis**.

📖 **Ausführliche Dokumentation:** [docs/SELF_LEARNING_ARCHITECTURE.md](docs/SELF_LEARNING_ARCHITECTURE.md) (Architektur, Continuous Learning, Bedrohungsmodell & Roadmap).

---

## ⚡ 1-Klick Projekt-Setup

Um ein beliebiges TYPO3-Projekt mit allen KI-Regeln und MCP-Anbindungen auszustatten:

```bash
node scripts/setup-project.js /pfad/zu/deinem/typo3-projekt
```

Installiert automatisch:
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
├── .typo3-knowledge/             # 🧠 Persistenter Wissensspeicher (Advisories, gelernte Patterns)
├── docs/                         # 📖 Master-Dokumentationen
│   └── SELF_LEARNING_ARCHITECTURE.md
├── scripts/
│   ├── sync-ai-configs.js        # Kompiliert ai-rules/ in alle KI-Zielformate
│   └── setup-project.js          # Exportiert Regeln & MCP in externe TYPO3-Instanzen
├── typo3-mcp-server/             # 🤖 TypeScript MCP-Server (Brücke für LLMs)
├── typo3-security-suite/         # 🛡️ Statische Code-Analyse & CI/CD Pipeline
└── tests/fixtures/               # 🧪 Verwundbare Test-Extension für Verifikationstests
```

---

## 🤖 Model Context Protocol (MCP) Server

Der MCP Server (`typo3-mcp-server`) stellt KI-Agenten folgende Werkzeuge live zur Verfügung:

| MCP Tool | Funktion |
| :--- | :--- |
| `audit_typo3_instance` | Prüft `settings.php` / `LocalConfiguration.php` (`displayErrors`, `devIPmask`) und Webroot-Exposure (`.env`, `composer.lock`). |
| `analyze_typo3_extension` | Tiefenscan einer Extension: Nutzt PHPStan AST-Regeln und Python Fluid-Scanner (mit automatischem Fallback). |
| `run_phpstan_security_audit` | Führt die dedizierten AST-Regeln (SQLi, Broken Access Control, Echo XSS, Data Leaks) auf PHP-Dateien aus. |
| `fix_fluid_xss` | **Auto-Fix**: Repariert `f:format.raw()` und unsicheres Escaping in Fluid-Templates automatisch. |
| `apply_rector_fixes` | Führt Rector-Refactorings zur Code-Modernisierung aus (`--dry-run` oder live). |
| `sync_security_advisories` | Liest TYPO3 Security Advisories via RSS-Feed (mit Offline-Fallback zu `.typo3-knowledge/`). |
| `query_security_knowledge` | **Wissensabfrage**: Durchsucht bekannte CVEs, Anti-Patterns und gehärtete Vorher/Nachher-Lösungen. |
| `record_security_learning` | **Continuous Learning**: Speichert neu gelernte Sicherheitsmuster oder Entwickler-Fixes persistent ab. |
| `record_developer_fix` | Speichert einen deduplizierten Entwickler-Patch zunächst als `PENDING`. |
| `review_developer_fix` | Hält die tatsächliche menschliche Freigabe oder Ablehnung eines Patches fest. |
| `check_fluid_templates` | Gezielte Untersuchung von Fluid-Templates auf XSS. |

---

## 🛡️ PHPStan AST-Sicherheitsregeln

Die Suite prüft PHP-Code auf AST-Ebene (`PhpParser\Node`):

1. **`SqlInjectionQueryBuilderRule`**: Verhindert String-Verkettung (`Concat`) oder Interpolation (`Encapsed`) in QueryBuilder-Methoden (`where`, `andWhere`, `orWhere`, `statement`).
2. **`IgnoreValidationOnMutationRule`**: Blockiert `@ignorevalidation` und `#[IgnoreValidation]` auf datenverändernden Extbase-Aktionen.
3. **`RawFluidOrEchoXssRule`**: Verhindert direkte `echo`-Befehle in Controllern und ViewHelpern.
4. **`ExtbaseQuerySettingsDataLeakRule`**: Verhindert das unbedachte Deaktivieren von Zugriffsbeschränkungen via `setIgnoreEnableFields(true)` oder `setRespectStoragePage(false)`.

---

## 🚀 Entwicklung & Befehle

```bash
# Alle KI-Konfigurationen aus ai-rules/ synchronisieren
npm run sync-ai

# MCP Server kompilieren
npm run build

# Vollständigen Testlauf starten (MCP, Learning, Rector-Fixtures, PR-Review, PHPStan)
npm test

# Fluid Template XSS Scanner testen
npm run test:fluid

# Advisories einlesen, klassifizieren und experimentelle Fixtures erzeugen
npm run learn:advisories

# Einen lokalen Feed ohne Schreibzugriff prüfen
npm run learn:advisories -- --input ./advisories.json --dry-run

# Lokalen Wissensgraphen aufbauen und deutsch/englisch durchsuchen
npm run knowledge:index
npm run knowledge:query -- --query "Mandantentrennung"

# Aus wiederholt freigegebenen Fixes getestete Rector-Kandidaten erzeugen
npm run learn:rector
```

Der Advisory-Distiller übernimmt nur bekannte Schwachstellenklassen in ausführbare Test-Fixtures. Unbekannte Kategorien bleiben als `UNCLASSIFIED` im Wissensspeicher und müssen vor einer Regelerzeugung menschlich geprüft werden.

Meilenstein 3 bringt außerdem einen GitHub-PR-Bot mit Patch-Artefakten und Inline-Vorschlägen. Die unterstützten Muster, Review-Voraussetzungen und Einrichtung der Workflows stehen in [docs/CONTINUOUS_LEARNING.md](docs/CONTINUOUS_LEARNING.md).

---

## 📜 Lizenz & Richtlinien

Alle Komponenten folgen strikt den offiziellen [TYPO3 Coding Guidelines](https://docs.typo3.org/m/typo3/reference-coreapi/main/en-us/CodingGuidelines/Index.html) und den PSR-Standards (PSR-12, PSR-14, PSR-15).
Lizenz: GPL-2.0-or-later.
