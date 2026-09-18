<?php
declare(strict_types=1);

namespace SecurityFixtures;

function unserialize(string $payload): string
{
    return $payload;
}

function retainExistingPolicy(string $payload, array $arguments): void
{
    \unserialize($payload, ['allowed_classes' => false]);
    \unserialize($payload, ['allowed_classes' => ['ExistingDto']]);
    unserialize($payload);
    \SecurityFixtures\unserialize($payload);
    \unserialize(data: $payload);
    \unserialize(...$arguments);
    $callable = \unserialize(...);
    $callable($payload);
}
