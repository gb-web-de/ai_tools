<?php

declare(strict_types=1);

namespace Security\TYPO3\Rules;

use PhpParser\Node;
use PhpParser\Node\Expr\MethodCall;
use PHPStan\Analyser\Scope;
use PHPStan\Rules\Rule;

/**
 * @implements Rule<MethodCall>
 */
class ExtbaseQuerySettingsDataLeakRule implements Rule
{
    public function getNodeType(): string
    {
        return MethodCall::class;
    }

    public function processNode(Node $node, Scope $scope): array
    {
        if (!$node->name instanceof Node\Identifier) {
            return [];
        }

        $methodName = $node->name->toString();
        $targetMethods = ['setIgnoreEnableFields', 'setRespectStoragePage', 'setRespectSysLanguage'];

        if (!in_array($methodName, $targetMethods, true)) {
            return [];
        }

        $varType = $scope->getType($node->var);
        $isQuerySettings = false;

        foreach ($varType->getObjectClassNames() as $className) {
            if (str_contains($className, 'QuerySettings')) {
                $isQuerySettings = true;
                break;
            }
        }

        // Fallback check on variable name if type is unknown or mixed
        if (!$isQuerySettings && $node->var instanceof Node\Expr\Variable && is_string($node->var->name)) {
            if (str_contains(strtolower($node->var->name), 'querysettings')) {
                $isQuerySettings = true;
            }
        }

        if (!$isQuerySettings) {
            return [];
        }

        if (count($node->args) > 0) {
            $argValue = $node->args[0]->value;
            // Check for setIgnoreEnableFields(true) or setRespectStoragePage(false)
            if ($methodName === 'setIgnoreEnableFields' && $argValue instanceof Node\Expr\ConstFetch && strtolower($argValue->name->toString()) === 'true') {
                return [
                    sprintf(
                        'SECURITY WARNING [Data Leakage]: Calling %s(true) bypasses deleted, hidden, starttime, and endtime restrictions. This can expose restricted or deleted data to unprivileged users.',
                        $methodName
                    )
                ];
            }

            if (($methodName === 'setRespectStoragePage' || $methodName === 'setRespectSysLanguage') && $argValue instanceof Node\Expr\ConstFetch && strtolower($argValue->name->toString()) === 'false') {
                return [
                    sprintf(
                        'SECURITY WARNING [Data Leakage]: Calling %s(false) disables storage PID or language isolation. Ensure tenant separation is not compromised.',
                        $methodName
                    )
                ];
            }
        }

        return [];
    }
}
