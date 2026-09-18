<?php

declare(strict_types=1);

namespace Typo3SecuritySuite\Tests\Fixtures\Regression\InsecureFileUploadMoveUploadedFile\Vulnerable\Service;

/**
 * VULNERABLE FIXTURE - test input only, never use in production.
 *
 * Root cause: the upload is moved into the document root with raw PHP file
 * handling. None of TYPO3's upload protections apply - no fileDenyPattern, no
 * MIME-type check, no storage permission check - so an uploaded .php file lands
 * in a web-reachable directory.
 */
final readonly class AttachmentUploadService
{
    public function store(string $temporaryName, string $originalName): string
    {
        $target = 'fileadmin/user_upload/' . $originalName;

        move_uploaded_file($temporaryName, $target);

        return $target;
    }
}
