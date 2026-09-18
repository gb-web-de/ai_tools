<?php

declare(strict_types=1);

namespace Security\TYPO3\Rules;

use PhpParser\Node;
use PhpParser\Node\Expr\MethodCall;
use PHPStan\Analyser\Scope;
use PHPStan\Rules\Rule;
use PHPStan\Rules\RuleErrorBuilder;

/**
 * @implements Rule<MethodCall>
 */
class SqlInjectionQueryBuilderRule implements Rule
{
    public function getNodeType(): string
    {
        return MethodCall::class;
    }

    /**
     * @return list<\PHPStan\Rules\IdentifierRuleError>
     */
    public function processNode(Node $node, Scope $scope): array
    {
        if (!$node->name instanceof Node\Identifier) {
            return [];
        }

        $methodName = $node->name->toString();
        $targetMethods = ['where', 'andWhere', 'orWhere', 'statement'];

        if (!in_array($methodName, $targetMethods, true)) {
            return [];
        }

        $varType = $scope->getType($node->var);
        $isQueryBuilder = false;
        foreach ($varType->getObjectClassNames() as $className) {
            if (str_contains($className, 'QueryBuilder')) {
                $isQueryBuilder = true;
                break;
            }
        }

        if (!$isQueryBuilder) {
            return [];
        }

        foreach ($node->args as $arg) {
            $argValue = $arg->value;

            if ($argValue instanceof Node\Expr\BinaryOp\Concat) {
                return [
                    RuleErrorBuilder::message(
                        'SECURITY ERROR [SQLi]: Potential SQL Injection detected in QueryBuilder method. Direct string concatenation found. Use $queryBuilder->createNamedParameter() or expression builders instead.'
                    )->identifier(SecurityRuleIdentifier::SQL_INJECTION)->build(),
                ];
            }

            if ($argValue instanceof Node\Scalar\Encapsed) {
                return [
                    RuleErrorBuilder::message(
                        'SECURITY ERROR [SQLi]: Potential SQL Injection detected. Variable interpolation in SQL statement found. Use $queryBuilder->createNamedParameter().'
                    )->identifier(SecurityRuleIdentifier::SQL_INJECTION)->build(),
                ];
            }
        }

        return [];
    }
}
