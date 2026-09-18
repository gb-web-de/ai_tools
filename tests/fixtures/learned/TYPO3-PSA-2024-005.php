<?php

declare(strict_types=1);

namespace Typo3SecuritySuite\Tests\Fixtures\Learned;

/**
 * Experimental vulnerable fixture for TYPO3-PSA-2024-005.
 * Source title: Server-Side Request Forgery via GeneralUtility::getUrl
 * This file is test input and must never be used in production.
 */
final class TYPO3_PSA_2024_005
{
    public function vulnerable(object $queryBuilder, object $querySettings, object $repository, object $model, object $authorizationService, string $userInput): void
    {
        $response = file_get_contents($userInput);
    }
}
