<?php

declare(strict_types=1);

namespace Typo3SecuritySuite\Tests\Fixtures\Learned;

/**
 * Experimental vulnerable fixture for TYPO3-EXT-SA-2026-021.
 * Source title: TYPO3-EXT-SA-2026-021: Broken Access Control in extension "Forum" (pforum)
 * This file is test input and must never be used in production.
 */
final class TYPO3_EXT_SA_2026_021
{
    public function vulnerable(object $queryBuilder, object $querySettings, object $repository, object $model, object $authorizationService, string $userInput): void
    {
        $repository->update($model);
    }
}
