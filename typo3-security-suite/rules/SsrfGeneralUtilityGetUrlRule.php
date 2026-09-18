<?php

declare(strict_types=1);

namespace Security\TYPO3\Rules;

use PhpParser\Node;
use PhpParser\Node\Expr\StaticCall;
use PHPStan\Analyser\Scope;
use PHPStan\Rules\Rule;
use PHPStan\Rules\RuleErrorBuilder;

/**
 * @implements Rule<StaticCall>
 */
class SsrfGeneralUtilityGetUrlRule implements Rule
{
    public function getNodeType(): string
    {
        return StaticCall::class;
    }

    /**
     * @return list<\PHPStan\Rules\IdentifierRuleError>
     */
    public function processNode(Node $node, Scope $scope): array
    {
        if (!$node->name instanceof Node\Identifier) {
            return [];
        }

        if ($node->name->toString() !== 'getUrl') {
            return [];
        }

        $className = '';
        if ($node->class instanceof Node\Name) {
            $className = $node->class->toString();
        }

        if (!str_contains($className, 'GeneralUtility')) {
            return [];
        }

        if (count($node->args) === 0) {
            return [];
        }

        $urlArg = $node->args[0]->value;

        // If it is a string literal (e.g. static configuration URL), it's generally safe
        if ($urlArg instanceof Node\Scalar\String_) {
            return [];
        }

        // If static analysis can resolve the argument to a fixed set of constant
        // strings, the target is not attacker-controlled either. This covers the
        // idiomatic hardening pattern of mapping user input through an allow-list
        // of configured endpoints before the request is issued.
        if ($scope->getType($urlArg)->getConstantStrings() !== []) {
            return [];
        }

        // Variable, method call, or concatenation
        return [
            RuleErrorBuilder::message(
                'SECURITY WARNING [SSRF]: Dynamic URL passed to GeneralUtility::getUrl(). If this URL originates from user input or external data, validate and whitelist the host to prevent Server-Side Request Forgery (SSRF).'
            )->identifier(SecurityRuleIdentifier::SSRF)->build(),
        ];
    }
}
