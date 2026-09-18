<?php

declare(strict_types=1);

namespace Security\TYPO3\Rules;

use PhpParser\Node;
use PhpParser\Node\Expr\FuncCall;
use PHPStan\Analyser\Scope;
use PHPStan\Rules\Rule;
use PHPStan\Rules\RuleErrorBuilder;

/**
 * @implements Rule<FuncCall>
 */
class InsecureFileOperationRule implements Rule
{
    public function getNodeType(): string
    {
        return FuncCall::class;
    }

    /**
     * @return list<\PHPStan\Rules\IdentifierRuleError>
     */
    public function processNode(Node $node, Scope $scope): array
    {
        if (!$node->name instanceof Node\Name) {
            return [];
        }

        $funcName = strtolower($node->name->toString());

        if ($funcName === 'move_uploaded_file') {
            return [
                RuleErrorBuilder::message(
                    'SECURITY WARNING [File Upload]: Raw move_uploaded_file() detected. TYPO3 extensions must use the File Abstraction Layer (FAL ResourceFactory) to ensure strict MIME-type, storage permissions, and fileDenyPattern validation.'
                )->identifier(SecurityRuleIdentifier::INSECURE_FILE_UPLOAD)->build(),
            ];
        }

        return [];
    }
}
