> **Sprache:** Deutsch · [English](../en/CONTINUOUS_LEARNING.md)

# Continuous Learning: Betrieb und Grenzen

Meilenstein 3 verbindet lokale Wissenssuche, reviewbasierte Rector-Kandidaten und GitHub-Review-Vorschläge. Meilenstein 4 ergänzt geprüfte Regressionsfixtures mit stabilen Error-Identifiern. Meilenstein 5 ergänzt den kontrollierten Austausch des Wissensbestands zwischen Projekten. Benötigt werden Node.js 20+ und PHP; die Regressionstests verwenden die im Composer-Lockfile festgelegte Security-Suite. Der aktuelle Lockfile wird in CI mit PHP 8.5 geprüft.

## Sprache der Konsolenausgabe

Jede nutzerorientierte CLI bestimmt ihre Ausgabesprache in dieser Reihenfolge:

1. `--lang en|de` – explizit, für einen einzelnen Aufruf
2. `TYPO3_AI_LANG` – projektweit, z. B. in CI oder `.envrc`
3. `LC_ALL` / `LC_MESSAGES` / `LANG` – die POSIX-Konvention, damit ein deutscher Arbeitsplatz ohne Konfiguration Deutsch bekommt
4. `en` – in CI steht `LANG` meist auf `C`; so bleiben Build-Logs und Issue-Reports für alle lesbar

```bash
npm run fixtures:status -- --lang de
export TYPO3_AI_LANG=de
```

Eine nicht unterstützte Locale wird ignoriert statt abgelehnt: Ein Werkzeug soll nicht scheitern, weil eine Maschine auf eine Sprache eingestellt ist, für die es keine Übersetzung gibt. Maschinenlesbare Ausgaben (JSON) werden nie übersetzt – Feldnamen und Statuswerte wie `PENDING` oder `CONFLICT` sind Schnittstelle, kein Fließtext.

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
* `review.status=APPROVED` verlangt `reviewed_by`, `reviewed_at` und einen `content_digest`.

Der Test prüft je Paar drei Aussagen: Das verwundbare Beispiel wird mit dem erwarteten Identifier erkannt und löst keine fremde Sicherheitsregel aus; das sichere Gegenbeispiel bleibt ohne Sicherheitsbefund; beide bleiben frei von allgemeinen Analysefehlern. Zusätzlich muss jeder deklarierte Identifier ein Paar besitzen, und keine PHP-Datei unter dem Fixture-Baum darf außerhalb eines Falls mit `case.json` liegen.

Die Analyse läuft über `typo3-security-suite/phpstan-fixtures.neon` auf Level 0, damit ein Ergebnis ausschließlich Sicherheitsbefunde enthält – nur so ist die negative Aussage über das sichere Beispiel belastbar. Der Harness verwirft vor jedem Lauf den isolierten Result-Cache (`typo3-security-suite/var/phpstan-fixtures-cache`): PHPStans Cache invalidiert **nicht** bei Änderungen an den Regel-Klassen, ein zwischengespeicherter Lauf würde also weiter Befunde einer Regel melden, die nichts mehr erkennt.

### Review durchführen

Ein Fixture-Paar ist erst dann ein freigegebener Nachweis, wenn jemand die beiden Beispiele gelesen und die Entscheidung festgehalten hat.

```bash
npm run fixtures:status
npm run fixtures:review -- --show <slug>
npm run fixtures:review -- --slug <slug> --by "Dein Name"
npm run fixtures:review -- --slug <slug> --reject --by "Dein Name" --note "Grund"
```

`--show` gibt beide Dateien samt Ursache, Herkunft und Prüfpunkten aus. Zu prüfen ist:

1. Bildet das verwundbare Beispiel eine Schwachstelle ab, die in echtem TYPO3-Code so vorkommt?
2. Trifft die in `case.json` beschriebene `root_cause` auf genau diesen Code zu?
3. Ist das sichere Gegenbeispiel fachlich gleichwertig – löst es dieselbe Aufgabe, nur sicher?
4. Stimmt die Herkunft: behauptet `origin` nicht mehr, als die Quelle hergibt?
5. Ist der erwartete Identifier die Regel, die für diese Schwachstellenklasse zuständig ist?

Dass die Regel das verwundbare Beispiel erkennt und beim sicheren schweigt, prüft bereits der Regressionstest – das ist nicht Aufgabe des Reviews.

Eine Freigabe wird an den Inhalt der beiden Beispieldateien gebunden (`review.content_digest`). Wird eine davon später geändert, verfällt die Freigabe und der Fall erscheint als `[veraltet]`; ohne diese Bindung würde ein einmal grüner Review-Status für Code bürgen, den niemand gesehen hat. `case.json` von Hand auf `APPROVED` zu setzen schlägt deshalb fehl – der Digest fehlt.

