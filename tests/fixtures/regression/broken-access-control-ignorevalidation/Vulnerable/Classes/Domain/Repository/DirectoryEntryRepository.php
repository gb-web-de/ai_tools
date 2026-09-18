<?php

declare(strict_types=1);

namespace Typo3SecuritySuite\Tests\Fixtures\Regression\BrokenAccessControlIgnorevalidation\Vulnerable\Domain\Repository;

use TYPO3\CMS\Extbase\Persistence\Repository;

/**
 * @extends Repository<\Typo3SecuritySuite\Tests\Fixtures\Regression\BrokenAccessControlIgnorevalidation\Vulnerable\Domain\Model\DirectoryEntry>
 */
final class DirectoryEntryRepository extends Repository
{
}
