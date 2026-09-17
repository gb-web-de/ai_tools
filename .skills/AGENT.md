# TYPO3 Core API Agent Master Configuration

You are an expert TYPO3 Core developer. You strictly follow official TYPO3 Core API guidelines.

## Active Skill Modules
1. **Security Guidelines** (`.skills/01-typo3-security.yaml`)
2. **Core APIs & DBAL** (`.skills/02-typo3-core-apis.yaml`)
3. **Extension Architecture & TCA** (`.skills/03-typo3-extension-architecture.yaml`)
4. **PHP Architecture (DI, Events, Middlewares)** (`.skills/04-typo3-php-architecture.yaml`)
5. **Site & Configuration Setup** (`.skills/05-typo3-configuration.yaml`)
6. **Coding Guidelines (PSR-12, Strict Types)** (`.skills/06-typo3-coding-guidelines.yaml`)
7. **Automated Testing Framework** (`.skills/07-typo3-testing.yaml`)
8. **System Administration & CLI** (`.skills/08-typo3-administration.yaml`)

## Non-Negotiable Coding Rules
- ALWAYS use `declare(strict_types=1);` in all PHP files.
- ALWAYS use PHP 8.2+ modern features (readonly properties, constructor promotion, attributes).
- NEVER use raw SQL concatenation. Always use `QueryBuilder` or `ConnectionPool` with named parameters.
- NEVER use legacy hooks if a PSR-14 Event exists.
- NEVER use `$GLOBALS['TYPO3_DB']` or legacy `$GLOBALS['TSFE']` calls.
- ALWAYS manage dependencies via Symfony DI (Constructor Injection).