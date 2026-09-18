<?php

declare(strict_types=1);

namespace Typo3SecuritySuite\Tests\Fixtures\Regression\DataLeakageIgnoreEnableFields\Vulnerable\Domain\Repository;

use TYPO3\CMS\Core\Utility\GeneralUtility;
use TYPO3\CMS\Extbase\Persistence\Generic\Typo3QuerySettings;
use TYPO3\CMS\Extbase\Persistence\Repository;

/**
 * VULNERABLE FIXTURE - test input only, never use in production.
 *
 * Root cause: enable-field evaluation is switched off for every query of this
 * repository. Hidden, deleted, and time-restricted records are returned to any
 * caller, including unauthenticated frontend requests.
 */
final class TranslationLogRepository extends Repository
{
    public function initializeObject(): void
    {
        $querySettings = GeneralUtility::makeInstance(Typo3QuerySettings::class);
        $querySettings->setIgnoreEnableFields(true);

        $this->setDefaultQuerySettings($querySettings);
    }
}
