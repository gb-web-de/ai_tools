<?php

declare(strict_types=1);

namespace Security\TYPO3\Rules;

use PhpParser\Node;
use PhpParser\Node\Stmt\Property;
use PHPStan\Analyser\Scope;
use PHPStan\Rules\Rule;
use PHPStan\Rules\RuleErrorBuilder;

/**
 * @implements Rule<Property>
 */
class FluidViewHelperEscapingRule implements Rule
{
    public function getNodeType(): string
    {
        return Property::class;
    }

    /**
     * @return list<\PHPStan\Rules\IdentifierRuleError>
     */
    public function processNode(Node $node, Scope $scope): array
    {
        $file = $scope->getFile();
        if (!str_contains($file, 'ViewHelpers') && !str_contains($file, 'ViewHelper')) {
            return [];
        }

        foreach ($node->props as $prop) {
            $name = $prop->name->toString();
            if ($name === 'escapeOutput' || $name === 'escapeChildren') {
                if ($prop->default instanceof Node\Expr\ConstFetch && strtolower($prop->default->name->toString()) === 'false') {
                    return [
                        RuleErrorBuilder::message(
                            sprintf(
                                'SECURITY WARNING [ViewHelper XSS]: Custom ViewHelper sets "$%s = false;". Disabling output/children escaping exposes templates to Cross-Site Scripting. Ensure all dynamic data is strictly sanitized using SanitizerBuilder or HTMLSpecialChars.',
                                $name
                            )
                        )->identifier(SecurityRuleIdentifier::XSS_VIEWHELPER_ESCAPING)->build(),
                    ];
                }
            }
        }

        return [];
    }
}
