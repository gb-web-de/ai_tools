# TYPO3 Security Suite (Static Code Analysis & CI/CD)

Automated security verification and static code analysis suite for TYPO3 CMS extensions, leveraging PHPStan AST rules, Rector, and Python-based Fluid XSS scanning.

## Included Security Rules (PHPStan AST)

1. **`SqlInjectionQueryBuilderRule`**: Detects dangerous string concatenations (`Node\Expr\BinaryOp\Concat`) and interpolations (`Node\Scalar\Encapsed`) in QueryBuilder methods (`where`, `andWhere`, `orWhere`, `statement`).
2. **`IgnoreValidationOnMutationRule`**: Detects `@ignorevalidation` or `#[IgnoreValidation]` on mutating actions (`updateAction`, `deleteAction`, `createAction`, `saveAction`).
3. **`RawFluidOrEchoXssRule`**: Detects direct `echo` statements in Controllers and ViewHelpers.
4. **`ExtbaseQuerySettingsDataLeakRule`**: Detects calls to `setIgnoreEnableFields(true)` and `setRespectStoragePage(false)` that bypass tenant or page access isolation.
5. **`InsecureDeserializationRule`**: Detects `unserialize()` calls without strict `['allowed_classes' => false]` (Remote Code Execution / Object Injection prevention).
6. **`SsrfGeneralUtilityGetUrlRule`**: Detects dynamic URL parameters in `GeneralUtility::getUrl()` to prevent Server-Side Request Forgery (SSRF).
7. **`DirectSuperglobalsRule`**: Flags legacy direct access to `$_GET`, `$_POST`, `$_REQUEST` in Controllers/Services, enforcing modern PSR-7 `ServerRequestInterface`.
8. **`InsecureFileOperationRule`**: Flags raw `move_uploaded_file()` calls, enforcing TYPO3 File Abstraction Layer (FAL `ResourceFactory`) with strict MIME and extension validation.
9. **`FluidViewHelperEscapingRule`**: Detects custom ViewHelpers with disabled escaping (`$escapeOutput = false;` or `$escapeChildren = false;`) without explicit sanitizers.

## SARIF Integration for GitHub Security Tab

Generate industry-standard OASIS SARIF v2.1.0 reports for GitHub Code Scanning:

```bash
./vendor/bin/phpstan analyse -c phpstan.neon --error-format=json /path/to/extension/ > results.json
node ../scripts/phpstan-to-sarif.js results.json results.sarif
```

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
