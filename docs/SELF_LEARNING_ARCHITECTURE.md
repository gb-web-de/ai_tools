# Autonome & Selbstlernende TYPO3 AI-Sicherheitsarchitektur
## Master-Dokumentation: Continuous Learning, Vulnerability Intelligence & Self-Healing

> **Status:** Konzept & Architektur-Leitfaden  
> **Zielsysteme:** TYPO3 v12 / v13 / v14  
> **Integrationen:** Model Context Protocol (MCP), Cursor, Claude Code, Windsurf, GitHub Copilot, PHPStan AST, Rector  

---

## Inhaltsverzeichnis
1. [Executive Summary (Management & Strategie)](#1-executive-summary)
2. [Die Architektur des Selbstlernens (Systemperspektive)](#2-die-architektur-des-selbstlernens)
3. [Sicherheits- & DevSecOps-Perspektive](#3-sicherheits--und-devsecops-perspektive)
4. [KI- & Agenten-Perspektive (In-Context Evolution)](#4-ki--und-agenten-perspektive)
5. [Developer Experience & Human-in-the-Loop](#5-developer-experience--human-in-the-loop)
6. [Die 5 Stufen des Continuous Learning](#6-die-5-stufen-des-continuous-learning)
7. [Konkrete technische Implementierungsbausteine](#7-konkrete-technische-implementierungsbausteine)
8. [Roadmap zur Vollautomatisierung](#8-roadmap-zur-vollautomatisierung)

---

## 1. Executive Summary

### Warum traditionelle Ansätze versagen
Klassische Sicherheitsprüfungen in TYPO3-Agenturen kranken an drei strukturellen Problemen:
1. **Statische Regeln veralten**: CVEs und neue Angriffsmuster (z. B. komplexe ViewHelper-SSTIs, TCA-Injections, Deserialization-Chains) entstehen wöchentlich. Statische Linter hinken immer hinterher.
2. **KI-Wissensbegrenzung (Knowledge Cutoff)**: Kommerzielle LLMs (GPT-4o, Claude 3.5 Sonnet, Gemini Pro) wurden mit Code-Ständen trainiert, die Monate zurückliegen. Sie wiederholen veraltete TYPO3-Muster (`$GLOBALS['TYPO3_DB']`, ungeschützte `@ignorevalidation`-Actions).
3. **Schwarze Löcher bei Fehlern**: Wenn ein Entwickler einen Sicherheitsfehler manuell behebt oder ein Pentest eine Schwachstelle findet, bleibt dieses Wissen im Kopf des Entwicklers oder in einem PDF-Bericht gefangen – andere Projekte der Agentur lernen nichts daraus.

### Die Vision: Die sich selbst härtende TYPO3-Entwicklungsumgebung
Ein System, das:
* **kontinuierlich lernt**: Neue TYPO3 Security Advisories (TYPO3-PSA / TYPO3-EXT-SA) automatisch ingestiert, semantisch versteht und als Regeln synthetisiert.
* **aus eigenen Fehlern lernt**: Wenn PHPStan oder der MCP-Server eine Schwachstelle im Code findet, wird der Fall als Test-Fixture abgelegt, damit die KI denselben Fehler nie wieder generiert.
* **aktiv heilt**: Schwachstellen nicht nur anprangert, sondern über AST-Transformationen (Rector / Python Fixer) und validierte Patches vollautomatisch behebt.
* **die gesamte Flotte synchronisiert**: Erkenntnisse aus Projekt A stehen innerhalb von Minuten in allen Cursor-, Claude- und Windsurf-Instanzen aller Entwickler in Projekt B zur Verfügung.

---

## 2. Die Architektur des Selbstlernens

Das System basiert auf einem geschlossenen Feedback-Kreislauf (**Closed-Loop Feedback Cycle**):

```
                        ┌──────────────────────────────────────────────┐
                        │   1. SENSE (Sensorik / Bedrohungserkennung)   │
                        │   - TYPO3 Security Advisories (RSS / API)    │
                        │   - PHPStan AST Scan-Ergebnisse              │
                        │   - Developer Feedback & False Positives     │
                        └──────────────────────┬───────────────────────┘
                                               │
                                               ▼
                        ┌──────────────────────────────────────────────┐
                        │    2. DISTILL (Wissens-Destillation)         │
                        │   - LLM-gestützte Pattern-Extraktion         │
                        │   - Ableitung: Verwundbar vs. Gehärtet       │
                        │   - Generierung neuer Regeln in ai-rules/    │
                        └──────────────────────┬───────────────────────┘
                                               │
                                               ▼
                        ┌──────────────────────────────────────────────┐
                        │    3. VERIFY (Synthetisierung & Test)        │
                        │   - Erstellung einer Test-Fixture            │
                        │   - Validierung: Schlägt Rule sauber an?     │
                        │   - Prüfung: Gibt es False Positives?        │
                        └──────────────────────┬───────────────────────┘
                                               │
                                               ▼
                        ┌──────────────────────────────────────────────┐
                        │    4. DEPLOY & SYNC (Verteilung)             │
                        │   - npm run sync-ai                          │
                        │   - Update für Cursor, Claude, Copilot       │
                        │   - MCP-Server Memory Update                 │
                        └──────────────────────┬───────────────────────┘
                                               │
                                               ▼
                        ┌──────────────────────────────────────────────┐
                        │    5. HEAL (Selbstheilung / Remediation)     │
                        │   - MCP Tool: fix_fluid_xss                  │
                        │   - Rector Auto-Patching                     │
                        │   - Verifizierte Pull Requests               │
                        └──────────────────────────────────────────────┘
```

---

## 3. Sicherheits- & DevSecOps-Perspektive

Aus Sicht des Security Engineers muss ein lernendes System **deterministisch**, **nachvollziehbar** und **manipulationssicher** sein.

### A. Bedrohungsmodell & Ingestion-Quellen
Das System konsumiert kontinuierlich vier Datenströme:
1. **Offizieller TYPO3 Security Feed**: `https://news.typo3.com/security/rss-security`
   * Enthält Core Advisories (TYPO3-PSA) und Extension Advisories (TYPO3-EXT-SA).
2. **Packagist Security Advisories / GitHub Advisory Database (GHSA)**:
   * Maschinenlesbare CVEs, betroffene Versionsgrenzen und Commit-Diffs der Fixes.
3. **Internal Audit Findings (CI/CD)**:
   * Aggregierte JSON-Outputs von `audit_typo3_instance` und `run_phpstan_security_audit` aus allen Pipeline-Läufen.
4. **Human Review Diffs**:
   * Git-Commits mit Tags wie `fix(security): ...` oder abgelehnte PRs im Code-Review.

### B. Validierung gegen False Positives (Die "Immunsystem-Hürde")
Eine KI darf nicht unkontrolliert Regeln erfinden, die den Build lahmlegen. Jede neu gelernte Regel muss ein **Gatekeeping-Verfahren** durchlaufen:
1. **Vulnerability Fixture Test**: Die Regel *muss* den verwundbaren Code-Ausschnitt erkennen.
2. **Safe Code Regression Test**: Die Regel *darf nicht* an validem, sicherem TYPO3-Code (z. B. Core-Klassen oder bestehenden sauberen Extensions) anschlagen.
3. **Confidence Scoring**: Neue Regeln starten im Status `EXPERIMENTAL` (Warnung mit Erklärungsanforderung im MCP), bevor sie bei bewiesener Präzision zu `STRICT` (Build-Blocker) befördert werden.

---

## 4. KI- & Agenten-Perspektive

Wie "lernt" ein System aus Sprachmodellen, ohne dass man die Modellgewichte für Hunderttausende Euro neu trainieren muss (Fine-Tuning)?

### A. Dynamisches In-Context Learning & Few-Shot Retrieval
Die KI lernt über **Strukturierte Erinnerung (Episodic Memory)**:
* Wenn die KI aufgefordert wird: *"Erstelle einen Extbase Controller mit File-Upload"*, fragt sie vor dem Schreiben über den MCP-Server das Wissensmodul ab:
  ```json
  // MCP Call: get_security_context
  {
    "domain": "file_upload",
    "framework": "typo3_v13"
  }
  ```
* Das System liefert die exakten **Anti-Patterns** und die **Gold-Standard-Implementierung**:
  * ❌ *Anti-Pattern:* `move_uploaded_file()`, ungesicherte Dateiendungen, Speichern im Webroot.
  * ✅ *Gold Standard:* Nutzung der FAL `ResourceFactory`, MIME-Type-Validierung, Speichern in geschütztem Storage.

### B. Das Reflexions- & Korrektur-Muster (Generate -> Critique -> Verify)
Statt blind Code zu generieren, erzwingen die generierten Agenten-Anweisungen (`AGENTS.md`) einen 3-Stufen-Prozess:
1. **Entwurf (Draft)**: KI erzeugt den Quellcode.
2. **Selbstkritik via MCP (Critique)**: Die KI ruft `run_phpstan_security_audit` auf dem temporären Entwurf auf.
3. **Reparatur vor Ausgabe (Self-Repair)**: Werden Verstöße gemeldet (z. B. ungeschütztes QueryBuilder-Where), korrigiert sich die KI selbst, bevor der Entwickler den Code überhaupt zu Gesicht bekommt.

---

## 5. Developer Experience & Human-in-the-Loop

Selbstlernende Systeme scheitern oft an schlechter UX. Die Entwickler dürfen nicht durch manuelle Dokumentationspflichten gebremst werden.

### A. Reibungslose Interaktion im Editor
* **In Cursor / Windsurf / VS Code**: Entwickler arbeiten normal. Wenn die KI Code vorschlägt, ist er durch die synchronisierten `.cursorrules` bereits vorkonditioniert.
* **Wenn der Linter meckert**: Der Entwickler drückt `Alt+Enter` oder fragt die KI: *"Behebe die Sicherheitswarnung in Zeile 42"*. Die KI nutzt das MCP-Tool `run_phpstan_security_audit`, versteht den AST-Fehler und repariert ihn präzise.

### B. Entwickler-Korrekturen als Trainingsdaten (Active Feedback Loop)
Wenn ein Entwickler entscheidet: *"In diesem speziellen Fall ist `f:format.raw()` sicher, weil der Wert durch ein Enums-Array garantiert ist"*:
* Er setzt einen semantischen Kommentar:
  ```html
  <!-- typo3-security-suppress: XSS_RAW_OUTPUT reason: Enum strictly validated in Domain Model -->
  {statusIcon -> f:format.raw()}
  ```
* Das System erfasst diesen Fall in `.typo3-security-knowledge/exceptions.json`. Die KI lernt daraus: *"Wenn ein Enum-Wert gerendert wird, ist das Risiko geringer"*.

---

## 6. Die 5 Stufen des Continuous Learning

| Stufe | Reifegrad | Funktionsweise | Aktueller Projektstatus |
| :---: | :--- | :--- | :---: |
| **L1** | **Statische Regeln** | Feste PHPStan-Regeln, Regex-Scanner, manuelle Dokumentation. | ✅ **Erreicht** |
| **L2** | **Multi-AI Synchronisation** | Single Source of Truth (`ai-rules/`), automatische Generierung von Cursor-, Claude-, Copilot- und Windsurf-Configs. | ✅ **Erreicht** |
| **L3** | **Bedrohungs-Ingestion** | MCP liest TYPO3 Security Advisories ein und stellt sie der KI zur Verfügung. | ✅ **Erreicht** |
| **L4** | **Wissens-Destillation & Fixture-Evolution** | Neue Advisories erzeugen automatisch Test-Fixtures und Entwürfe neuer PHPStan-Rules; Fehler im CI werden als Fixture gelernt. | 🔄 **In Konzeption** |
| **L5** | **Vollautonome Selbstheilung (Auto-Remediation)** | KI erkennt Lücken flottenweit, baut Rector/AST-Fixes, verifiziert sie in isolierten Containern und stellt fertige PRs. | 🎯 **Zielvision** |

---

## 7. Konkrete technische Implementierungsbausteine

Um Stufe 4 und 5 zu erreichen, implementieren wir folgende drei Kernmodule:

### Baustein 1: Der Advisory Knowledge Distiller (`scripts/learn-advisories.js`)
Ein Skript, das die TYPO3 RSS-Advisories durchläuft und per LLM analysiert:
```typescript
// Ablauf:
// 1. Hole Advisory TYPO3-EXT-SA-2026-004
// 2. Extrahiere:
//    - Typ: SQL Injection in Repositories
//    - Angriffsvektor: Ungeschützte OrderBy-Klausel
//    - Code vorher: $queryBuilder->orderBy($userInput)
//    - Code nachher: In-Array-Whitelist-Validierung
// 3. Schreibe Testfall nach tests/fixtures/learned/TYPO3-EXT-SA-2026-004.php
// 4. Ergänze ai-rules/01-security.md um den neuen Fallstrick
// 5. Triggere npm run sync-ai
```

### Baustein 2: Lokaler Knowledge-Store (`.typo3-knowledge/`)
Eine leichtgewichtige SQLite- oder JSONL-Datenbank im Repository:
```
.typo3-knowledge/
├── vulnerabilities.jsonl    # Gelernte Schwachstellenmuster mit Vorher/Nachher-Code
├── fixes_history.jsonl      # Erfolgreich durchgeführte Auto-Fixes & Diffs
└── false_positives.jsonl    # Manuell durch Entwickler markierte Ausnahmen
```

### Baustein 3: MCP-Erweiterung für dynamischen Kontext
Zwei neue MCP-Tools im Server:
1. `learn_from_patch`: Erlaubt es Entwicklern oder CI/CD-Pipelines, einen Git-Diff an den MCP-Server zu übergeben. Der Server analysiert, ob es sich um einen Security-Fix handelt, und speichert das gelernte Muster ab.
2. `query_knowledge_base`: Erlaubt es jedem LLM, nach spezifischen Lösungen für eine gemeldete Schwachstelle zu suchen.

---

## 8. Roadmap zur Vollautomatisierung

### Meilenstein 1 (Abgeschlossen)
* [x] Monorepo-Konsolidierung mit Git und NPM Workspaces.
* [x] Universal AI Adapter (`ai-rules/` -> Cursor, Claude, Copilot, Windsurf, AGENTS.md).
* [x] Tiefen-Integration von PHPStan AST-Rules und Fluid XSS Fixer in den MCP Server.
* [x] Test-Fixture-Infrastruktur (`tests/fixtures/vulnerable_extension/`).

### Meilenstein 2 (Kurzfristig: Q4)
* [ ] Automatisierter Advisory-Parser: `npm run learn:advisories`.
* [ ] Dynamische Generierung von PHP-Testfixtures aus neu erkannten Advisories.
* [ ] Implementierung des MCP-Tools `record_developer_fix` für Human-in-the-Loop Feedback.

### Meilenstein 3 (Mittelfristig: Q1/Q2)
* [ ] Lokaler SQLite/JSONL Knowledge Graph für Semantische Suche nach TYPO3-Sicherheitslösungen.
* [ ] Automatisierte Generierung von Rector-Regeln bei wiederkehrenden Code-Smells.
* [ ] GitHub Action: Automatischer Security-Audit-Bot, der verwundbare PRs nicht nur kommentiert, sondern direkt den korrigierten Patch als Review-Vorschlag anhängt.

---

*Diese Dokumentation dient als strategischer und technischer Leitfaden für die kontinuierliche Weiterentwicklung der TYPO3 AI & Security Suite.*
