# Continuous Learning: Betrieb und Grenzen

Meilenstein 3 verbindet lokale Wissenssuche, reviewbasierte Rector-Kandidaten und GitHub-Review-Vorschläge. Meilenstein 4 ergänzt geprüfte Regressionsfixtures mit stabilen Error-Identifiern. Benötigt werden Node.js 20+ und PHP; die Regressionstests verwenden die im Composer-Lockfile festgelegte Security-Suite. Der aktuelle Lockfile wird in CI mit PHP 8.5 geprüft.

## Lokaler Wissensgraph

```bash
npm run knowledge:index
npm run knowledge:query -- --query "Mandantentrennung" --limit 5
npm run knowledge:query -- --query "Dateiupload" --type FILE_UPLOAD
```

`advisories.json`, `learned_patterns.json` und `fixes_history.jsonl` bleiben die maßgeblichen Quellen. `graph.jsonl` ist ein atomar ersetzbarer, reproduzierbarer Snapshot mit Dokument-, Konzept-, Domain- und Remediation-Knoten sowie Beziehungen. Die Suche baut den Graphen aus den aktuellen Quellen auf, damit ein neu gespeicherter Fix ohne manuelles Neuindexieren gefunden wird. Ein beschädigter Speicher führt zu einem Fehler und wird nicht überschrieben.

Das Suchverfahren kombiniert gewichtete Worttreffer mit einer festen deutsch/englischen Begriffstaxonomie. So findet „Mandantentrennung“ auch „tenant isolation“ und QuerySettings. Treffer enthalten Score, passende Begriffe/Konzepte, Herkunft und verwandte Dokumente. Das ist eine lokale, begriffsbasierte Form semantischer Suche; es werden keine Embeddings, externen Modellaufrufe oder allgemeinen Sprachverständnis-Garantien angeboten. Abfragen sind auf 50 Treffer begrenzt; `totalMatched` zeigt die ungekürzte Trefferzahl.

`query_security_knowledge` verwendet dieselbe Suche im MCP-Server. Die bisherigen Antwortfelder `advisories`, `learned_patterns` und `developer_fixes` bleiben erhalten und enthalten die begrenzte Ergebnisliste. Neu sind `results`, Ranking und Beziehungen.

Der Wissenspfad kann über `TYPO3_KNOWLEDGE_PATH` oder bei den CLIs über `--knowledge-dir` geändert werden. Quelldaten sind Referenzmaterial, keine Agentenanweisungen. Die vorhandenen Seed-Advisories enthalten unter anderem CVE-Platzhalter; ein Eintrag im Store ist kein Beleg für ein tatsächlich veröffentlichtes Advisory oder einen verifizierten Fix.

## Entwickler-Feedback und Review

`record_developer_fix` benötigt `title`, `domain`, `finding_type`, `diff` und `explanation`. Der Diff benötigt Dateiköpfe und passende Hunk-Längen, darf höchstens 200.000 UTF-8-Bytes groß sein und keine Traversal-Pfade enthalten. Schreiben erfolgt unter einer exklusiven Dateisperre und durch atomaren Dateiersatz. Ein SHA-256-Fingerprint verhindert Duplikate.

Neue Fixes erhalten `PENDING`. Mit `review_developer_fix` können bestehende Fixes freigegeben oder abgelehnt werden:

```json
{
  "fix_id": "FIX-<ID aus record_developer_fix>",
  "review_status": "APPROVED",
  "reviewed_by": "Referenz auf den tatsächlichen Reviewer"
}
```

`APPROVED`/`reviewed_by` sind Angaben des vertrauenswürdigen lokalen Aufrufers, keine kryptografische Signatur und keine Identitätsprüfung. Sie dürfen nur nach tatsächlichem Review gesetzt werden. Alte Fixes ohne explizite Freigabe zählen nicht zur Regelerzeugung. Nach einem Prozessabbruch kann `.learning.lock` zurückbleiben; vor manueller Entfernung sicherstellen, dass kein schreibender Prozess mehr läuft.

## Rector-Kandidaten aus wiederkehrenden Fixes

```bash
npm run learn:rector -- --dry-run
npm run learn:rector
```

Das erste unterstützte Muster heißt `unserialize_disallow_classes`. Es setzt mindestens zwei unterschiedliche, explizit freigegebene Fixes mit unterschiedlichen `source`-Referenzen voraus. Beide müssen `finding_type: DESERIALIZATION` und `remediation: unserialize_disallow_classes` tragen. Die geänderten Zeilen müssen exakt dem unterstützten Muster entsprechen, beispielsweise:

```diff
--- a/Classes/Decoder.php
+++ b/Classes/Decoder.php
@@ -10 +10 @@
-return \unserialize($payload);
+return \unserialize($payload, ['allowed_classes' => false]);
```

