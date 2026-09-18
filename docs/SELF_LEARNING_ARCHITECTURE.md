# Autonome & Selbstlernende TYPO3 AI-Sicherheitsarchitektur
## Master-Dokumentation: Continuous Learning, Vulnerability Intelligence & Self-Healing

> **Status:** Meilensteine 1–5 implementiert (Meilenstein 4 wartet noch auf das menschliche Review der Fixtures); L4/L5 bleiben schrittweise auszubauen
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
| **L4** | **Wissens-Destillation & Fixture-Evolution** | Neue Advisories erzeugen automatisch Test-Fixtures und Entwürfe neuer PHPStan-Rules; Fehler im CI werden als Fixture gelernt. | 🧪 **Teilimplementiert** |
| **L5** | **Vollautonome Selbstheilung (Auto-Remediation)** | KI erkennt Lücken flottenweit, baut Rector/AST-Fixes, verifiziert sie in isolierten Containern und stellt fertige PRs. | 🎯 **Zielvision** |

---

## 7. Konkrete technische Implementierungsbausteine

Um Stufe 4 und 5 zu erreichen, implementieren wir folgende drei Kernmodule:

### Baustein 1: Der Advisory Knowledge Distiller (`scripts/learn-advisories.js`)
Ein Skript, das die TYPO3 RSS-Advisories durchläuft und zunächst deterministisch gegen eine freigegebene Sicherheitstaxonomie analysiert. Nur bekannte Klassen erzeugen `EXPERIMENTAL`-Fixtures; unbekannte Inhalte bleiben `UNCLASSIFIED` und benötigen Human Review:
```typescript
// Ablauf:
// 1. Hole Advisory TYPO3-EXT-SA-2026-004
// 2. Extrahiere:
//    - Typ: SQL Injection in Repositories
//    - Angriffsvektor: Ungeschützte OrderBy-Klausel
//    - Code vorher: $queryBuilder->orderBy($userInput)
//    - Code nachher: In-Array-Whitelist-Validierung
// 3. Lege einen EXPERIMENTAL-Entwurf unter var/advisory-drafts/ ab (ungetrackt)
// 4. Human Review: realistisches Paar unter tests/fixtures/regression/<slug>/
//    mit case.json anlegen; erst der Regressionstest macht daraus einen Nachweis
// 5. Ergänze ai-rules/01-security.md um den neuen Fallstrick
// 6. Triggere npm run sync-ai
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
Implementierte MCP-Schnittstellen:
1. `record_developer_fix` und `review_developer_fix`: Erfassen einen Unified Diff samt Typ, Herkunft und explizitem Review-Status. Die Erfassung alleine bestätigt nicht die Sicherheit eines Patches.
2. `query_security_knowledge`: Lokale, deutsch/englische Begriffssuche mit Ranking und Beziehungen zwischen Advisories, Mustern und Entwickler-Fixes.

---

## 8. Roadmap zur Vollautomatisierung

### Meilenstein 1 (Abgeschlossen)
* [x] Monorepo-Konsolidierung mit Git und NPM Workspaces.
* [x] Universal AI Adapter (`ai-rules/` -> Cursor, Claude, Copilot, Windsurf, AGENTS.md).
* [x] Tiefen-Integration von PHPStan AST-Rules und Fluid XSS Fixer in den MCP Server.
* [x] Test-Fixture-Infrastruktur (`tests/fixtures/vulnerable_extension/`).

### Meilenstein 2 (Kurzfristig: Q4)
* [x] Automatisierter Advisory-Parser: `npm run learn:advisories` (RSS/JSON, Offline- und Dry-Run-fähig).
* [x] Dynamische Generierung von strikt typisierten PHP-Testfixtures aus erkannten Advisory-Klassen.
* [x] Implementierung des MCP-Tools `record_developer_fix` für dedupliziertes Human-in-the-Loop Feedback in `fixes_history.jsonl`.

#### Sicherheits-Gates von Meilenstein 2
* Feed-Inhalte bestimmen niemals frei Dateinamen oder ausführbaren PHP-Code.
* Nur die feste Taxonomie erzeugt Fixtures; unbekannte Kategorien werden nicht synthetisiert.
* Gelernte Fixtures starten immer als `EXPERIMENTAL` und werden erst nach Vulnerable-/Safe-Code-Regressionstests zu `STRICT` befördert.
* Entwickler-Fixes benötigen einen echten Unified Diff, sind auf 200 KB begrenzt und werden über einen SHA-256-Fingerprint dedupliziert.

### Meilenstein 3 (Implementiert: 18.09.2026)
* [x] Lokaler JSONL-Wissensgraph mit begriffsbasierter semantischer Suche (DE/EN), Ranking, Herkunft und Beziehungen; CLI und MCP nutzen dieselbe Suche.
* [x] Automatisierte, vorlagenbasierte Rector-Regelerzeugung aus wiederholten freigegebenen Fixes. Erstes unterstütztes Muster: `unserialize_disallow_classes`; echte Rector-Fixture-Prüfung vor Ausgabe.
* [x] GitHub-PR-Audit mit Patch-Artefakt und Inline-Review-Vorschlägen für unterstützte Fluid-/Deserialisierungsfälle; Analyse und PR-Schreibrechte sind getrennt.

Betrieb, Befehle, Voraussetzungen und die genauen Grenzen sind in [CONTINUOUS_LEARNING.md](CONTINUOUS_LEARNING.md) beschrieben. Die Workflows sind lokal vorbereitet und getestet; eine echte Veröffentlichung auf GitHub erfolgt erst nach Aufnahme in den Default-Branch. Freie LLM-Regelsynthese, Embedding-Suche und vollautonome Patch-Freigabe gehören weiterhin nicht zum implementierten Umfang.

### Meilenstein 4 (Implementiert: 18.09.2026 – Belastbare Advisory-Regressionstests)

Die zuvor automatisch erzeugten Einzeiler unter `tests/fixtures/learned/` waren nur klassifizierte Entwürfe: generische Code-Zeilen ohne Bezug zur dokumentierten Ursache und ohne Test-Harness. Eine Messung zeigte, dass von 14 versionierten Fixtures nur 2 überhaupt von einer PHPStan-Regel erkannt wurden – sie waren damit kein Sicherheitsnachweis. Sie wurden entfernt und durch geprüfte Paare ersetzt.

* [x] Stabile Error-Identifier (`typo3Security.*`) für alle neun Regeln, zentral in `rules/SecurityRuleIdentifier.php`. Sie sind der Vertrag zwischen Regeln, Regressionstests und SARIF-Export; Meldungstexte dürfen sich ändern, Identifier nicht.
* [x] Für jede Regel ein realistisches verwundbares Codebeispiel in idiomatischer TYPO3-Struktur (`Classes/Controller`, `Classes/Domain/Repository`, `Classes/ViewHelpers`, `Classes/Service`) mit echten TYPO3-Typen statt generischer `object`-Parameter.
* [x] Zu jedem verwundbaren Beispiel ein fachlich gleichwertiges, sicheres Gegenbeispiel.
* [x] Automatisierter Regressionstest (`npm run test:regression`): Das verwundbare Beispiel muss mit dem erwarteten Identifier erkannt werden und darf keine fremde Sicherheitsregel auslösen; das sichere Gegenbeispiel muss ohne Sicherheitsbefund bleiben; beide müssen frei von allgemeinen Analysefehlern sein.
* [x] Generische Einzeiler landen als `EXPERIMENTAL`-Entwürfe in `var/advisory-drafts/` (ungetrackt) und weisen sich im Dateikopf selbst als nicht committierbar aus.
* [x] Herkunft ist Pflicht und wird schema-validiert: `origin.kind=ADVISORY` verlangt Advisory-ID und https-Link, `origin.kind=RULE_CONTRACT` eine benannte Referenz. `causal_fidelity` trennt „bildet die dokumentierte Ursache ab“ von „bildet die Schwachstellenklasse ab“; die stärkere Behauptung verlangt den belegten Ursachentext.
* [x] Review-Status je Fixture mit CLI-Übersicht (`npm run fixtures:status`) und Gate-Option `--require-approved`.
* [x] Bestehende `TYPO3-PSA-2024-*`-Fixtures geprüft und entfernt: Diese Seeds tragen CVE-Platzhalter und keinen Quell-Link, erfüllen die Herkunftspflicht also nicht.

**Zwei Befunde aus der Umsetzung, die eigene Korrekturen erforderten:**

1. **PHPStans Result-Cache invalidiert nicht bei Änderungen an den Regel-Klassen.** Ein Mutationstest (Erkennung der Concat-Prüfung deaktiviert) blieb zunächst grün, weil zwischengespeicherte Befunde einer Regel gemeldet wurden, die nichts mehr erkennt. Der Harness nutzt daher einen isolierten Cache (`tmpDir`), den er vor jedem Lauf verwirft. Ohne das wäre die Testsuite in CI still falsch-grün gewesen.
2. **Die SSRF-Regel konnte validierte nicht von unvalidierten dynamischen URLs unterscheiden**, ein gleichwertiges sicheres Gegenbeispiel war damit unmöglich. Sie meldet jetzt keinen Befund mehr, wenn die statische Analyse das Ziel auf eine feste Menge konstanter Strings auflöst – das deckt die übliche Härtung per Endpunkt-Allowlist ab und senkt die False-Positive-Rate.

**Abnahmekriterien – Nachweis:** Jedes versionierte Fixture besitzt ein verwundbares und ein sicheres Gegenbeispiel sowie einen ausführbaren Regressionstest gegen eine konkrete PHPStan-Regel. Beide Fehlerrichtungen wurden per Mutationstest belegt: Wird die Erkennung deaktiviert, schlägt der Vulnerable-Test fehl; meldet die Regel pauschal, schlägt der Secure-Test fehl. Nicht validierte Einzeiler gelangen weder in Git noch in den Status `STRICT`.

**Noch offen:** Alle neun Fixture-Paare stehen auf `PENDING`. Das Review ist ausdrücklich eine menschliche Aufgabe und kann nicht durch den Autor der Fixtures erfolgen. Bis dahin bleibt der CI-Schritt informativ; nach dem Review kann er über `--require-approved` scharf geschaltet werden. Alle advisory-gebundenen Fixtures tragen `causal_fidelity: VULNERABILITY_CLASS`, weil die veröffentlichten Advisory-Texte die Schwachstellenklasse benennen, nicht die konkrete Codestelle – eine Höherstufung auf `DOCUMENTED_ROOT_CAUSE` setzt den belegten Ursachentext voraus.

### Meilenstein 5 (Implementiert: 18.09.2026 – Wissensgraph im Team und projektübergreifend teilen)

Gemeinsamer, versionierter Wissensbestand über ein privates Git-Repository. Entwickler und Projekte arbeiten mit lokalen Kopien; neue Erkenntnisse werden per Pull Request geprüft und anschließend explizit synchronisiert. Geteilt werden `advisories.json`, `learned_patterns.json` und `fixes_history.jsonl`; der abgeleitete `graph.jsonl` wird lokal neu gebaut.

* [x] Einheitliche Speicher-Auflösung (`scripts/lib/knowledge-paths.js`) für MCP und alle Learning-CLIs: expliziter Parameter, dann `TYPO3_KNOWLEDGE_PATH`, dann Repository-Speicher. Der Advisory-Import schrieb zuvor unabhängig von der Konfiguration in den Projektordner.
* [x] Versioniertes Austauschformat (`typo3-security-knowledge-exchange`, Version 1) mit Schema-Validierung, Herkunftsangaben und Vorschau über `--dry-run`.
* [x] Git-basierter Team-Workflow mit einer Bundle-Datei je Projekt, dokumentierter Einrichtung und explizitem Synchronisieren; der Pull Request ist der Reviewpunkt.
* [x] Deduplizierung und Konfliktbehandlung: Jeder Datensatz wird als `new`, `unchanged`, `conflict` oder `invalid` klassifiziert. Ein Konflikt überschreibt nie – der lokale Stand bleibt maßgeblich und die Abweichung wird gemeldet. Die Identität eines Entwickler-Fixes wird aus dem Inhalt neu berechnet, nie aus dem Bundle übernommen.
* [x] Freigabeprozess: Der Export prüft jeden Eintrag auf private Schlüssel, Klartext-Zugangsdaten, AWS-Keys, interne Hostnamen, private IP-Adressen, lokale Benutzerpfade und E-Mail-Adressen und bricht mit Feld und Textausschnitt ab. Nur `APPROVED`-Fixes werden standardmäßig geteilt, `REJECTED` nie.
* [x] Nach dem Import wird lokal neu indexiert; übernommenes Wissen ist über dieselbe CLI- und MCP-Suche auffindbar wie lokales.
* [x] Integrationstests mit zwei getrennten lokalen Kopien (`npm run test:exchange`) für Austausch, wiederholten Import, Konflikte, ungültige Daten, Freigabeprüfung und Fingerprint-Manipulation; Team-Betriebsanleitung in [CONTINUOUS_LEARNING.md](CONTINUOUS_LEARNING.md).

**Die zentrale Entwurfsentscheidung: Vertrauen wandert nicht mit.** Ein importierter Entwickler-Fix landet lokal auf `PENDING`, die ursprüngliche Freigabe bleibt als Herkunft unter `imported.origin_review` erhalten. Eine Freigabe in Projekt A ist damit Herkunftsangabe, keine lokale Freigabe. Ohne diese Trennung könnte ein Import in Projekt B unmittelbar eine Rector-Regel scharf schalten – eine Vertrauensausweitung über Projektgrenzen, die niemand bewusst erteilt hätte. Ein Test hält das fest: zwei importierte, in A freigegebene Fixes ergeben in B `INSUFFICIENT_EVIDENCE`, bis ein lokaler Reviewer sie freigibt.

**Ein Befund aus der Umsetzung:** `validateFix` lehnte `source: null` ab, obwohl `recordDeveloperFix` ein nicht gesetztes optionales Feld genau so speichert. Ein gespeicherter Fix bestand damit seine eigene Validierung nicht, und jeder Fix ohne Quellenangabe wäre beim Export stillschweigend verworfen worden. Die Validierung akzeptiert jetzt die gespeicherte Form; ein Test hält die Roundtrip-Eigenschaft fest.

**Abnahmekriterien – Nachweis:** Ein freigegebener Lernfall aus Projekt A lässt sich in Projekt B übernehmen und dort mit Herkunft und Review-Status finden. Wiederholte Importe erzeugen keine Duplikate (`new: 0, unchanged: n`). Konflikte und ungültige Daten werden gemeldet, bestehendes Wissen bleibt erhalten. Ein Import allein erteilt keine neue Freigabe und aktiviert keine Rector-Regel. Alle vier Aussagen sind durch Integrationstests mit zwei getrennten Kopien abgedeckt.

**Optionaler späterer Ausbau:** Zentraler Wissensdienst mit authentifiziertem Netzwerkzugriff, Rollen und zentraler Schreibverwaltung. Die erste Umsetzung dieses Meilensteins konzentriert sich auf den Git-basierten Austausch.

---

*Diese Dokumentation dient als strategischer und technischer Leitfaden für die kontinuierliche Weiterentwicklung der TYPO3 AI & Security Suite.*
