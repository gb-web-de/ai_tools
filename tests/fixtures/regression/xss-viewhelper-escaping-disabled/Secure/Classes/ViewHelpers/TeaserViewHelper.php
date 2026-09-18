<?php

declare(strict_types=1);

namespace Typo3SecuritySuite\Tests\Fixtures\Regression\XssViewhelperEscapingDisabled\Secure\ViewHelpers;

use TYPO3Fluid\Fluid\Core\ViewHelper\AbstractViewHelper;

/**
 * SECURE COUNTERPART - functionally equivalent to the vulnerable fixture.
 *
 * Output escaping stays at its default. The markup the ViewHelper needs is kept
 * in the template, and the dynamic part is escaped explicitly before it is
 * embedded, so the rendered value can never introduce active markup.
 */
final class TeaserViewHelper extends AbstractViewHelper
{
    public function initializeArguments(): void
    {
        $this->registerArgument('text', 'string', 'Teaser text', true);
    }

    public function render(): string
    {
        $text = (string)$this->arguments['text'];

        return '<p class="teaser">' . htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</p>';
    }
}
