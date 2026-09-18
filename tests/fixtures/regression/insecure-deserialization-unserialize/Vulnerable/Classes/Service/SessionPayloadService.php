<?php

declare(strict_types=1);

namespace Typo3SecuritySuite\Tests\Fixtures\Regression\InsecureDeserializationUnserialize\Vulnerable\Service;

/**
 * VULNERABLE FIXTURE - test input only, never use in production.
 *
 * Root cause: attacker-controlled data is passed to unserialize() without
 * restricting the classes that may be instantiated. Any class reachable by the
 * autoloader can be constructed, which turns a magic method chain into remote
 * code execution (PHP object injection).
 */
final readonly class SessionPayloadService
{
    /**
     * @return array<string, mixed>
     */
    public function decode(string $storedPayload): array
    {
        $decoded = unserialize($storedPayload);

        return is_array($decoded) ? $decoded : [];
    }
}
