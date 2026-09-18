# Documentation / Dokumentation

| Document | English | Deutsch |
| --- | --- | --- |
| Architecture, continuous learning, threat model & roadmap | [SELF_LEARNING_ARCHITECTURE.md](en/SELF_LEARNING_ARCHITECTURE.md) | [SELF_LEARNING_ARCHITECTURE.md](de/SELF_LEARNING_ARCHITECTURE.md) |
| Operation, commands and limits of the learning features | [CONTINUOUS_LEARNING.md](en/CONTINUOUS_LEARNING.md) | [CONTINUOUS_LEARNING.md](de/CONTINUOUS_LEARNING.md) |

Both language versions carry the same sections and are kept in sync; `npm run test:docs` fails if their heading structures diverge.

## Console language / Sprache der Konsolenausgabe

The CLIs resolve their output language as follows, highest priority first. Die CLIs bestimmen ihre Ausgabesprache in dieser Reihenfolge:

1. `--lang en|de`
2. `TYPO3_AI_LANG`
3. `LC_ALL` / `LC_MESSAGES` / `LANG`
4. `en`

```bash
npm run fixtures:status -- --lang de
export TYPO3_AI_LANG=de
```

Machine-readable output (JSON) is never translated — field names and status values such as `PENDING` or `CONFLICT` are interface, not prose. Maschinenlesbare Ausgaben werden nie übersetzt.
