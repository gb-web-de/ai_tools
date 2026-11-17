<?php

declare(strict_types=1);

namespace Typo3SecuritySuite\Tests\Fixtures\Regression\BrokenAccessControlIgnorevalidationParameter\Vulnerable\Controller;

use Psr\Http\Message\ResponseInterface;
use Typo3SecuritySuite\Tests\Fixtures\Regression\BrokenAccessControlIgnorevalidationParameter\Vulnerable\Domain\Model\DirectoryEntry;
use Typo3SecuritySuite\Tests\Fixtures\Regression\BrokenAccessControlIgnorevalidationParameter\Vulnerable\Domain\Repository\DirectoryEntryRepository;
use TYPO3\CMS\Extbase\Attribute\IgnoreValidation;
use TYPO3\CMS\Extbase\Mvc\Controller\ActionController;

/**
 * VULNERABLE FIXTURE - test input only, never use in production.
 *
 * Root cause: the mutating action switches off validation of the domain object
 * it persists, using the TYPO3 v14 form of the attribute on the parameter, and
 * performs no ownership check. An entry that fails the model's validation rules
 * is stored anyway, and any caller may update an entry owned by someone else.
 */
final class DirectoryEntryController extends ActionController
{
    public function __construct(
        private readonly DirectoryEntryRepository $entryRepository,
    ) {}

    public function updateAction(#[IgnoreValidation] DirectoryEntry $entry): ResponseInterface
    {
        $this->entryRepository->update($entry);

        return $this->redirect('list');
    }
}
