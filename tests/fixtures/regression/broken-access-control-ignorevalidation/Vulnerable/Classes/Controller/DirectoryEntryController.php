<?php

declare(strict_types=1);

namespace Typo3SecuritySuite\Tests\Fixtures\Regression\BrokenAccessControlIgnorevalidation\Vulnerable\Controller;

use Psr\Http\Message\ResponseInterface;
use Typo3SecuritySuite\Tests\Fixtures\Regression\BrokenAccessControlIgnorevalidation\Vulnerable\Domain\Model\DirectoryEntry;
use Typo3SecuritySuite\Tests\Fixtures\Regression\BrokenAccessControlIgnorevalidation\Vulnerable\Domain\Repository\DirectoryEntryRepository;
use TYPO3\CMS\Extbase\Annotation\IgnoreValidation;
use TYPO3\CMS\Extbase\Mvc\Controller\ActionController;

/**
 * VULNERABLE FIXTURE - test input only, never use in production.
 *
 * Root cause: the mutating action suppresses validation of the domain object it
 * persists and performs no ownership check. A request may carry properties the
 * caller is not allowed to set, and may address an entry owned by someone else.
 */
final class DirectoryEntryController extends ActionController
{
    public function __construct(
        private readonly DirectoryEntryRepository $entryRepository,
    ) {}

    #[IgnoreValidation(['value' => 'entry'])]
    public function updateAction(DirectoryEntry $entry): ResponseInterface
    {
        $this->entryRepository->update($entry);

        return $this->redirect('list');
    }
}
