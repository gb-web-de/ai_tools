<?php

declare(strict_types=1);

namespace Typo3SecuritySuite\Tests\Fixtures\Regression\DirectSuperglobalsInController\Secure\Controller;

use Psr\Http\Message\ResponseInterface;
use TYPO3\CMS\Extbase\Mvc\Controller\ActionController;

/**
 * SECURE COUNTERPART - functionally equivalent to the vulnerable fixture.
 *
 * Input is read through the PSR-7 request, so it passes the documented request
 * abstraction, can be typed at the boundary, and the action stays testable with
 * a synthetic request.
 */
final class FilterController extends ActionController
{
    public function listAction(): ResponseInterface
    {
        $queryParams = $this->request->getQueryParams();
        $category = is_string($queryParams['category'] ?? null) ? $queryParams['category'] : '';

        $this->view->assign('category', $category);

        return $this->htmlResponse();
    }
}