Es gibt bewusst keinen Schalter, der alle Fälle auf einmal freigibt. Ein solcher würde das Gate zur Formalie machen.

Ist der Bestand vollständig geprüft, kann der CI-Schritt scharf geschaltet werden:

```bash
npm run fixtures:status -- --require-approved
```

### Grenzen

Die Fixtures belegen das Verhalten der Regeln, nicht die Ausnutzbarkeit einer konkreten veröffentlichten Schwachstelle. Advisory-gebundene Paare tragen derzeit durchgehend `VULNERABILITY_CLASS`, weil die Advisory-Texte im Wissensspeicher die Schwachstellenklasse und die betroffene Extension nennen, nicht die konkrete Codestelle. Ein Fixture ist keine Rekonstruktion fremden Codes. Ein `PENDING`-Paar ist ein Vorschlag, kein freigegebener Nachweis.

### Advisory-Entwürfe

`npm run learn:advisories` legt generische Entwürfe unter `var/advisory-drafts/` ab. Dieses Verzeichnis ist nicht versioniert, und jeder Entwurf weist sich im Dateikopf als nicht committierbar aus. Ein Entwurf wird erst dadurch zum Nachweis, dass jemand daraus ein realistisches Paar mit `case.json` baut und der Regressionstest beide Richtungen bestätigt.

## Wissensaustausch zwischen Projekten

### Speicherort

Alle Learning-CLIs und der MCP-Server lösen den Speicherort in derselben Reihenfolge auf: expliziter Parameter (`--knowledge-dir`), dann `TYPO3_KNOWLEDGE_PATH`, dann der Repository-Speicher `.typo3-knowledge/`. Bis Meilenstein 5 schrieb der Advisory-Import unabhängig davon immer in den Repository-Speicher – importierte Advisories konnten damit in einem Verzeichnis landen, in dem niemand gesucht hat.

```bash
export TYPO3_KNOWLEDGE_PATH=/pfad/zum/gemeinsamen/store
```

### Export

```bash
npm run knowledge:export -- --dry-run
npm run knowledge:export -- --out ../typo3-knowledge-share/bundles/projekt-a.json --label projekt-a
```

Geteilt werden `advisories.json`, `learned_patterns.json` und `fixes_history.jsonl`. `graph.jsonl` wird nie exportiert: Er ist abgeleitet und wird beim Import lokal neu gebaut, sonst entstünde eine zweite Wahrheitsquelle.

Entwickler-Fixes werden standardmäßig nur im Status `APPROVED` geteilt. `PENDING` ist lokaler Arbeitsstand – ihn zu verteilen würde fremde Reviewer zwingen, über unfertige Arbeit eines Kollegen zu urteilen. `REJECTED` wird nie exportiert, auch nicht mit `--include-pending`.

**Freigabeprüfung:** Vor dem Schreiben prüft der Export jeden Eintrag auf mögliche vertrauliche Daten – private Schlüssel, Zugangsdaten im Klartext, AWS-Keys, interne Hostnamen, private IP-Adressen, lokale Benutzerpfade und E-Mail-Adressen. Bei einem Fund bricht der Export ab und nennt Eintrag, **Feld und Textausschnitt**; ohne diese Angaben könnte niemand einen echten Fund von einem Beispiel unterscheiden. Bewusst teilen lässt sich der Inhalt mit `--allow-sensitive`, was im Ergebnis als Warnung erscheint.

Dokumentierte Adressbereiche sind ausgenommen: `10.0.0.0/8` in einer Sicherheitsempfehlung ist eine Bereichsangabe, `169.254.169.254` ein Standardbeispiel. Ein Scanner, der solche Fälle meldet, erzieht Reviewer dazu, ihn durchzuwinken – das wäre schlechter als kein Scanner.

### Import

```bash
npm run knowledge:import -- --in ../typo3-knowledge-share/bundles --dry-run
npm run knowledge:import -- --in ../typo3-knowledge-share/bundles
```

`--in` nimmt eine einzelne Datei oder ein Verzeichnis. Jedes Bundle wird einzeln angewendet, damit eine fehlerhafte Datei die übrigen nicht blockiert.

Jeder eingehende Datensatz wird klassifiziert:

| Zustand | Bedeutung | Wirkung |
|---|---|---|
| `new` | Kennung lokal unbekannt | wird übernommen |
| `unchanged` | Kennung und Inhalt identisch | keine Änderung |
| `conflict` | gleiche Kennung, abweichender Inhalt | **lokaler Stand bleibt**, Konflikt wird gemeldet |
| `invalid` | Schema- oder Diff-Verletzung, Dublette im Bundle | wird abgelehnt und gemeldet |

