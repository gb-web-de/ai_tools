<?php

declare(strict_types=1);

namespace Typo3SecuritySuite\Tests\Fixtures\Regression\DataLeakageIgnoreEnableFields\Secure\Domain\Repository;

use TYPO3\CMS\Core\Utility\GeneralUtility;
use TYPO3\CMS\Extbase\Persistence\Generic\Typo3QuerySettings;
use TYPO3\CMS\Extbase\Persistence\Repository;

/**
 * SECURE COUNTERPART - functionally equivalent to the vulnerable fixture.
 *
 * Enable-field evaluation stays active, so hidden, deleted, and time-restricted
 * records remain invisible. Callers that legitimately need restricted records
 * must request them explicitly after their own permission check, instead of the
 * repository silently widening visibility for everyone.
 */
final class TranslationLogRepository extends Repository
{
    public function initializeObject(): void
    {
        $querySettings = GeneralUtility::makeInstance(Typo3QuerySettings::class);
        $querySettings->setIgnoreEnableFields(false);

        $this->setDefaultQuerySettings($querySettings);
    }
}
