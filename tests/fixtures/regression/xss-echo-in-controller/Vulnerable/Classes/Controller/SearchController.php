<?php

declare(strict_types=1);

namespace Typo3SecuritySuite\Tests\Fixtures\Regression\XssEchoInController\Vulnerable\Controller;

use Psr\Http\Message\ResponseInterface;
use TYPO3\CMS\Extbase\Mvc\Controller\ActionController;

/**
 * VULNERABLE FIXTURE - test input only, never use in production.
 *
 * Root cause: the controller writes a request value straight into the response
 * body with echo. Fluid's automatic output escaping is bypassed, so markup in
 * the search term is reflected into the page (reflected XSS).
 */
final class SearchController extends ActionController
{
    public function resultAction(string $searchTerm): ResponseInterface
    {
        echo '<h1>Results for ' . $searchTerm . '</h1>';

        return $this->htmlResponse('');
    }
}
