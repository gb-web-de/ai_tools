> **Language:** English · [Deutsch](../de/CONTINUOUS_LEARNING.md)

# Continuous Learning: Operation and Limits

Milestone 3 connects local knowledge search, review-based Rector candidates and GitHub review suggestions. Milestone 4 adds verified regression fixtures with stable error identifiers. Milestone 5 adds the controlled exchange of the knowledge store between projects. Node.js 20+ and PHP are required; the regression tests use the security suite pinned in the Composer lock file. The current lock file is verified in CI with PHP 8.5.

## Console language

Every user-facing CLI resolves its output language in this order:

1. `--lang en|de` — explicit, for a single invocation
2. `TYPO3_AI_LANG` — project-wide, e.g. in CI or `.envrc`
3. `LC_ALL` / `LC_MESSAGES` / `LANG` — the POSIX convention, so a German workstation gets German without configuring anything
4. `en` — CI usually reports `LANG=C`, which keeps build logs and issue reports readable for everyone

```bash
npm run fixtures:status -- --lang de
export TYPO3_AI_LANG=de
```

An unsupported locale is ignored rather than rejected: a tool should not fail because a machine is set to a language it has no translation for. Machine-readable output (JSON) is never translated — field names and status values such as `PENDING` or `CONFLICT` are part of the interface, not prose.

## Local knowledge graph

```bash
npm run knowledge:index
npm run knowledge:query -- --query "tenant isolation" --limit 5
npm run knowledge:query -- --query "file upload" --type FILE_UPLOAD
```

`advisories.json`, `learned_patterns.json` and `fixes_history.jsonl` remain the authoritative sources. `graph.jsonl` is an atomically replaceable, reproducible snapshot with document, concept, domain and remediation nodes plus their relations. Search builds the graph from the current sources, so a newly stored fix is found without manual re-indexing. A corrupted store raises an error and is never overwritten.

Search combines weighted word matches with a fixed German/English term taxonomy, so "Mandantentrennung" also finds "tenant isolation" and QuerySettings. Results carry a score, matching terms and concepts, provenance and related documents. This is a local, term-based form of semantic search; no embeddings, external model calls or general language-understanding guarantees are offered. Queries are capped at 50 results; `totalMatched` reports the untruncated count.

`query_security_knowledge` uses the same search in the MCP server. The existing response fields `advisories`, `learned_patterns` and `developer_fixes` are preserved and contain the capped result list. `results`, ranking and relations are new.

The knowledge path is set via `TYPO3_KNOWLEDGE_PATH` or, for the CLIs, `--knowledge-dir`. Source data is reference material, not agent instructions. The seeded advisories contain CVE placeholders among other things; an entry in the store is not evidence of a published advisory or a verified fix.

## Developer feedback and review

`record_developer_fix` requires `title`, `domain`, `finding_type`, `diff` and `explanation`. The diff needs file headers and matching hunk lengths, must not exceed 200,000 UTF-8 bytes, and must contain no traversal paths. Writes happen under an exclusive file lock and through atomic file replacement. A SHA-256 fingerprint prevents duplicates.

New fixes arrive as `PENDING`. `review_developer_fix` approves or rejects an existing fix:

```json
{
  "fix_id": "FIX-<id from record_developer_fix>",
  "review_status": "APPROVED",
  "reviewed_by": "reference to the actual reviewer"
}
```

`APPROVED` and `reviewed_by` are assertions by a trusted local caller — not a cryptographic signature and not an identity check. They may only be set after an actual review. Older fixes without an explicit approval do not count toward rule generation. After a process is killed, `.learning.lock` may remain; make sure no writing process is still running before removing it by hand.

## Rector candidates from recurring fixes

```bash
npm run learn:rector -- --dry-run
npm run learn:rector
```

The first supported pattern is `unserialize_disallow_classes`. It requires at least two distinct, explicitly approved fixes with different `source` references. Both must carry `finding_type: DESERIALIZATION` and `remediation: unserialize_disallow_classes`. The changed lines must match the supported shape exactly, for example:

```diff
--- a/Classes/Decoder.php
+++ b/Classes/Decoder.php
@@ -10 +10 @@
-return \unserialize($payload);
+return \unserialize($payload, ['allowed_classes' => false]);
```

