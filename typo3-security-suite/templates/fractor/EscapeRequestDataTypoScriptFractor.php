<?php

declare(strict_types=1);

namespace Security\TYPO3\Generated;

use a9f\FractorTypoScript\AbstractTypoScriptFractor;
use Helmich\TypoScriptParser\Parser\AST\NestedAssignment;
use Helmich\TypoScriptParser\Parser\AST\ObjectPath;
use Helmich\TypoScriptParser\Parser\AST\Operator\Assignment;
use Helmich\TypoScriptParser\Parser\AST\Scalar;
use Helmich\TypoScriptParser\Parser\AST\Statement;
use Symplify\RuleDocGenerator\ValueObject\CodeSample\CodeSample;
use Symplify\RuleDocGenerator\ValueObject\RuleDefinition;

/**
 * Adds htmlSpecialChars = 1 next to a stdWrap that reads request data.
 *
 * GENERATED from repeated approved developer fixes. Review before use.
 *
 * The rule only acts where the outcome is unambiguous: a `data` assignment
 * whose value names a request source, inside an object that sets neither
 * htmlSpecialChars nor intval. It never rewrites an existing value, so a
 * deliberate `htmlSpecialChars = 0` is left alone for a human to judge.
 */
final class EscapeRequestDataTypoScriptFractor extends AbstractTypoScriptFractor
{
    /**
     * Sources whose content is shaped by the request.
     */
    private const REQUEST_SOURCES = '/^\s*(?:GP|GET|POST|TSFE|getenv|global)\s*:/i';

    /**
     * Setting any of these means the author already decided how the value is
     * neutralised, so adding another one would be noise at best.
     */
    private const NEUTRALISING_PROPERTIES = ['htmlSpecialChars', 'intval', 'stdWrap.htmlSpecialChars'];

    public function refactor(Statement $statement): null|Statement|int|array
    {
        if (!$statement instanceof NestedAssignment) {
            return null;
        }

        $readsRequestData = false;
        foreach ($statement->statements as $child) {
            if (!$child instanceof Assignment) {
                continue;
            }

            $property = $this->relativeName($child->object, $statement->object);

            if (in_array($property, self::NEUTRALISING_PROPERTIES, true)) {
                // Already handled - by escaping or by casting. Nothing to do.
                return null;
            }

            if (in_array($property, ['data', 'insertData'], true)
                && preg_match(self::REQUEST_SOURCES, $child->value->value) === 1) {
                $readsRequestData = true;
            }
        }

        if (!$readsRequestData) {
            return null;
        }

        $statement->statements[] = new Assignment(
            new ObjectPath(
                $statement->object->absoluteName . '.htmlSpecialChars',
                'htmlSpecialChars'
            ),
            new Scalar('1'),
            $statement->sourceLine
        );

        return $statement;
    }

    private function relativeName(ObjectPath $child, ObjectPath $parent): string
    {
        $prefix = $parent->absoluteName . '.';

        return str_starts_with($child->absoluteName, $prefix)
            ? substr($child->absoluteName, strlen($prefix))
            : $child->relativeName;
    }

    public function getRuleDefinition(): RuleDefinition
    {
        return new RuleDefinition(
            'Escape request data rendered through TypoScript stdWrap',
            [new CodeSample(
                <<<'TYPOSCRIPT'
lib.searchTerm = TEXT
lib.searchTerm {
    data = GP:q
}
TYPOSCRIPT,
                <<<'TYPOSCRIPT'
lib.searchTerm = TEXT
lib.searchTerm {
    data = GP:q
    htmlSpecialChars = 1
}
TYPOSCRIPT
            )]
        );
    }
}
