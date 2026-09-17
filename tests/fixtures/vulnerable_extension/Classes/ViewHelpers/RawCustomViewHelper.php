<?php

declare(strict_types=1);

namespace Test\VulnerableExtension\ViewHelpers;

use TYPO3Fluid\Fluid\Core\ViewHelper\AbstractViewHelper;

class RawCustomViewHelper extends AbstractViewHelper
{
    // VULNERABILITY 11: ViewHelper output escaping disabled
    protected $escapeOutput = false;

    public function render(): string
    {
        return '<div>' . ($this->arguments['data'] ?? '') . '</div>';
    }
}