The generated PHP rule comes from a fixed local template; patch or advisory text is never embedded as PHP code. The rule only touches explicit native `\unserialize` calls with one positional argument. Existing options, named arguments, argument unpacking and unrelated functions are left alone. The change can affect applications that deserialize objects on purpose, which is why candidates stay `EXPERIMENTAL`. For new data formats, prefer JSON.

Before anything is emitted, the real installed Rector version runs against isolated before/after and safe-code fixtures. Idempotency and PHP syntax are checked as well. A failure prevents the bundle from being published. Successful bundles live in `typo3-security-suite/generated/rector/<content-hash>/` and contain the rule, its config, fixtures and a manifest with evidence references and file hashes. Repeated generation is stable; an existing bundle that was edited by hand is never overwritten.

Without matching evidence the command reports `INSUFFICIENT_EVIDENCE` and produces nothing. There is no invented production training data. An approval does not activate a global rule. After inspection, a candidate can be tried deliberately:

```bash
php typo3-security-suite/vendor/bin/rector process /path/to/extension \
  --config typo3-security-suite/generated/rector/<content-hash>/rector.php --dry-run
```

## PR audit and GitHub suggestions

The workflows and their scripts must be present on the default branch first. `security-audit.yml` runs on pull request changes with read permissions. It uses the tooling of the base commit and reads the pull request content from Git objects. PHP is only tokenized, never included or executed. A report and a `security-fixes.patch` are stored as an artifact. Findings or an incomplete analysis make the audit step fail.

`security-review.yml` reacts through `workflow_run`. The reviewer runs from the default branch, receives only the necessary read and pull-request write permissions, and recomputes its suggestions from GitHub file blobs. It executes neither downloaded artifacts nor pull request code, which is what makes fork pull requests safe to support. The reviewer verifies workflow origin, repository, an open pull request and the current head commit; if anything changed in the meantime, or a bot review already exists, nothing is published.

The lean PR scanner currently supports two classes:

| Class | Finding and suggestion |
| --- | --- |
| Fluid XSS | Reports `f:format.raw` and `escapeOutput="false"`. Suggestions only for single raw expressions in HTML text context; no automatic JS, CSS, attribute or complex ViewHelper repairs. |
| Deserialization | Detects native `\unserialize($variable)` calls through PHP tokens and suggests `allowed_classes => false`. Strings and comments are not treated as calls. |

Only added lines receive comments. At most 40 inline comments are published per review. The scanner limits itself to 300 changed files and 500 KB per file; missing patches, size limits and PHP parse errors are reported as an incomplete analysis. Test fixtures, dependencies and Rector templates are excluded. The more thorough PHPStan and Fluid tooling stays available for separate audits; this bot does not replace a full security review.

Checking a pull request diff locally, without GitHub write access:

```bash
npm run audit:pr -- --base <40-char-base-sha> --head <40-char-head-sha>
git apply --check --unidiff-zero .cache/security-review/security-fixes.patch
```

The CLI compares against the merge base of the two commits and does not modify the checkout. Suggestions must be judged and accepted manually. Repository policy must grant the reviewer `pull-requests: write`; no automatic merge or commit action is configured.

## Regression fixtures for security rules

Every PHPStan security rule owns a fixture pair under `tests/fixtures/regression/<slug>/`: a realistic vulnerable example and a functionally equivalent secure counterpart, both in idiomatic TYPO3 structure.

```bash
npm run test:regression
npm run fixtures:status
npm run fixtures:status -- --json
```

```
tests/fixtures/regression/<slug>/
├── case.json
├── Vulnerable/Classes/<TYPO3 path>/<Class>.php
└── Secure/Classes/<TYPO3 path>/<Class>.php
```

The path is part of the test setup, not decoration: several rules evaluate the file path (`Classes/Controller`, `Classes/Middleware`, `Classes/Service`, `ViewHelpers`). An example outside that structure is not detected by the rule responsible for it.

`case.json` describes the rule, the expected identifier, the cause, the provenance and the review state. The schema is validated on every test run:

