<?php

declare(strict_types=1);

namespace Typo3SecuritySuite\Tests\Fixtures\Learned;

/**
 * Experimental vulnerable fixture for TYPO3-PSA-2024-001.
 * Source title: SQL Injection in QueryBuilder orderings and raw statements
 * This file is test input and must never be used in production.
 */
final class TYPO3_PSA_2024_001
{
    public function vulnerable(object $queryBuilder, object $querySettings, object $repository, object $model, object $authorizationService, string $userInput): void
    {
        $queryBuilder->where('uid = ' . $userInput);
    }
}