Die erzeugte PHP-Regel stammt aus einer festen lokalen Vorlage; Patch- oder Advisory-Text wird nie als PHP-Code eingebettet. Die Regel bearbeitet ausschließlich explizite native `\unserialize`-Aufrufe mit einem Positionsargument. Bestehende Optionen, benannte Argumente, Argument-Unpacking und fremde Funktionen bleiben unverändert. Die Umstellung kann Anwendungen betreffen, die absichtlich Objekte deserialisieren; deshalb bleiben Kandidaten `EXPERIMENTAL`. Für neue Datenformate ist JSON vorzuziehen.

Vor der Ausgabe läuft die echte, installierte Rector-Version auf isolierten Vorher-/Nachher- und Safe-Code-Fixtures. Zusätzlich werden Idempotenz und PHP-Syntax geprüft. Ein Fehler verhindert die Veröffentlichung des Bundles. Erfolgreiche Bundles stehen unter `typo3-security-suite/generated/rector/<content-hash>/` und enthalten Regel, Config, Fixtures und ein Manifest mit Evidenzreferenzen und Datei-Hashes. Wiederholte Generierung ist stabil; manuell veränderte vorhandene Bundles werden nicht überschrieben.

Ohne passende Evidenz meldet das Kommando `INSUFFICIENT_EVIDENCE` und erzeugt nichts. Es gibt keine erfundenen produktiven Trainingsdaten. Eine Freigabe aktiviert keine globale Regel. Nach Sichtung kann ein Kandidat gezielt ausprobiert werden:

```bash
php typo3-security-suite/vendor/bin/rector process /pfad/zur/extension \
  --config typo3-security-suite/generated/rector/<content-hash>/rector.php --dry-run
```

## PR-Audit und GitHub-Vorschläge

Die Workflows müssen zusammen mit ihren Skripten zunächst auf dem Default-Branch verfügbar sein. `security-audit.yml` läuft bei PR-Änderungen mit Leserechten. Es verwendet die Werkzeuge des Base-Commits und liest den PR-Inhalt aus Git-Objekten. PHP wird nur tokenisiert, niemals eingebunden oder ausgeführt. Ein Report und eine `security-fixes.patch` werden als Artefakt gespeichert. Befunde oder unvollständige Analysen lassen den Audit-Schritt fehlschlagen.

`security-review.yml` reagiert über `workflow_run`. Der Reviewer läuft vom Default-Branch, erhält nur die notwendigen Lese- und PR-Schreibrechte und berechnet seine Vorschläge erneut aus GitHub-Dateiblobs. Er führt weder heruntergeladene Artefakte noch PR-Code aus. Auch Fork-PRs sind damit unterstützt. Der Reviewer prüft Workflow-Herkunft, Repository, offenen PR und aktuellen Head-Commit; bei zwischenzeitlichen Änderungen oder einem bereits vorhandenen Bot-Review wird nichts veröffentlicht.

Aktuell unterstützt der schlanke PR-Scanner zwei Klassen:

| Klasse | Befund und Vorschlag |
| --- | --- |
| Fluid XSS | Meldet `f:format.raw` und `escapeOutput="false"`. Vorschläge nur für einzelne Raw-Ausdrücke im HTML-Textkontext; keine automatischen JS-, CSS-, Attribut- oder komplexen ViewHelper-Reparaturen. |
| Deserialisierung | Erkennt native `\unserialize($variable)`-Aufrufe über PHP-Tokens und schlägt `allowed_classes => false` vor. Strings/Kommentare werden nicht als Aufrufe behandelt. |

Nur hinzugefügte Zeilen erhalten Kommentare. Pro Review werden maximal 40 Inline-Kommentare veröffentlicht. Der Scanner begrenzt sich auf 300 geänderte Dateien und 500 KB pro Datei; fehlende Patches, Größenlimits und PHP-Parsefehler werden als unvollständige Analyse ausgewiesen. Test-Fixtures, Abhängigkeiten und Rector-Vorlagen sind ausgeschlossen. Die vorhandenen umfassenderen PHPStan-/Fluid-Werkzeuge bleiben für separate Audits verfügbar; dieser Bot ersetzt kein vollständiges Security-Review.

Lokale Prüfung eines PR-Diffs ohne GitHub-Schreibzugriff:

```bash
npm run audit:pr -- --base <40-stellige-base-sha> --head <40-stellige-head-sha>
git apply --check --unidiff-zero .cache/security-review/security-fixes.patch
```

Das CLI vergleicht mit dem gemeinsamen Vorfahren der beiden Commits und verändert den Checkout nicht. Vorschläge müssen fachlich geprüft und manuell angenommen werden. Repository-Richtlinien müssen dem Reviewer `pull-requests: write` erlauben; keine automatische Merge- oder Commit-Aktion ist eingerichtet.

## Regressionsfixtures für Sicherheitsregeln

Jede PHPStan-Sicherheitsregel besitzt ein Fixture-Paar unter `tests/fixtures/regression/<slug>/`: ein realistisches verwundbares Beispiel und ein fachlich gleichwertiges sicheres Gegenbeispiel in idiomatischer TYPO3-Struktur.