* `expected_identifier` must be defined in `rules/SecurityRuleIdentifier.php`. This rules out a test asserting against an identifier no rule can emit.
* `origin.kind=ADVISORY` requires `advisory_id` and an https link; `origin.kind=RULE_CONTRACT` requires a named `reference`.
* `origin.causal_fidelity` separates `DOCUMENTED_ROOT_CAUSE` (the example reproduces the cause the advisory describes, evidenced by `origin.documented_cause`) from `VULNERABILITY_CLASS` (the example reproduces the vulnerability class). The stronger claim without evidence text is rejected.
* `review.status=APPROVED` requires `reviewed_by`, `reviewed_at` and a `content_digest`.

Per pair, the test asserts three things: the vulnerable example is detected with the expected identifier and trips no foreign security rule; the secure counterpart produces no security finding; both stay free of general analysis errors. In addition, every declared identifier must own a pair, and no PHP file below the fixture root may sit outside a case with a `case.json`.

The analysis runs through `typo3-security-suite/phpstan-fixtures.neon` at level 0, so a result contains security findings only — that is what makes the negative statement about the secure example meaningful. The harness discards its isolated result cache (`typo3-security-suite/var/phpstan-fixtures-cache`) before every run: PHPStan's cache does **not** invalidate on changes to the rule classes, so a cached run would keep reporting findings for a rule that detects nothing.

### Performing a review

A fixture pair only becomes approved evidence once a person has read both examples and recorded the decision.

```bash
npm run fixtures:status
npm run fixtures:review -- --show <slug>
npm run fixtures:review -- --slug <slug> --by "Your Name"
npm run fixtures:review -- --slug <slug> --reject --by "Your Name" --note "reason"
```

`--show` prints both files together with the cause, the provenance and the check list. What to judge:

1. Does the vulnerable example show a flaw that occurs this way in real TYPO3 code?
2. Does the `root_cause` stated in `case.json` apply to exactly this code?
3. Is the secure counterpart functionally equivalent — same job, done safely?
4. Is the provenance right: does `origin` claim no more than the source supports?
5. Is the expected identifier the rule responsible for this vulnerability class?

That the rule detects the vulnerable example and stays silent on the secure one is already covered by the regression test — not part of the review.

An approval is bound to the content of the two example files (`review.content_digest`). If either is edited later, the approval expires and the case shows as `[stale]`; without that binding, a once-green review status would vouch for code nobody has seen. Setting `APPROVED` by hand in `case.json` therefore fails, because the digest is missing.

There is deliberately no switch that approves every case at once. It would turn the gate into a formality.

Once the corpus is fully reviewed, the CI step can be armed:

```bash
npm run fixtures:status -- --require-approved
```

### Limits

The fixtures evidence the behaviour of the rules, not the exploitability of a specific published vulnerability. Advisory-bound pairs currently all carry `VULNERABILITY_CLASS`, because the advisory texts in the knowledge store name the vulnerability class and the affected extension, not the concrete code location. A fixture is not a reconstruction of someone else's code. A `PENDING` pair is a proposal, not approved evidence.

### Advisory drafts

`npm run learn:advisories` writes generic drafts to `var/advisory-drafts/`. That directory is not versioned, and every draft states in its header that it must not be committed. A draft only becomes evidence when someone turns it into a realistic pair with a `case.json` and the regression test confirms both directions.

## Knowledge exchange between projects

### Storage location

Every learning CLI and the MCP server resolve the storage location in the same order: explicit argument (`--knowledge-dir`), then `TYPO3_KNOWLEDGE_PATH`, then the repository store `.typo3-knowledge/`. Until milestone 5 the advisory import always wrote to the repository store regardless — imported advisories could end up in a directory nobody was searching.

```bash
export TYPO3_KNOWLEDGE_PATH=/path/to/the/shared/store
```

### Export

```bash
npm run knowledge:export -- --dry-run
npm run knowledge:export -- --out ../typo3-knowledge-share/bundles/project-a.json --label project-a
```

Shared are `advisories.json`, `learned_patterns.json` and `fixes_history.jsonl`. `graph.jsonl` is never exported: it is derived and rebuilt on import, so shipping it would create a second source of truth.

Developer fixes are shared only in status `APPROVED` by default. `PENDING` is local working state — distributing it would push another project's reviewers into judging a colleague's unfinished work. `REJECTED` is never exported, not even with `--include-pending`.

