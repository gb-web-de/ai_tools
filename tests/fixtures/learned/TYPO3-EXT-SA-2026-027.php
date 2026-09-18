<?php

declare(strict_types=1);

namespace Typo3SecuritySuite\Tests\Fixtures\Learned;

/**
 * Experimental vulnerable fixture for TYPO3-EXT-SA-2026-027.
 * Source title: TYPO3-EXT-SA-2026-027: SQL Injection in extension "Forms Export" (frp_form_answers)
 * This file is test input and must never be used in production.
 */
final class TYPO3_EXT_SA_2026_027
{
    public function vulnerable(object $queryBuilder, object $querySettings, object $repository, object $model, object $authorizationService, string $userInput): void
    {
        $queryBuilder->where('uid = ' . $userInput);
    }
}
