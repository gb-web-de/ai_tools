<?php

declare(strict_types=1);

namespace Typo3SecuritySuite\Tests\Fixtures\Learned;

/**
 * Experimental vulnerable fixture for TYPO3-CORE-SA-2026-023.
 * Source title: TYPO3-CORE-SA-2026-023: Missing Authorization in lowlevel commands
 * This file is test input and must never be used in production.
 */
final class TYPO3_CORE_SA_2026_023
{
    public function vulnerable(object $queryBuilder, object $querySettings, object $repository, object $model, object $authorizationService, string $userInput): void
    {
        $repository->update($model);
    }
}
