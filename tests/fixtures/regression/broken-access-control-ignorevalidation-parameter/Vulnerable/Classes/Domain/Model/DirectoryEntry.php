<?php

declare(strict_types=1);

namespace Typo3SecuritySuite\Tests\Fixtures\Regression\BrokenAccessControlIgnorevalidationParameter\Vulnerable\Domain\Model;

use TYPO3\CMS\Extbase\Attribute\Validate;
use TYPO3\CMS\Extbase\DomainObject\AbstractEntity;

final class DirectoryEntry extends AbstractEntity
{
    #[Validate(validator: 'NotEmpty')]
    protected string $title = '';

    // No setter: property mapping cannot overwrite the owner from a request.
    protected int $feUser = 0;

    public function getTitle(): string
    {
        return $this->title;
    }

    public function setTitle(string $title): void
    {
        $this->title = $title;
    }

    public function getFeUser(): int
    {
        return $this->feUser;
    }
}
