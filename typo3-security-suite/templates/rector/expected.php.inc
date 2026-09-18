<?php
declare(strict_types=1);

namespace SecurityFixtures;

function decodeValue(string $payload): mixed
{
    return \unserialize($payload, ['allowed_classes' => false]);
}
