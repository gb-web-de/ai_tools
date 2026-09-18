<?php

declare(strict_types=1);

namespace Security\TYPO3\Rules;

use PhpParser\Node;
use PhpParser\Node\Stmt\ClassMethod;
use PHPStan\Analyser\Scope;
use PHPStan\Rules\Rule;
use PHPStan\Rules\RuleErrorBuilder;

/**
 * @implements Rule<ClassMethod>
 */
class IgnoreValidationOnMutationRule implements Rule
{
    public function getNodeType(): string
    {
        return ClassMethod::class;
    }

    /**
     * @return list<\PHPStan\Rules\IdentifierRuleError>
     */
    public function processNode(Node $node, Scope $scope): array
    {
        $methodName = $node->name->toString();

        if (!preg_match('/^(update|delete|create|remove|save)Action$/i', $methodName)) {
            return [];
        }

        $docComment = $node->getDocComment();
        if ($docComment !== null && str_contains($docComment->getText(), '@ignorevalidation')) {
            return [
                RuleErrorBuilder::message(
                    sprintf(
                        'SECURITY WARNING [Access Control]: Controller action "%s" uses @ignorevalidation. Unvalidated input in mutating actions can lead to Mass Assignment or Broken Access Control.',
                        $methodName
                    )
                )->identifier(SecurityRuleIdentifier::BROKEN_ACCESS_CONTROL)->build(),
            ];
        }

        foreach ($node->attrGroups as $attrGroup) {
            foreach ($attrGroup->attrs as $attr) {
                $attributeName = $attr->name->toString();
                if (str_contains($attributeName, 'IgnoreValidation')) {
                    return [
                        RuleErrorBuilder::message(
                            sprintf(
                                'SECURITY WARNING [Access Control]: Controller action "%s" has #[IgnoreValidation] attribute. Ensure authorization and manual checks are present.',
                                $methodName
                            )
                        )->identifier(SecurityRuleIdentifier::BROKEN_ACCESS_CONTROL)->build(),
                    ];
                }
            }
        }

        return [];
    }
}
