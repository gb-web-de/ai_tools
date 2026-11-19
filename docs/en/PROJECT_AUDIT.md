# Auditing a TYPO3 project yourself

Commands and prompts to copy, one section per layer. All commands only read; nothing in the project changes (except in the last section).

```bash
export AI_TOOLS=~/Projekte/ai_tools        # ai_tools on current master
export P=~/Projekte/my-project             # project to audit
```

The MCP server and the PHPStan rules run with the state of the ai_tools checkout they were built from. Before an audit:

```bash
git -C $AI_TOOLS pull && npm --prefix $AI_TOOLS ci && npm --prefix $AI_TOOLS run build
composer install -d $AI_TOOLS/typo3-security-suite
```

## 1. Docker and Debian

```bash
ddev version
docker image ls --format '{{.Repository}}:{{.Tag}}  {{.CreatedSince}}' | grep -E 'ddev|mariadb|mysql|php|nginx'
ddev exec 'head -2 /etc/os-release; php -v | head -1'
grep -nE 'docker\.sock|:latest|\$\{[A-Z0-9_]*(PASS|SECRET|KEY|TOKEN)[A-Z0-9_]*:-' $P/devops/*.y*ml $P/.ddev/*.y*ml
grep -nE '^FROM|^USER|^ADD|curl .*\| *(ba)?sh' $(find $P -name 'Dockerfile*' -not -path '*/vendor/*' -not -path '*/node_modules/*')
```

CVE scan of images and configuration with trivy (not preinstalled; installs to `~/.local/bin`, no sudo):

```bash
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b ~/.local/bin
trivy image --severity HIGH,CRITICAL ddev/ddev-webserver:<version>
trivy image --severity HIGH,CRITICAL ghcr.io/<owner>/<image>:<tag>
trivy config $P/devops
```

Prompt:

> Audit the Docker layer of `<project>`: `.ddev/config.yaml`, all Dockerfiles and compose files. Report EOL base images, downloads without version or checksum, containers without `USER`, Docker socket mounts, ports bound to all interfaces and credentials in default values, each with file:line. Change nothing.

## 2. Composer and npm

```bash
composer audit --locked -d $P
composer outdated --direct --locked -d $P
find $P -name package-lock.json -not -path '*/node_modules/*' -not -path '*/vendor/*' -not -path '*/.claude/*' -execdir npm audit \;
```

Prompt:

> Run `composer audit` in `<project>` and `npm audit` for every package-lock.json. Separate runtime from build dependencies and check whether a reported library ships in the frontend build and is reachable with attacker data.

## 3. TYPO3 core and extensions

```bash
composer show -d $P --locked typo3/cms-core | grep -E '^versions'
composer show -d $P --locked --direct
git -C $P describe --tags --abbrev=0                 # last deployed state
cd $AI_TOOLS && npm run learn:advisories && npm run knowledge:index
npm run knowledge:query -- --query "ke_search"
```

`composer audit` knows TYPO3-CORE-SA and TYPO3-EXT-SA through the Packagist advisories. `learn:advisories` also stores them, classified, in the knowledge store.

Prompt:

> Use `sync_security_advisories` (limit 30) and compare the advisories with the versions in `<project>/composer.lock`. Also check whether the last deployed Git tag contains the patched version.

## 4. Own code

```bash
cd $AI_TOOLS/typo3-security-suite
vendor/bin/phpstan analyse -c phpstan.neon --error-format=json --no-progress --memory-limit=2G \
  $P/packages/*/Classes $P/packages/*/Configuration \
  | jq -r '.files | to_entries[] | .key as $f | .value.messages[] | select(.identifier | startswith("typo3Security.")) | "\(.identifier) \($f):\(.line)"'
python3 scripts/scan_fluid_xss.py $P/packages/<ext>/Resources/Private
cd $AI_TOOLS && npm run scan:assets -- $P/packages/<ext>
git -C $P grep -nIlE '(ghp_|github_pat_|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY|sk-ant-)' -- . ':!vendor'
```

PHPStan deliberately runs without `--autoload-file` here: with the `vendor/autoload.php` of a TYPO3 project it aborts because the class alias loader gets registered twice. The security rules work without it.

Prompts:

> Audit `<project>` with the typo3-security MCP: `audit_typo3_instance` for the project, `check_fluid_templates` and `scan_frontend_assets` for every own extension under `packages/`, plus the PHPStan security rules as in docs/en/PROJECT_AUDIT.md. Rate every finding as real or false positive (file:line, reason), sort by severity, change nothing.

> Read the controllers, middlewares and event listeners of the own extensions by hand: where does request data arrive, and where is it checked that the caller may act (login, record ownership, token via `hash_equals`)? The scanners do not find logic flaws like these.

## 5. Pull requests

```bash
cd $P && node $AI_TOOLS/scripts/security-audit-pr.js \
  --base $(git rev-parse origin/master) --head $(git rev-parse HEAD) --output ~/security-reviews/$(basename $P)
```

## 6. One-off: rules and MCP into the project

```bash
node $AI_TOOLS/scripts/setup-project.js $P
```

Writes `CLAUDE.md`, `.cursorrules`, `AGENTS.md` and MCP configurations into the project. Run it on a branch of its own.

## Limits

- `run_phpstan_security_audit` and `analyze_typo3_extension` (MCP) pass PHPStan the autoload file of the project. If PHPStan aborts with it, as it does on TYPO3 projects because the class alias loader gets registered twice, both tools run a second time without that file. PHPStan then knows only the TYPO3 core: classes from third-party extensions and the rest of the project are unknown, and the answer contains many `STATIC_ANALYSIS` entries that are not security findings (for example "unknown class"). Security findings are the entries whose message starts with `SECURITY`; the type does not tell them apart. The direct call from section 4 shows only the security rules and is easier to read.
- Without trivy or grype there is no CVE scan of the system packages in the images.
- The scanners find patterns, not logic flaws such as missing token or ownership checks.
