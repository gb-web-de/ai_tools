<?php

declare(strict_types=1);

namespace Typo3SecuritySuite\Tests\Fixtures\Regression\SqlInjectionQuerybuilderWhere\Vulnerable\Domain\Repository;

use TYPO3\CMS\Core\Database\ConnectionPool;

/**
 * VULNERABLE FIXTURE - test input only, never use in production.
 *
 * Root cause: a request-supplied value is concatenated into the WHERE clause
 * instead of being bound as a named parameter. The value reaches the SQL
 * string verbatim, so an attacker controls the query structure.
 */
final readonly class FormAnswerRepository
{
    public function __construct(
        private ConnectionPool $connectionPool,
    ) {}

    /**
     * @return list<array<string, mixed>>
     */
    public function findByForm(string $formIdentifier): array
    {
        $queryBuilder = $this->connectionPool->getQueryBuilderForTable('tx_frpformanswers_domain_model_answer');

        $rows = $queryBuilder
            ->select('uid', 'form_identifier', 'answer_data')
            ->from('tx_frpformanswers_domain_model_answer')
            ->where('form_identifier = ' . $formIdentifier)
            ->executeQuery()
            ->fetchAllAssociative();

        return array_values($rows);
    }
}
