<?php

declare(strict_types=1);

namespace Test\VulnerableExtension\Domain\Repository;

use TYPO3\CMS\Core\Database\ConnectionPool;
use TYPO3\CMS\Extbase\Persistence\Generic\Typo3QuerySettings;

class VulnerableRepository
{
    public function __construct(
        private readonly ConnectionPool $connectionPool
    ) {}

    public function findByInsecurePid(string $pid): array
    {
        $queryBuilder = $this->connectionPool->getQueryBuilderForTable('tx_test_item');

        // VULNERABILITY 1: SQL Injection via direct concatenation
        return $queryBuilder
            ->select('*')
            ->from('tx_test_item')
            ->where('pid = ' . $pid)
            ->executeQuery()
            ->fetchAllAssociative();
    }

    public function bypassAccessSettings(): void
    {
        $querySettings = new Typo3QuerySettings();
        // VULNERABILITY 2: Data Leakage via setIgnoreEnableFields
        $querySettings->setIgnoreEnableFields(true);
    }
}
