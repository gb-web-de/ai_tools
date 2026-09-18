<?php

declare(strict_types=1);

namespace Typo3SecuritySuite\Tests\Fixtures\Regression\XssViewhelperEscapingDisabled\Vulnerable\ViewHelpers;

use TYPO3Fluid\Fluid\Core\ViewHelper\AbstractViewHelper;

/**
 * VULNERABLE FIXTURE - test input only, never use in production.
 *
 * Root cause: the ViewHelper opts out of Fluid's output escaping. Whatever it
 * returns is written to the template verbatim, so editor- or user-supplied
 * markup in the teaser text executes in the browser.
 */
final class TeaserViewHelper extends AbstractViewHelper
{
    protected $escapeOutput = false;

    public function initializeArguments(): void
    {
        $this->registerArgument('text', 'string', 'Teaser text', true);
    }

    public function render(): string
    {
        return '<p class="teaser">' . $this->arguments['text'] . '</p>';
    }
}
