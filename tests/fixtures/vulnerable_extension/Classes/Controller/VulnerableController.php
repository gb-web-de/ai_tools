<?php

declare(strict_types=1);

namespace Test\VulnerableExtension\Controller;

use Psr\Http\Message\ResponseInterface;

class VulnerableController
{
    /**
     * VULNERABILITY 3: Broken Access Control via @ignorevalidation on mutating action
     * @ignorevalidation $item
     */
    public function updateAction(object $item): ResponseInterface
    {
        // VULNERABILITY 4: Direct echo in Controller
        echo "Updating item: " . (string)$item;
        return new \TYPO3\CMS\Core\Http\Response();
    }
}
