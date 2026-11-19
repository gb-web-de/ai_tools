# Ein TYPO3-Projekt selbst prüfen

Befehle und Prompts zum Kopieren, nach Schicht getrennt. Alle Befehle lesen nur; im Projekt wird nichts geändert (Ausnahme: der letzte Abschnitt).

```bash
export AI_TOOLS=~/Projekte/ai_tools        # ai_tools auf aktuellem master
export P=~/Projekte/mein-projekt           # zu prüfendes Projekt
```

Der MCP-Server und die PHPStan-Regeln laufen mit dem Stand des ai_tools-Checkouts, aus dem sie gebaut wurden. Vor einer Prüfung also:

```bash
git -C $AI_TOOLS pull && npm --prefix $AI_TOOLS ci && npm --prefix $AI_TOOLS run build
composer install -d $AI_TOOLS/typo3-security-suite
```

## 1. Docker und Debian

```bash
ddev version
docker image ls --format '{{.Repository}}:{{.Tag}}  {{.CreatedSince}}' | grep -E 'ddev|mariadb|mysql|php|nginx'
ddev exec 'head -2 /etc/os-release; php -v | head -1'
grep -nE 'docker\.sock|:latest|\$\{[A-Z0-9_]*(PASS|SECRET|KEY|TOKEN)[A-Z0-9_]*:-' $P/devops/*.y*ml $P/.ddev/*.y*ml
grep -nE '^FROM|^USER|^ADD|curl .*\| *(ba)?sh' $(find $P -name 'Dockerfile*' -not -path '*/vendor/*' -not -path '*/node_modules/*')
```

CVE-Scan der Images und Konfiguration mit trivy (nicht vorinstalliert; installiert nach `~/.local/bin`, ohne sudo):

```bash
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b ~/.local/bin
trivy image --severity HIGH,CRITICAL ddev/ddev-webserver:<version>
trivy image --severity HIGH,CRITICAL ghcr.io/<owner>/<image>:<tag>
trivy config $P/devops
```

Prompt:

> Prüfe in `<Projekt>` die Docker-Schicht: `.ddev/config.yaml`, alle Dockerfiles und Compose-Dateien. Melde EOL-Basisimages, Downloads ohne Version oder Prüfsumme, Container ohne `USER`, Docker-Socket-Mounts, Ports auf allen Interfaces und Zugangsdaten in Standardwerten, jeweils mit Datei:Zeile. Ändere nichts.

## 2. Composer und npm

```bash
composer audit --locked -d $P
composer outdated --direct --locked -d $P
find $P -name package-lock.json -not -path '*/node_modules/*' -not -path '*/vendor/*' -not -path '*/.claude/*' -execdir npm audit \;
```

Prompt:

> Führe in `<Projekt>` `composer audit` und für jede package-lock.json `npm audit` aus. Trenne Laufzeit- von Build-Abhängigkeiten und prüfe, ob eine gemeldete Bibliothek im ausgelieferten Frontend-Build steckt und mit Angreiferdaten erreichbar ist.

## 3. TYPO3-Core und Extensions

```bash
composer show -d $P --locked typo3/cms-core | grep -E '^versions'
composer show -d $P --locked --direct
git -C $P describe --tags --abbrev=0                 # zuletzt ausgerollter Stand
cd $AI_TOOLS && npm run learn:advisories && npm run knowledge:index
npm run knowledge:query -- --query "ke_search"
```

`composer audit` kennt die TYPO3-CORE-SA und TYPO3-EXT-SA über die Packagist-Advisories. `learn:advisories` legt sie zusätzlich klassifiziert im Wissensspeicher ab.

Prompt:

> Nutze `sync_security_advisories` (limit 30) und vergleiche die Advisories mit den Versionen in `<Projekt>/composer.lock`. Prüfe auch, ob der zuletzt ausgerollte Git-Tag die gepatchte Version enthält.

## 4. Eigener Code

```bash
cd $AI_TOOLS/typo3-security-suite
vendor/bin/phpstan analyse -c phpstan.neon --error-format=json --no-progress --memory-limit=2G \
  $P/packages/*/Classes $P/packages/*/Configuration \
  | jq -r '.files | to_entries[] | .key as $f | .value.messages[] | select(.identifier | startswith("typo3Security.")) | "\(.identifier) \($f):\(.line)"'
python3 scripts/scan_fluid_xss.py $P/packages/<ext>/Resources/Private
cd $AI_TOOLS && npm run scan:assets -- $P/packages/<ext>
git -C $P grep -nIlE '(ghp_|github_pat_|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY|sk-ant-)' -- . ':!vendor'
```

PHPStan läuft hier bewusst ohne `--autoload-file`: Mit der `vendor/autoload.php` eines TYPO3-Projekts bricht es ab, weil der class-alias-loader doppelt registriert wird. Die Sicherheitsregeln greifen auch ohne.

Prompts:

> Prüfe `<Projekt>` mit dem MCP typo3-security: `audit_typo3_instance` für das Projekt, `check_fluid_templates` und `scan_frontend_assets` für jede eigene Extension unter `packages/`, dazu die PHPStan-Sicherheitsregeln wie in docs/de/PROJECT_AUDIT.md. Bewerte jeden Fund als echt oder Fehlalarm (Datei:Zeile, Begründung), sortiere nach Schwere, ändere nichts.

> Lies Controller, Middlewares und Event-Listener der eigenen Extensions von Hand: Wo kommen Request-Daten an, und wo wird geprüft, ob der Aufrufer darf (Login, Besitz des Datensatzes, Token per `hash_equals`)? Solche Logikfehler finden die Scanner nicht.

## 5. Pull Requests

```bash
cd $P && node $AI_TOOLS/scripts/security-audit-pr.js \
  --base $(git rev-parse origin/master) --head $(git rev-parse HEAD) --output ~/security-reviews/$(basename $P)
```

## 6. Einmalig: Regeln und MCP ins Projekt

```bash
node $AI_TOOLS/scripts/setup-project.js $P
```

Schreibt `CLAUDE.md`, `.cursorrules`, `AGENTS.md` und MCP-Konfigurationen ins Projekt. Auf einem eigenen Branch ausführen.

## Grenzen

- `run_phpstan_security_audit` und `analyze_typo3_extension` (MCP) übergeben die Projekt-Autoload-Datei und scheitern deshalb an Composer-Projekten mit TYPO3; bis das behoben ist, den direkten Aufruf aus Abschnitt 4 nehmen.
- Ohne trivy oder grype gibt es keinen CVE-Scan der Systempakete in den Images.
- Die Scanner finden Muster, keine Logikfehler wie fehlende Token- oder Besitzprüfungen.
