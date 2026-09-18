<?php

declare(strict_types=1);

namespace Typo3SecuritySuite\Tests\Fixtures\Regression\BrokenAccessControlIgnorevalidation\Secure\Controller;

use Psr\Http\Message\ResponseInterface;
use Typo3SecuritySuite\Tests\Fixtures\Regression\BrokenAccessControlIgnorevalidation\Secure\Domain\Model\DirectoryEntry;
use Typo3SecuritySuite\Tests\Fixtures\Regression\BrokenAccessControlIgnorevalidation\Secure\Domain\Repository\DirectoryEntryRepository;
use TYPO3\CMS\Core\Context\Context;
use TYPO3\CMS\Extbase\Mvc\Controller\ActionController;

/**
 * SECURE COUNTERPART - functionally equivalent to the vulnerable fixture.
 *
 * Validation stays enabled for the persisted object, and ownership is verified
 * against the authenticated frontend user before the update is applied.
 */
final class DirectoryEntryController extends ActionController
{
    public function __construct(
        private readonly DirectoryEntryRepository $entryRepository,
        private readonly Context $context,
    ) {}

    public function updateAction(DirectoryEntry $entry): ResponseInterface
    {
        $currentUserId = (int)$this->context->getPropertyFromAspect('frontend.user', 'id', 0);

        if ($currentUserId === 0 || $entry->getFeUser() !== $currentUserId) {
            throw new \RuntimeException('Unauthorized modification attempt.', 1758196800);
        }

        $this->entryRepository->update($entry);

        return $this->redirect('list');
    }
}
