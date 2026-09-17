# TYPO3 Coding Standards & Best Practices

Target Framework: TYPO3 v12 / v13 / v14
Language: PHP 8.2+ (strict types)

## Core Directives
1. **Strict Types**: EVERY PHP file must start with `declare(strict_types=1);` directly after the opening `<?php` tag.
2. **PHP 8.2+ Modern Features**:
   - Use Constructor Property Promotion.
   - Use `readonly` classes and properties where state is immutable.
   - Use native PHP 8 Attributes (e.g. `#[AsCommand]`, `#[AsEventListener]`, `#[IgnoreValidation]`).
   - Use native Union/Intersection types.
3. **Coding Standards**:
   - Strictly adhere to PSR-12 and PER Coding Style.
   - 4 spaces for indentation (no tabs in PHP).
   - PascalCase for class names, camelCase for method and variable names.
4. **Deprecation Handling**:
   - Zero tolerance for deprecated methods and obsolete `$GLOBALS` calls (`$GLOBALS['TYPO3_DB']`, `$GLOBALS['TSFE']`).
