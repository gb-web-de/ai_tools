# TYPO3 Security Architecture & Hardening Guidelines

Target Framework: TYPO3 v12 / v13 / v14
PHP Requirement: PHP 8.2+ with strict typing

## 1. SQL Injection (SQLi) Prevention
- **RULE**: NEVER concatenate variables, user input, or raw strings into database queries.
- **RULE**: NEVER use raw SQL statements without parameter binding.
- **STANDARD**: Always use `ConnectionPool` and `QueryBuilder` with `$queryBuilder->createNamedParameter()` or expression builders.

```php
// CORRECT
$queryBuilder = $connectionPool->getQueryBuilderForTable('pages');
$statement = $queryBuilder
    ->select('uid', 'title')
    ->from('pages')
    ->where(
        $queryBuilder->expr()->eq('pid', $queryBuilder->createNamedParameter($pid, \PDO::PARAM_INT)),
        $queryBuilder->expr()->eq('hidden', $queryBuilder->createNamedParameter(0, \PDO::PARAM_INT))
    )
    ->executeQuery();

// FORBIDDEN (VULNERABLE)
$queryBuilder->where('pid = ' . $pid); // SQLi
$queryBuilder->where("pid = $pid");   // SQLi
```

## 2. Cross-Site Scripting (XSS) Prevention
- **RULE**: Fluid templates escape all variables by default. NEVER disable escaping via `f:format.raw()` or `escapeOutput="false"` on user-controlled variables.
- **RULE**: If rich HTML input is required, ALWAYS sanitize it using TYPO3's `SanitizerBuilder`.
- **RULE**: Avoid direct `echo` or `print` in Controllers or ViewHelpers.

```html
<!-- CORRECT -->
<div class="user-content">{userInput}</div>
<f:format.html>{cleanHtmlContent}</f:format.html>

<!-- FORBIDDEN (VULNERABLE) -->
{userInput -> f:format.raw()}
<f:format.raw>{userInput}</f:format.raw>
<div onclick="doAction('{userInput}')"></div>
```

```php
// PHP Sanitizer
use TYPO3\CMS\Core\Html\SanitizerBuilder;
use TYPO3\CMS\Core\Utility\GeneralUtility;

$sanitizer = GeneralUtility::makeInstance(SanitizerBuilder::class)->build();
$safeHtml = $sanitizer->sanitize($untrustedHtml);
```

## 3. Broken Access Control & Mass Assignment (Extbase)
- **RULE**: Mutating Controller actions (`updateAction`, `deleteAction`, `createAction`, `saveAction`) must NEVER have `@ignorevalidation` or `#[IgnoreValidation]` applied to modified domain models.
- **RULE**: Always verify entity ownership or permissions in Controller actions before persisting modifications.

```php
// CORRECT
public function updateAction(Profile $profile): ResponseInterface
{
    if ($profile->getUser() !== $this->getLoggedInUser()) {
        throw new AccessDeniedException('Unauthorized modification attempt.');
    }
    $this->profileRepository->update($profile);
    return $this->redirect('show');
}

// FORBIDDEN (VULNERABLE)
/**
 * @ignorevalidation $profile
 */
public function updateAction(Profile $profile): ResponseInterface { ... }
```

## 4. Insecure Deserialization & Remote Code Execution (RCE)
- **RULE**: NEVER pass untrusted data to PHP's `unserialize()`.
- **RULE**: If `unserialize()` must be used, enforce `['allowed_classes' => false]`.
- **PREFERENCE**: Use `json_encode()` and `json_decode()` with strict typing.

## 5. Extbase QuerySettings Data Leakage
- **RULE**: Do NOT globally disable `$querySettings->setIgnoreEnableFields(true)` or `setRespectStoragePage(false)` in repositories. This bypasses hidden/deleted/start/end restrictions and workspace isolation.

## 6. TCA & File Upload Security
- **RULE**: In TCA `type => 'file'`, explicitly restrict `allowed` file extensions. Never allow `php,phar,phtml,sh,cgi,exe`.
- **RULE**: Sanitize uploaded file names and handle uploads exclusively via the File Abstraction Layer (FAL) `ResourceFactory`.
- **RULE**: In TCA `foreign_table_where`, never interpolate unquoted dynamic input.
