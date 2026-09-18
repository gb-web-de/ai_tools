<?php

declare(strict_types=1);

namespace Typo3SecuritySuite\Tests\Fixtures\Regression\SqlInjectionQuerybuilderWhere\Secure\Domain\Repository;

use TYPO3\CMS\Core\Database\Connection;
use TYPO3\CMS\Core\Database\ConnectionPool;

/**
 * SECURE COUNTERPART - functionally equivalent to the vulnerable fixture.
 *
 * The request-supplied value is bound through createNamedParameter(), so it is
 * transported as a query parameter and can no longer alter the query structure.
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
            ->where(
                $queryBuilder->expr()->eq(
                    'form_identifier',
                    $queryBuilder->createNamedParameter($formIdentifier, Connection::PARAM_STR)
                )
            )
            ->executeQuery()
            ->fetchAllAssociative();

        return array_values($rows);
    }
}
