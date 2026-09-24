<?php

declare(strict_types=1);

use a9f\Fractor\Configuration\FractorConfiguration;
use Security\TYPO3\Generated\EscapeRequestDataTypoScriptFractor;

require_once __DIR__ . '/EscapeRequestDataTypoScriptFractor.php';

return FractorConfiguration::configure()
    ->withPaths([__DIR__ . '/fixtures'])
    ->withRules([EscapeRequestDataTypoScriptFractor::class]);
