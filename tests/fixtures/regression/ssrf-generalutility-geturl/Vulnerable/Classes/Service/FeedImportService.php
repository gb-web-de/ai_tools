<?php

declare(strict_types=1);

namespace Typo3SecuritySuite\Tests\Fixtures\Regression\SsrfGeneralutilityGeturl\Vulnerable\Service;

use TYPO3\CMS\Core\Utility\GeneralUtility;

/**
 * VULNERABLE FIXTURE - test input only, never use in production.
 *
 * Root cause: the request target is taken from caller-supplied input and used
 * unvalidated. An attacker can point the request at internal infrastructure -
 * link-local metadata endpoints, services on localhost, hosts inside the
 * private network - and read the response (server-side request forgery).
 */
final readonly class FeedImportService
{
    public function import(string $feedUrl): string
    {
        return (string)GeneralUtility::getUrl($feedUrl);
    }
}
