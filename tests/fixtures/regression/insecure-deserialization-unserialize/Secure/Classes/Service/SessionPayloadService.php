<?php

declare(strict_types=1);

namespace Typo3SecuritySuite\Tests\Fixtures\Regression\InsecureDeserializationUnserialize\Secure\Service;

/**
 * SECURE COUNTERPART - functionally equivalent to the vulnerable fixture.
 *
 * The payload is decoded as JSON, so the decoder can only ever produce scalars,
 * arrays, and stdClass. No application class is instantiated, which removes the
 * object injection primitive entirely.
 */
final readonly class SessionPayloadService
{
    /**
     * @return array<string, mixed>
     */
    public function decode(string $storedPayload): array
    {
        try {
            $decoded = json_decode($storedPayload, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return [];
        }

        return is_array($decoded) ? $decoded : [];
    }
}
