<?php

declare(strict_types=1);

namespace Security\TYPO3\Rules;

use PhpParser\Node;
use PhpParser\Node\Expr\FuncCall;
use PHPStan\Analyser\Scope;
use PHPStan\Rules\Rule;

/**
 * @implements Rule<FuncCall>
 */
class InsecureDeserializationRule implements Rule
{
    public function getNodeType(): string
    {
        return FuncCall::class;
    }

    public function processNode(Node $node, Scope $scope): array
    {
        if (!$node->name instanceof Node\Name) {
            return [];
        }

        $funcName = strtolower($node->name->toString());
        if ($funcName !== 'unserialize') {
            return [];
        }

        $args = $node->args;
        if (count($args) === 0) {
            return [];
        }

        // Check if options argument exists
        if (count($args) < 2) {
            return [
                'SECURITY CRITICAL [RCE]: Calling unserialize() without options array. Untrusted input can trigger Insecure Deserialization and Remote Code Execution. Use json_decode() or pass [\'allowed_classes\' => false].'
            ];
        }

        $optionsArg = $args[1]->value;
        if (!$optionsArg instanceof Node\Expr\Array_) {
            return [
                'SECURITY WARNING [RCE]: Calling unserialize() with dynamic options argument. Ensure \'allowed_classes\' is strictly set to false.'
            ];
        }

        $hasAllowedClassesFalse = false;
        foreach ($optionsArg->items as $item) {
            if ($item === null || $item->key === null) {
                continue;
            }
            if ($item->key instanceof Node\Scalar\String_ && $item->key->value === 'allowed_classes') {
                if ($item->value instanceof Node\Expr\ConstFetch && strtolower($item->value->name->toString()) === 'false') {
                    $hasAllowedClassesFalse = true;
                }
            }
        }

        if (!$hasAllowedClassesFalse) {
            return [
                'SECURITY CRITICAL [RCE]: Insecure unserialize() detected. \'allowed_classes\' must be explicitly set to false to prevent Object Injection attacks.'
            ];
        }

        return [];
    }
}
