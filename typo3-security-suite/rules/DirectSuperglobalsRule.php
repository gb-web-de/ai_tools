<?php

declare(strict_types=1);

namespace Security\TYPO3\Rules;

use PhpParser\Node;
use PhpParser\Node\Expr\Variable;
use PHPStan\Analyser\Scope;
use PHPStan\Rules\Rule;

/**
 * @implements Rule<Variable>
 */
class DirectSuperglobalsRule implements Rule
{
    public function getNodeType(): string
    {
        return Variable::class;
    }

    public function processNode(Node $node, Scope $scope): array
    {
        if (!is_string($node->name)) {
            return [];
        }

        $superglobals = ['_GET', '_POST', '_REQUEST'];
        if (!in_array($node->name, $superglobals, true)) {
            return [];
        }

        $filePath = $scope->getFile();
        if (str_contains($filePath, 'Classes/Controller') || str_contains($filePath, 'Classes/Middleware') || str_contains($filePath, 'Classes/Service')) {
            return [
                sprintf(
                    'SECURITY WARNING [Input Handling]: Direct access to superglobal "$%s" in TYPO3 controller/middleware/service. Modern TYPO3 requires PSR-7 ServerRequestInterface ($request->getQueryParams(), $request->getParsedBody()) for clean input abstraction and testing.',
                    $node->name
                )
            ];
        }

        return [];
    }
}
