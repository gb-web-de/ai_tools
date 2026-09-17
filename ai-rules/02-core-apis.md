# TYPO3 Core APIs & Data Access Guidelines

Target Framework: TYPO3 v12 / v13 / v14

## 1. Doctrine DBAL (ConnectionPool & QueryBuilder)
- Always use `ConnectionPool` to retrieve query builders or connections for specific tables.
- Never use legacy `$GLOBALS['TYPO3_DB']` (removed in v9+).
- Use typed parameter binding: `\PDO::PARAM_INT`, `\PDO::PARAM_STR`, `Connection::PARAM_INT_ARRAY`.

```php
use TYPO3\CMS\Core\Database\ConnectionPool;
use TYPO3\CMS\Core\Utility\GeneralUtility;

$queryBuilder = GeneralUtility::makeInstance(ConnectionPool::class)
    ->getQueryBuilderForTable('tt_content');

$rows = $queryBuilder
    ->select('uid', 'header', 'bodytext')
    ->from('tt_content')
    ->where(
        $queryBuilder->expr()->eq('CType', $queryBuilder->createNamedParameter('textmedia')),
        $queryBuilder->expr()->in('pid', $queryBuilder->createNamedParameter([1, 2, 3], Connection::PARAM_INT_ARRAY))
    )
    ->executeQuery()
    ->fetchAllAssociative();
```

## 2. File Abstraction Layer (FAL)
- Work with `ResourceFactory` and `FileReference` objects rather than direct file system paths.
- Generate public URLs using `$file->getPublicUrl()`.

```php
use TYPO3\CMS\Core\Resource\ResourceFactory;

$resourceFactory = GeneralUtility::makeInstance(ResourceFactory::class);
$file = $resourceFactory->getFileObject($fileUid);
$publicUrl = $file->getPublicUrl();
```

## 3. Context API
- Read environment state (language, workspace, frontend user, backend user) via Context API.
- Never read from `$GLOBALS['TSFE']->sys_language_uid` or `$GLOBALS['TSFE']->fe_user` directly.

```php
use TYPO3\CMS\Core\Context\Context;

$context = GeneralUtility::makeInstance(Context::class);
$languageId = $context->getPropertyFromAspect('language', 'id');
$isLoggedIn = $context->getPropertyFromAspect('frontend.user', 'isLoggedIn');
```

## 4. Caching Framework
- Access caches via `CacheManager`.
- Tag cache entries so they can be invalidated cleanly.

```php
use TYPO3\CMS\Core\Cache\CacheManager;

$cache = GeneralUtility::makeInstance(CacheManager::class)->getCache('my_extension_cache');
$cacheIdentifier = 'calculated_stats_' . $siteId;
if (($data = $cache->get($cacheIdentifier)) === false) {
    $data = $this->calculateExpensiveData();
    $cache->set($cacheIdentifier, $data, ['my_extension_tag', 'site_' . $siteId], 3600);
}
```
