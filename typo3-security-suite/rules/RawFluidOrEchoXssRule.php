<?php

declare(strict_types=1);

namespace Security\TYPO3\Rules;

use PhpParser\Node;
use PhpParser\Node\Stmt\Echo_;
use PHPStan\Analyser\Scope;
use PHPStan\Rules\Rule;
use PHPStan\Rules\RuleErrorBuilder;

/**
 * @implements Rule<Echo_>
 */
class RawFluidOrEchoXssRule implements Rule
{
    public function getNodeType(): string
    {
        return Echo_::class;
    }

    /**
     * @return list<\PHPStan\Rules\IdentifierRuleError>
     */
    public function processNode(Node $node, Scope $scope): array
    {
        $file = $scope->getFile();
        if (str_contains($file, 'Classes/Controller') || str_contains($file, 'Classes/ViewHelpers')) {
            return [
                RuleErrorBuilder::message(
                    'SECURITY WARNING [XSS]: Direct echo statement in TYPO3 Controller or ViewHelper. Use Fluid templating or HTMLSpecialChars / Sanitizer to prevent XSS.'
                )->identifier(SecurityRuleIdentifier::XSS_ECHO)->build(),
            ];
        }

        return [];
    }
}