Ein wiederholter Import derselben Daten erzeugt keine Duplikate. Konflikte und ungültige Einträge führen zu einem Exit-Code ungleich 0, verändern aber nichts. Die Identität eines Entwickler-Fixes wird beim Import **aus dem Inhalt neu berechnet**, nie aus dem Bundle übernommen – ein manipulierter Fingerprint kann sich damit nicht als anderer Fix ausgeben.

**Ein Import erteilt keine Freigabe.** Ein importierter Fix landet lokal auf `PENDING`, mit der ursprünglichen Freigabe als Herkunftsangabe unter `imported.origin_review`. Vertrauen wandert nicht mit: Eine Freigabe in Projekt A ist Herkunft, keine lokale Freigabe. Folglich kann ein Import allein auch keine Rector-Regel aktivieren – dafür ist eine lokale Freigabe über `review_developer_fix` nötig.

Nach dem Import wird der lokale Index neu gebaut (`--no-index` unterdrückt das), sodass das übernommene Wissen über dieselbe CLI- und MCP-Suche auffindbar ist wie lokales.

### Git-basierter Team-Workflow

Ein privates Repository hält je Projekt ein Bundle:

```
typo3-knowledge-share/
└── bundles/
    ├── projekt-a.json
    └── projekt-b.json
```

Eine Datei pro Projekt ist Absicht: Würden alle in dieselbe Datei exportieren, entstünde bei jedem Beitrag ein Git-Konflikt über eine generierte Datei.

**Beitragen:**

```bash
npm run knowledge:export -- --out ../typo3-knowledge-share/bundles/projekt-a.json --label projekt-a
cd ../typo3-knowledge-share
git checkout -b knowledge/projekt-a-$(date +%Y-%m-%d)
git add bundles/projekt-a.json && git commit -m "knowledge: update from projekt-a"
git push -u origin HEAD
```

Der Pull Request ist der Reviewpunkt: Im Diff sind neue Einträge und geänderte Code-Diffs lesbar. Prüfe dort auf Inhalte, die die automatische Prüfung nicht erkennen kann – Kundennamen, interne Projektbezeichnungen, Geschäftslogik im Diff-Kontext. Ein inhaltlich veränderter Fix ist ein neuer Fix und braucht ein neues Review.

**Übernehmen:**

```bash
cd ../typo3-knowledge-share && git pull
cd -
npm run knowledge:import -- --in ../typo3-knowledge-share/bundles --dry-run
npm run knowledge:import -- --in ../typo3-knowledge-share/bundles
```

Die Synchronisierung ist immer explizit. Es gibt keinen Hintergrunddienst, der fremdes Wissen unbemerkt in einen Arbeitsplatz zieht.

### Grenzen

Der Austausch verteilt Referenzmaterial, keine verifizierten Wahrheiten. Ein importierter Eintrag belegt nicht, dass ein Advisory tatsächlich veröffentlicht oder ein Fix korrekt ist – er belegt, dass jemand in einem anderen Projekt ihn erfasst hat. Die automatische Freigabeprüfung erkennt Muster, kein Geschäftsgeheimnis: Der Pull-Request-Review bleibt die eigentliche Kontrolle. Ein zentraler Wissensdienst mit authentifiziertem Netzwerkzugriff und Rollen ist nicht Teil dieser Umsetzung.

## Verifikation

`npm test` prüft Advisory-Import, Wissensgraph, MCP-Feedback, echte Rector-Transformationen, Git-Patch-Anwendbarkeit, den Review-Lebenszyklus mit simulierten GitHub-Antworten die Regressionsfixtures aller Sicherheitsregeln sowie den Austausch zwischen zwei getrennten lokalen Kopien – Übernahme, wiederholter Import, Konflikte, ungültige Daten, Freigabeprüfung und die Regel, dass ein Import keine Freigabe erteilt. Dazu kommt die bestehende PHPStan-Prüfung der Regeln. Dass die Regressionstests tatsächlich greifen, wurde per Mutationstest in beide Richtungen belegt: Erkennung deaktiviert lässt den Vulnerable-Test fehlschlagen, pauschales Melden den Secure-Test. `learning-tests.yml` führt diesen Ablauf in CI aus. `npm run sync-ai` bleibt ein separates Kommando, damit Tests keine lokalen Editor-Konfigurationen überschreiben.

Referenzen: [Rector: Custom Rules](https://getrector.com/documentation/custom-rule), [GitHub: sichere Workflows](https://docs.github.com/en/actions/reference/security/secure-use), [GitHub: Pull Request Reviews](https://docs.github.com/en/rest/pulls/reviews).
