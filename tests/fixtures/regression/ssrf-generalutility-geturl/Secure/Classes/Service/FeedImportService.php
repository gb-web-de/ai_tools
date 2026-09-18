<?php

declare(strict_types=1);

namespace Typo3SecuritySuite\Tests\Fixtures\Regression\SsrfGeneralutilityGeturl\Secure\Service;

use TYPO3\CMS\Core\Utility\GeneralUtility;

/**
 * SECURE COUNTERPART - functionally equivalent to the vulnerable fixture.
 *
 * Caller input selects an endpoint from a fixed allow-list instead of becoming
 * the request target. The set of reachable URLs is closed and known at compile
 * time, so no caller can steer the request at internal infrastructure.
 */
final readonly class FeedImportService
{
    private const ALLOWED_FEEDS = [
        'news' => 'https://example.org/feeds/news.xml',
        'events' => 'https://example.org/feeds/events.xml',
    ];

    public function import(string $feedKey): string
    {
        if (!array_key_exists($feedKey, self::ALLOWED_FEEDS)) {
            throw new \InvalidArgumentException('Unknown feed: ' . $feedKey, 1758196803);
        }

        return (string)GeneralUtility::getUrl(self::ALLOWED_FEEDS[$feedKey]);
    }
}
