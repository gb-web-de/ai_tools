<?php

declare(strict_types=1);

namespace Typo3SecuritySuite\Tests\Fixtures\Regression\XssEchoInController\Secure\Controller;

use Psr\Http\Message\ResponseInterface;
use TYPO3\CMS\Extbase\Mvc\Controller\ActionController;

/**
 * SECURE COUNTERPART - functionally equivalent to the vulnerable fixture.
 *
 * The search term is assigned to the view and rendered through Fluid, which
 * escapes it by default. Nothing is written to the output stream directly.
 */
final class SearchController extends ActionController
{
    public function resultAction(string $searchTerm): ResponseInterface
    {
        $this->view->assign('searchTerm', $searchTerm);

        return $this->htmlResponse();
    }
}
