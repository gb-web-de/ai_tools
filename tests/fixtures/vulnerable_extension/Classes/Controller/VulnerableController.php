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

    public function downloadAction(): void
    {
        // VULNERABILITY 7: Direct Superglobal access
        $targetUrl = $_GET['url'] ?? '';

        // VULNERABILITY 8: SSRF via dynamic getUrl
        \TYPO3\CMS\Core\Utility\GeneralUtility::getUrl($targetUrl);

        // VULNERABILITY 9: Insecure Deserialization
        $cached = unserialize($_POST['payload'] ?? '');

        // VULNERABILITY 10: Insecure File Operation
        move_uploaded_file($_FILES['file']['tmp_name'], '/var/www/uploads/file.php');
    }
}