**Release check:** before writing, the export scans every record for possibly confidential content — private keys, plaintext credentials, AWS keys, internal hostnames, private IP addresses, local user paths and e-mail addresses. On a hit the export aborts and names the record, the **field and an excerpt**; without those, nobody could tell a real leak from an example. Sharing anyway is possible with `--allow-sensitive`, which appears as a warning in the result.

Documented address ranges are exempt: `10.0.0.0/8` in a security recommendation is a range, and `169.254.169.254` is a textbook example. A scanner that flags those trains reviewers to wave it through — worse than no scanner.

### Import

```bash
npm run knowledge:import -- --in ../typo3-knowledge-share/bundles --dry-run
npm run knowledge:import -- --in ../typo3-knowledge-share/bundles
```

`--in` accepts a single file or a directory. Each bundle is applied on its own, so a malformed file does not block the rest.

Every incoming record is classified:

| State | Meaning | Effect |
|---|---|---|
| `new` | identifier unknown locally | adopted |
| `unchanged` | identifier and content identical | no change |
| `conflict` | same identifier, different content | **local state wins**, the conflict is reported |
| `invalid` | schema or diff violation, duplicate within the bundle | rejected and reported |

Re-importing the same data creates no duplicates. Conflicts and invalid records produce a non-zero exit code but change nothing. The identity of a developer fix is **recomputed from its content** on import, never taken from the bundle — a tampered fingerprint cannot masquerade as a different fix.

**An import grants no approval.** An imported fix lands locally as `PENDING`, with the original approval preserved as provenance under `imported.origin_review`. Trust does not travel: an approval in project A is provenance, not a local release. Consequently an import alone cannot arm a Rector rule either — that requires a local approval through `review_developer_fix`.

After an import the local index is rebuilt (`--no-index` suppresses it), so the adopted knowledge is findable through the same CLI and MCP search as local knowledge.

### Git-based team workflow

A private repository holds one bundle per project:

```
typo3-knowledge-share/
└── bundles/
    ├── project-a.json
    └── project-b.json
```

One file per project is deliberate: if everyone exported into the same file, every contribution would produce a Git conflict over a generated file.

**Contributing:**

```bash
npm run knowledge:export -- --out ../typo3-knowledge-share/bundles/project-a.json --label project-a
cd ../typo3-knowledge-share
git checkout -b knowledge/project-a-$(date +%Y-%m-%d)
git add bundles/project-a.json && git commit -m "knowledge: update from project-a"
git push -u origin HEAD
```

The pull request is the review point: new records and changed code diffs are readable in the diff. Check there for content the automated scan cannot recognize — customer names, internal project designations, business logic in the diff context. A fix whose content changed is a new fix and needs a new review.

**Adopting:**

```bash
cd ../typo3-knowledge-share && git pull
cd -
npm run knowledge:import -- --in ../typo3-knowledge-share/bundles --dry-run
npm run knowledge:import -- --in ../typo3-knowledge-share/bundles
```

Synchronization is always explicit. No background service pulls someone else's knowledge into a workstation unnoticed.

### Limits

The exchange distributes reference material, not verified truths. An imported record does not evidence that an advisory was actually published or that a fix is correct — it evidences that someone in another project recorded it. The automated release check recognizes patterns, not business secrets: the pull request review remains the actual control. A central knowledge service with authenticated network access and roles is not part of this implementation.

## Verification

`npm test` covers advisory import, the knowledge graph, MCP feedback, real Rector transformations, Git patch applicability, the review lifecycle with simulated GitHub responses, the regression fixtures of all security rules, and the exchange between two separate local copies — adoption, repeated import, conflicts, invalid data, the release check and the rule that an import grants no approval. On top of that comes the existing PHPStan check of the rules. That the regression tests actually bite was established by mutation test in both directions: disabling detection fails the vulnerable assertion, reporting unconditionally fails the secure one. `learning-tests.yml` runs this in CI. `npm run sync-ai` stays a separate command so tests never overwrite local editor configuration.

References: [Rector: Custom Rules](https://getrector.com/documentation/custom-rule), [GitHub: secure workflows](https://docs.github.com/en/actions/reference/security/secure-use), [GitHub: Pull Request Reviews](https://docs.github.com/en/rest/pulls/reviews).
