<?php

declare(strict_types=1);

namespace Typo3SecuritySuite\Tests\Fixtures\Regression\BrokenAccessControlIgnorevalidation\Secure\Domain\Model;

use TYPO3\CMS\Extbase\DomainObject\AbstractEntity;

final class DirectoryEntry extends AbstractEntity
{
    protected string $title = '';

    protected int $feUser = 0;

    public function getTitle(): string
    {
        return $this->title;
    }

    public function getFeUser(): int
    {
        return $this->feUser;
    }
}
