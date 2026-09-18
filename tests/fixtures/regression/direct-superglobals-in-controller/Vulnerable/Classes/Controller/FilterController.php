<?php

declare(strict_types=1);

namespace Typo3SecuritySuite\Tests\Fixtures\Regression\DirectSuperglobalsInController\Vulnerable\Controller;

use Psr\Http\Message\ResponseInterface;
use TYPO3\CMS\Extbase\Mvc\Controller\ActionController;

/**
 * VULNERABLE FIXTURE - test input only, never use in production.
 *
 * Root cause: input is read straight from the $_GET superglobal. The value
 * bypasses the PSR-7 request abstraction and Extbase's property mapping, so it
 * is neither typed nor validated, and the action cannot be tested with a
 * synthetic request.
 */
final class FilterController extends ActionController
{
    public function listAction(): ResponseInterface
    {
        $category = $_GET['category'] ?? '';

        $this->view->assign('category', $category);

        return $this->htmlResponse();
    }
}
