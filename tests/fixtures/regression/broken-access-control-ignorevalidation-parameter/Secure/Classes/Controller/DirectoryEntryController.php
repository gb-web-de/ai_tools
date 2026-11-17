<?php

declare(strict_types=1);

namespace Typo3SecuritySuite\Tests\Fixtures\Regression\BrokenAccessControlIgnorevalidationParameter\Secure\Controller;

use Psr\Http\Message\ResponseInterface;
use Typo3SecuritySuite\Tests\Fixtures\Regression\BrokenAccessControlIgnorevalidationParameter\Secure\Domain\Model\DirectoryEntry;
use Typo3SecuritySuite\Tests\Fixtures\Regression\BrokenAccessControlIgnorevalidationParameter\Secure\Domain\Repository\DirectoryEntryRepository;
use TYPO3\CMS\Core\Context\Context;
use TYPO3\CMS\Extbase\Mvc\Controller\ActionController;

/**
 * SECURE COUNTERPART - functionally equivalent to the vulnerable fixture.
 *
 * The model's validators run for the persisted object, and ownership is
 * verified against the authenticated frontend user before the update is
 * applied. The owner has no setter, so the request cannot overwrite the value
 * that is compared.
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
            throw new \RuntimeException('Unauthorized modification attempt.', 1794895484);
        }

        $this->entryRepository->update($entry);

        return $this->redirect('list');
    }
}
