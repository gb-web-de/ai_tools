<?php

declare(strict_types=1);

namespace Typo3SecuritySuite\Tests\Fixtures\Regression\InsecureFileUploadMoveUploadedFile\Secure\Service;

use TYPO3\CMS\Core\Resource\Exception\ExistingTargetFileNameException;
use TYPO3\CMS\Core\Resource\StorageRepository;

/**
 * SECURE COUNTERPART - functionally equivalent to the vulnerable fixture.
 *
 * The upload is handed to the File Abstraction Layer. FAL applies the storage's
 * permissions, the fileDenyPattern, and file name sanitation before the file is
 * persisted, and it returns a managed file object rather than a raw path.
 */
final readonly class AttachmentUploadService
{
    public function __construct(
        private StorageRepository $storageRepository,
    ) {}

    public function store(string $temporaryName, string $originalName): string
    {
        $storage = $this->storageRepository->getDefaultStorage();

        if ($storage === null) {
            throw new \RuntimeException('No default file storage configured.', 1758196801);
        }

        $targetFolder = $storage->getFolder('/user_upload/');

        try {
            $file = $storage->addFile($temporaryName, $targetFolder, $originalName);
        } catch (ExistingTargetFileNameException $exception) {
            throw new \RuntimeException('Upload target already exists.', 1758196802, $exception);
        }

        return $file->getIdentifier();
    }
}
