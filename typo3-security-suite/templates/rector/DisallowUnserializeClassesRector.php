<?php
declare(strict_types=1);

namespace Security\TYPO3\Generated;

use PhpParser\Node;
use PhpParser\Node\Arg;
use PhpParser\Node\Expr\Array_;
use PhpParser\Node\Expr\ArrayItem;
use PhpParser\Node\Expr\ConstFetch;
use PhpParser\Node\Expr\FuncCall;
use PhpParser\Node\Name;
use PhpParser\Node\Name\FullyQualified;
use PhpParser\Node\Scalar\String_;
use Rector\Rector\AbstractRector;
use Symplify\RuleDocGenerator\ValueObject\CodeSample\CodeSample;
use Symplify\RuleDocGenerator\ValueObject\RuleDefinition;

/** Review candidate: object deserialization may be intentionally required by the application. */
final class DisallowUnserializeClassesRector extends AbstractRector
{
    public function getRuleDefinition(): RuleDefinition
    {
        return new RuleDefinition('Disallow object creation in explicit native unserialize calls', [
            new CodeSample('\unserialize($value);', "\unserialize(\$value, ['allowed_classes' => false]);"),
        ]);
    }

    /** @return array<class-string<Node>> */
    public function getNodeTypes(): array
    {
        return [FuncCall::class];
    }

    public function refactor(Node $node): ?Node
    {
        // Qualified native calls only: never rewrite a namespaced function or dynamic call.
        if (!$node instanceof FuncCall || !$node->name instanceof FullyQualified
            || strtolower($node->name->toString()) !== 'unserialize' || count($node->args) !== 1) {
            return null;
        }
        $argument = $node->args[0];
        if (!$argument instanceof Arg || $argument->unpack || $argument->name !== null) {
            return null;
        }
        $node->args[] = new Arg(new Array_([
            new ArrayItem(new ConstFetch(new Name('false')), new String_('allowed_classes')),
        ], ['kind' => Array_::KIND_SHORT]));
        return $node;
    }
}
