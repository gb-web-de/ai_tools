> **Language:** English · [Deutsch](../de/SELF_LEARNING_ARCHITECTURE.md)

# Autonomous & Self-Learning TYPO3 AI Security Architecture
## Master documentation: continuous learning, vulnerability intelligence & self-healing

> **Status:** Milestones 1–5 implemented (milestone 4 still awaits the human review of the fixtures); L4/L5 remain to be built out step by step
> **Target systems:** TYPO3 v12 / v13 / v14  
> **Integrations:** Model Context Protocol (MCP), Cursor, Claude Code, Windsurf, GitHub Copilot, PHPStan AST, Rector  

---

## Table of contents
1. [Executive summary (management & strategy)](#1-executive-summary)
2. [The architecture of self-learning (system perspective)](#2-the-architecture-of-self-learning)
3. [Security & DevSecOps perspective](#3-security--and-devsecops-perspective)
4. [AI & agent perspective (in-context evolution)](#4-ai--and-agent-perspective)
5. [Developer experience & human-in-the-loop](#5-developer-experience--human-in-the-loop)
6. [The 5 stages of continuous learning](#6-the-5-stages-of-continuous-learning)
7. [Concrete technical building blocks](#7-concrete-technical-building-blocks)
8. [Roadmap to full automation](#8-roadmap-to-full-automation)

---

## 1. Executive summary

### Why traditional approaches fail
Classic security checks in TYPO3 agencies suffer from three structural problems:
1. **Static rules age**: CVEs and new attack patterns (complex ViewHelper SSTIs, TCA injections, deserialization chains) appear weekly. Static linters are always behind.
2. **AI knowledge cutoff**: Commercial LLMs were trained on code that is months old. They repeat outdated TYPO3 patterns (`$GLOBALS['TYPO3_DB']`, unprotected `@ignorevalidation` actions).
3. **Black holes around mistakes**: When a developer fixes a security bug by hand, or a pentest finds a weakness, that knowledge stays in the developer's head or in a PDF report — the agency's other projects learn nothing from it.

### The vision: the self-hardening TYPO3 development environment
A system that:
* **learns continuously**: ingests new TYPO3 security advisories (TYPO3-PSA / TYPO3-EXT-SA), understands them semantically and synthesizes them into rules.
* **learns from its own mistakes**: when PHPStan or the MCP server finds a weakness, the case is stored as a test fixture so the AI never generates that mistake again.
* **heals actively**: does not merely flag weaknesses but repairs them through AST transformations (Rector / Python fixer) and validated patches.
* **synchronizes the whole fleet**: findings from project A become available within minutes in every Cursor, Claude and Windsurf instance of every developer in project B.

---

## 2. The architecture of self-learning

The system rests on a **closed-loop feedback cycle**:

```
                        ┌──────────────────────────────────────────────┐
                        │   1. SENSE (threat detection)                │
                        │   - TYPO3 security advisories (RSS / API)    │
                        │   - PHPStan AST scan results                 │
                        │   - Developer feedback & false positives     │
                        └──────────────────────┬───────────────────────┘
                                               │
                                               ▼
                        ┌──────────────────────────────────────────────┐
                        │    2. DISTILL (knowledge distillation)       │
                        │   - LLM-assisted pattern extraction          │
                        │   - Deriving: vulnerable vs. hardened        │
                        │   - Generating new rules in ai-rules/        │
                        └──────────────────────┬───────────────────────┘
                                               │
                                               ▼
                        ┌──────────────────────────────────────────────┐
                        │    3. VERIFY (synthesis & test)              │
                        │   - Creating a test fixture                  │
                        │   - Validation: does the rule fire cleanly?  │
                        │   - Check: are there false positives?        │
                        └──────────────────────┬───────────────────────┘
                                               │
                                               ▼
                        ┌──────────────────────────────────────────────┐
                        │    4. DEPLOY & SYNC (distribution)           │
                        │   - npm run sync-ai                          │
                        │   - Update for Cursor, Claude, Copilot       │
                        │   - MCP server memory update                 │
                        └──────────────────────┬───────────────────────┘
                                               │
                                               ▼
                        ┌──────────────────────────────────────────────┐
                        │    5. HEAL (self-healing / remediation)      │
                        │   - MCP tool: fix_fluid_xss                  │
                        │   - Rector auto-patching                     │
                        │   - Verified pull requests                   │
                        └──────────────────────────────────────────────┘
```

---

## 3. Security & DevSecOps perspective

From a security engineer's point of view, a learning system has to be **deterministic**, **traceable** and **tamper-resistant**.

### A. Threat model & ingestion sources
The system continuously consumes four data streams:
1. **Official TYPO3 security feed**: `https://news.typo3.com/security/rss-security`
   * Contains core advisories (TYPO3-PSA) and extension advisories (TYPO3-EXT-SA).
2. **Packagist security advisories / GitHub Advisory Database (GHSA)**:
   * Machine-readable CVEs, affected version ranges and commit diffs of the fixes.
3. **Internal audit findings (CI/CD)**:
   * Aggregated JSON output of `audit_typo3_instance` and `run_phpstan_security_audit` across all pipeline runs.
4. **Human review diffs**:
   * Git commits tagged `fix(security): ...`, or pull requests rejected in code review.

### B. Validation against false positives (the "immune system hurdle")
An AI must not invent rules that stall the build. Every newly learned rule passes a **gatekeeping procedure**:
1. **Vulnerability fixture test**: the rule *must* detect the vulnerable code fragment.
2. **Safe code regression test**: the rule *must not* fire on valid, secure TYPO3 code (core classes or existing clean extensions).
3. **Confidence scoring**: new rules start as `EXPERIMENTAL` (a warning that requires explanation in MCP) before proven precision promotes them to `STRICT` (build blocker).

---

## 4. AI & agent perspective

How does a system built on language models "learn" without retraining model weights for six figures (fine-tuning)?

### A. Dynamic in-context learning & few-shot retrieval
The AI learns through **structured recall (episodic memory)**:
* Asked to *"create an Extbase controller with file upload"*, it queries the knowledge module through the MCP server before writing:
  ```json
  // MCP Call: get_security_context
  {
    "domain": "file_upload",
    "framework": "typo3_v13"
  }
  ```
* The system returns the exact **anti-patterns** and the **gold-standard implementation**:
  * ❌ *Anti-pattern:* `move_uploaded_file()`, unrestricted file extensions, storing in the web root.
  * ✅ *Gold standard:* FAL `ResourceFactory`, MIME-type validation, storing in a protected storage.

### B. The reflection & correction pattern (generate → critique → verify)
Instead of generating code blindly, the generated agent instructions (`AGENTS.md`) enforce a three-stage process:
1. **Draft**: the AI produces the source code.
2. **Self-critique via MCP**: the AI calls `run_phpstan_security_audit` on the temporary draft.
3. **Self-repair before output**: if violations are reported (an unprotected QueryBuilder where, say), the AI corrects itself before the developer ever sees the code.

---

## 5. Developer experience & human-in-the-loop

Self-learning systems often fail on poor UX. Developers must not be slowed down by manual documentation duties.

### A. Frictionless interaction in the editor
* **In Cursor / Windsurf / VS Code**: developers work normally. When the AI proposes code, the synchronized `.cursorrules` have already preconditioned it.
* **When the linter complains**: the developer presses `Alt+Enter` or asks the AI: *"fix the security warning on line 42"*. The AI uses the MCP tool `run_phpstan_security_audit`, understands the AST error and repairs it precisely.

### B. Developer corrections as training data (active feedback loop)
When a developer decides *"in this specific case `f:format.raw()` is safe, because the value is guaranteed by an enum array"*:
* They add a semantic comment:
  ```html
  <!-- typo3-security-suppress: XSS_RAW_OUTPUT reason: Enum strictly validated in Domain Model -->
  {statusIcon -> f:format.raw()}
  ```
* The system records the case in `.typo3-security-knowledge/exceptions.json`. The AI learns from it: *"when an enum value is rendered, the risk is lower"*.

---

## 6. The 5 stages of continuous learning

| Stage | Maturity | How it works | Current project status |
| :---: | :--- | :--- | :---: |
| **L1** | **Static rules** | Fixed PHPStan rules, regex scanners, manual documentation. | ✅ **Reached** |
| **L2** | **Multi-AI synchronization** | Single source of truth (`ai-rules/`), automatic generation of Cursor, Claude, Copilot and Windsurf configs. | ✅ **Reached** |
| **L3** | **Threat ingestion** | MCP reads TYPO3 security advisories and makes them available to the AI. | ✅ **Reached** |
| **L4** | **Knowledge distillation & fixture evolution** | New advisories generate test fixtures and drafts of new PHPStan rules; CI failures are learned as fixtures. | 🧪 **Partly implemented** |
| **L5** | **Fully autonomous self-healing (auto-remediation)** | AI detects gaps fleet-wide, builds Rector/AST fixes, verifies them in isolated containers and files finished PRs. | 🎯 **Target vision** |

---

## 7. Concrete technical building blocks

Three core modules carry stages 4 and 5:

### Block 1: the advisory knowledge distiller (`scripts/learn-advisories.js`)
A script that walks the TYPO3 RSS advisories and first analyses them deterministically against an approved security taxonomy. Only known classes produce `EXPERIMENTAL` fixtures; unknown content stays `UNCLASSIFIED` and needs human review:
```typescript
// Flow:
// 1. Fetch advisory TYPO3-EXT-SA-2026-004
// 2. Extract:
//    - Type: SQL injection in repositories
//    - Attack vector: unprotected ORDER BY clause
//    - Code before: $queryBuilder->orderBy($userInput)
//    - Code after: in-array allow-list validation
// 3. Write an EXPERIMENTAL draft to var/advisory-drafts/ (untracked)
// 4. Human review: create a realistic pair under tests/fixtures/regression/<slug>/
//    with a case.json; only the regression test turns it into evidence
// 5. Extend ai-rules/01-security.md with the new pitfall
// 6. Trigger npm run sync-ai
```

### Block 2: local knowledge store (`.typo3-knowledge/`)
A lightweight SQLite or JSONL database in the repository:
```
.typo3-knowledge/
├── vulnerabilities.jsonl    # Learned vulnerability patterns with before/after code
├── fixes_history.jsonl      # Successfully applied auto-fixes & diffs
└── false_positives.jsonl    # Exceptions marked manually by developers
```

### Block 3: MCP extension for dynamic context
Implemented MCP interfaces:
1. `record_developer_fix` and `review_developer_fix`: record a unified diff together with type, provenance and an explicit review status. Recording alone does not confirm that a patch is safe.
2. `query_security_knowledge`: local German/English term search with ranking and relations between advisories, patterns and developer fixes.

---

## 8. Roadmap to full automation

### Milestone 1 (completed)
* [x] Monorepo consolidation with Git and NPM workspaces.
* [x] Universal AI adapter (`ai-rules/` → Cursor, Claude, Copilot, Windsurf, AGENTS.md).
* [x] Deep integration of PHPStan AST rules and the Fluid XSS fixer into the MCP server.
* [x] Test fixture infrastructure (`tests/fixtures/vulnerable_extension/`).

### Milestone 2 (short term: Q4)
* [x] Automated advisory parser: `npm run learn:advisories` (RSS/JSON, offline- and dry-run-capable).
* [x] Dynamic generation of strictly typed PHP test fixtures from detected advisory classes.
* [x] MCP tool `record_developer_fix` for deduplicated human-in-the-loop feedback in `fixes_history.jsonl`.

#### Security gates of milestone 2
* Feed content never freely determines file names or executable PHP code.
* Only the fixed taxonomy produces fixtures; unknown categories are not synthesized.
* Learned fixtures always start as `EXPERIMENTAL` and are promoted to `STRICT` only after vulnerable/safe code regression tests.
* Developer fixes require a real unified diff, are capped at 200 KB and are deduplicated through a SHA-256 fingerprint.

### Milestone 3 (implemented: 2026-09-18)
* [x] Local JSONL knowledge graph with term-based semantic search (DE/EN), ranking, provenance and relations; CLI and MCP share the same search.
* [x] Automated, template-based Rector rule generation from repeated approved fixes. First supported pattern: `unserialize_disallow_classes`; real Rector fixture verification before anything is emitted.
* [x] GitHub PR audit with a patch artifact and inline review suggestions for supported Fluid and deserialization cases; analysis and PR write permissions are separated.

Operation, commands, prerequisites and the exact limits are described in [CONTINUOUS_LEARNING.md](CONTINUOUS_LEARNING.md). The workflows are prepared and tested locally; real publication on GitHub happens only after they reach the default branch. Free-form LLM rule synthesis, embedding search and fully autonomous patch approval remain out of the implemented scope.

### Milestone 4 (implemented: 2026-09-18 – robust advisory regression tests)

The one-liner fixtures previously generated under `tests/fixtures/learned/` were only classified drafts: generic lines of code with no link to the documented root cause and no test harness. A measurement showed that of 14 committed fixtures only 2 were detected by any PHPStan rule at all — they were not evidence of anything. They were removed and replaced by verified pairs.

* [x] Stable error identifiers (`typo3Security.*`) for all nine rules, centralized in `rules/SecurityRuleIdentifier.php`. They are the contract between rules, regression tests and the SARIF export; messages may be reworded, identifiers may not.
* [x] For every rule a realistic vulnerable code example in idiomatic TYPO3 structure (`Classes/Controller`, `Classes/Domain/Repository`, `Classes/ViewHelpers`, `Classes/Service`) with real TYPO3 types instead of generic `object` parameters.
* [x] For every vulnerable example a functionally equivalent secure counterpart.
* [x] Automated regression test (`npm run test:regression`): the vulnerable example must be detected with the expected identifier and must not trip a foreign security rule; the secure counterpart must stay free of security findings; both must be free of general analysis errors.
* [x] Generic one-liners land as `EXPERIMENTAL` drafts in `var/advisory-drafts/` (untracked) and state in their own header that they must not be committed.
* [x] Provenance is mandatory and schema-validated: `origin.kind=ADVISORY` requires an advisory id and an https link, `origin.kind=RULE_CONTRACT` a named reference. `causal_fidelity` separates "reproduces the documented cause" from "reproduces the vulnerability class"; the stronger claim requires the evidenced cause text.
* [x] Review status per fixture with a CLI overview (`npm run fixtures:status`), a review tool (`npm run fixtures:review`) and the gate option `--require-approved`. An approval is bound to the content of the two example files and expires on a later edit (`STALE`); a bulk-approve switch deliberately does not exist.
* [x] Existing `TYPO3-PSA-2024-*` fixtures reviewed and removed: those seeds carry CVE placeholders and no source link, so they do not satisfy the provenance requirement.

**Two findings from the implementation that required their own corrections:**

1. **PHPStan's result cache does not invalidate on changes to the rule classes.** A mutation test (concat detection disabled) stayed green at first, because cached findings were reported for a rule that no longer detects anything. The harness therefore uses an isolated cache (`tmpDir`) that it discards before every run. Without that, the test suite would have been silently green in CI.
2. **The SSRF rule could not distinguish a validated from an unvalidated dynamic URL**, which made an equivalent secure counterpart impossible. It now reports nothing when static analysis resolves the target to a fixed set of constant strings — this covers the usual endpoint allow-list hardening and lowers the false positive rate.

**Acceptance criteria – evidence:** Every versioned fixture owns a vulnerable and a secure counterpart plus an executable regression test against a concrete PHPStan rule. Both failure directions were established by mutation test: disabling detection fails the vulnerable test, reporting unconditionally fails the secure one. Unvalidated one-liners reach neither Git nor the `STRICT` status.

**Still open:** All nine fixture pairs are `PENDING`. The review is explicitly a human task and cannot be given by the author of the fixtures. Until then the CI step stays informational; after the review it can be armed through `--require-approved`. All advisory-bound fixtures carry `causal_fidelity: VULNERABILITY_CLASS`, because the published advisory texts name the vulnerability class, not the concrete code location — a promotion to `DOCUMENTED_ROOT_CAUSE` requires the evidenced cause text.

### Milestone 5 (implemented: 2026-09-18 – sharing the knowledge graph across a team and projects)

A shared, versioned knowledge base in a private Git repository. Developers and projects work with local copies; new findings are reviewed through pull requests and then synchronized explicitly. Shared are `advisories.json`, `learned_patterns.json` and `fixes_history.jsonl`; the derived `graph.jsonl` is rebuilt locally.

* [x] Unified storage resolution (`scripts/lib/knowledge-paths.js`) for MCP and every learning CLI: explicit argument, then `TYPO3_KNOWLEDGE_PATH`, then the repository store. The advisory import previously wrote to the project folder regardless of configuration.
* [x] Versioned exchange format (`typo3-security-knowledge-exchange`, version 1) with schema validation, provenance and a `--dry-run` preview.
* [x] Git-based team workflow with one bundle file per project, documented setup and explicit synchronization; the pull request is the review point.
* [x] Deduplication and conflict handling: every record is classified as `new`, `unchanged`, `conflict` or `invalid`. A conflict never overwrites — local state stays authoritative and the divergence is reported. The identity of a developer fix is recomputed from its content, never taken from the bundle.
* [x] Release process: the export scans every record for private keys, plaintext credentials, AWS keys, internal hostnames, private IP addresses, local user paths and e-mail addresses, and aborts with the field and an excerpt. Only `APPROVED` fixes are shared by default, `REJECTED` never.
* [x] After an import the local index is rebuilt; adopted knowledge is findable through the same CLI and MCP search as local knowledge.
* [x] Integration tests with two separate local copies (`npm run test:exchange`) for adoption, repeated import, conflicts, invalid data, the release check and fingerprint tampering; team operating instructions in [CONTINUOUS_LEARNING.md](CONTINUOUS_LEARNING.md).

**The central design decision: trust does not travel.** An imported developer fix lands locally as `PENDING`, and the original approval is preserved as provenance under `imported.origin_review`. An approval in project A is therefore provenance, not a local release. Without that separation an import in project B could arm a Rector rule immediately — a widening of trust across project boundaries that nobody consciously granted. A test holds it: two fixes approved in A yield `INSUFFICIENT_EVIDENCE` in B until a local reviewer approves them.

**One finding from the implementation:** `validateFix` rejected `source: null`, although `recordDeveloperFix` persists an unset optional field exactly that way. A stored fix failed its own validation, so every fix without a source reference would have been dropped from an export in silence. Validation now accepts the stored form; a test holds the round-trip property.

**Acceptance criteria – evidence:** An approved learning case from project A can be adopted in project B and found there with its provenance and review status. Repeated imports create no duplicates (`new: 0, unchanged: n`). Conflicts and invalid data are reported, existing knowledge is preserved. An import alone grants no new approval and activates no Rector rule. All four statements are covered by integration tests over two separate copies.

**Optional later expansion:** a central knowledge service with authenticated network access, roles and centralized write management. This milestone's first implementation concentrates on the Git-based exchange.

---

*This documentation serves as a strategic and technical guide for the continuous development of the TYPO3 AI & Security Suite.*
