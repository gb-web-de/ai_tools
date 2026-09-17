# TYPO3 Security Suite (Static Code Analysis & CI/CD)

Automated security verification and static code analysis suite for TYPO3 CMS extensions, leveraging PHPStan AST rules, Rector, and Python-based Fluid XSS scanning.

## Included Security Rules (PHPStan AST)

1. **`SqlInjectionQueryBuilderRule`**: Detects dangerous string concatenations (`Node\Expr\BinaryOp\Concat`) and interpolations (`Node\Scalar\Encapsed`) in QueryBuilder methods (`where`, `andWhere`, `orWhere`, `statement`).
2. **`IgnoreValidationOnMutationRule`**: Detects `@ignorevalidation` or `#[IgnoreValidation]` on mutating actions (`updateAction`, `deleteAction`, `createAction`, `saveAction`).
3. **`RawFluidOrEchoXssRule`**: Detects direct `echo` statements in Controllers and ViewHelpers.
4. **`ExtbaseQuerySettingsDataLeakRule`**: Detects calls to `setIgnoreEnableFields(true)` and `setRespectStoragePage(false)` that bypass tenant or page access isolation.

## Fluid Template XSS Scanner & Fixer

Scan templates for unescaped output (`f:format.raw()`), disabled escaping, and inline JavaScript injection:

```bash
# Scan only
python3 scripts/scan_fluid_xss.py /path/to/extension/Resources/Private/Templates/

# Auto-fix f:format.raw() and enforce escaping
python3 scripts/scan_fluid_xss.py --fix /path/to/extension/Resources/Private/Templates/
```

## Running the Security Audit

```bash
# Analyze an extension
./vendor/bin/phpstan analyse -c phpstan.neon /path/to/extension/Classes/

# Output machine-readable JSON (used by MCP Server)
./vendor/bin/phpstan analyse -c phpstan.neon --error-format=json /path/to/extension/Classes/
```

## CI/CD Pipeline

A GitHub Actions workflow is provided in `.github/workflows/typo3-security.yml`.