```bash
npm run test:regression
npm run fixtures:status
npm run fixtures:status -- --json
```

```
tests/fixtures/regression/<slug>/
├── case.json
├── Vulnerable/Classes/<TYPO3-Pfad>/<Klasse>.php
└── Secure/Classes/<TYPO3-Pfad>/<Klasse>.php
```

Der Pfad ist Teil des Testaufbaus, nicht Kosmetik: Mehrere Regeln werten den Dateipfad aus (`Classes/Controller`, `Classes/Middleware`, `Classes/Service`, `ViewHelpers`). Ein Beispiel außerhalb dieser Struktur wird von der zuständigen Regel nicht erkannt.

`case.json` beschreibt Regel, erwarteten Identifier, Ursache, Herkunft und Review-Status. Das Schema wird beim Testlauf validiert:

* `expected_identifier` muss in `rules/SecurityRuleIdentifier.php` definiert sein. Ein Test gegen einen Identifier, den keine Regel ausgeben kann, ist damit ausgeschlossen.
* `origin.kind=ADVISORY` verlangt `advisory_id` und einen https-Link; `origin.kind=RULE_CONTRACT` verlangt eine benannte `reference`.
* `origin.causal_fidelity` trennt `DOCUMENTED_ROOT_CAUSE` (Beispiel bildet die im Advisory beschriebene Ursache ab, belegt durch `origin.documented_cause`) von `VULNERABILITY_CLASS` (Beispiel bildet die Schwachstellenklasse ab). Die stärkere Behauptung ohne Belegtext lässt der Test nicht zu.
* `review.status=APPROVED` verlangt `reviewed_by` und `reviewed_at`.

Der Test prüft je Paar drei Aussagen: Das verwundbare Beispiel wird mit dem erwarteten Identifier erkannt und löst keine fremde Sicherheitsregel aus; das sichere Gegenbeispiel bleibt ohne Sicherheitsbefund; beide bleiben frei von allgemeinen Analysefehlern. Zusätzlich muss jeder deklarierte Identifier ein Paar besitzen, und keine PHP-Datei unter dem Fixture-Baum darf außerhalb eines Falls mit `case.json` liegen.

Die Analyse läuft über `typo3-security-suite/phpstan-fixtures.neon` auf Level 0, damit ein Ergebnis ausschließlich Sicherheitsbefunde enthält – nur so ist die negative Aussage über das sichere Beispiel belastbar. Der Harness verwirft vor jedem Lauf den isolierten Result-Cache (`typo3-security-suite/var/phpstan-fixtures-cache`): PHPStans Cache invalidiert **nicht** bei Änderungen an den Regel-Klassen, ein zwischengespeicherter Lauf würde also weiter Befunde einer Regel melden, die nichts mehr erkennt.

### Grenzen

Die Fixtures belegen das Verhalten der Regeln, nicht die Ausnutzbarkeit einer konkreten veröffentlichten Schwachstelle. Advisory-gebundene Paare tragen derzeit durchgehend `VULNERABILITY_CLASS`, weil die Advisory-Texte im Wissensspeicher die Schwachstellenklasse und die betroffene Extension nennen, nicht die konkrete Codestelle. Ein Fixture ist keine Rekonstruktion fremden Codes. Ein `PENDING`-Paar ist ein Vorschlag, kein freigegebener Nachweis.

### Advisory-Entwürfe

`npm run learn:advisories` legt generische Entwürfe unter `var/advisory-drafts/` ab. Dieses Verzeichnis ist nicht versioniert, und jeder Entwurf weist sich im Dateikopf als nicht committierbar aus. Ein Entwurf wird erst dadurch zum Nachweis, dass jemand daraus ein realistisches Paar mit `case.json` baut und der Regressionstest beide Richtungen bestätigt.

## Verifikation

`npm test` prüft Advisory-Import, Wissensgraph, MCP-Feedback, echte Rector-Transformationen, Git-Patch-Anwendbarkeit, den Review-Lebenszyklus mit simulierten GitHub-Antworten und die Regressionsfixtures aller Sicherheitsregeln. Dazu kommt die bestehende PHPStan-Prüfung der Regeln. Dass die Regressionstests tatsächlich greifen, wurde per Mutationstest in beide Richtungen belegt: Erkennung deaktiviert lässt den Vulnerable-Test fehlschlagen, pauschales Melden den Secure-Test. `learning-tests.yml` führt diesen Ablauf in CI aus. `npm run sync-ai` bleibt ein separates Kommando, damit Tests keine lokalen Editor-Konfigurationen überschreiben.

Referenzen: [Rector: Custom Rules](https://getrector.com/documentation/custom-rule), [GitHub: sichere Workflows](https://docs.github.com/en/actions/reference/security/secure-use), [GitHub: Pull Request Reviews](https://docs.github.com/en/rest/pulls/reviews).
