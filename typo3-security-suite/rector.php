<?php

declare(strict_types=1);

use Rector\Config\RectorConfig;
use Rector\Php70\Rector\Variable\RecommendedWorldSuperglobalsArrayMethodRector;
use Rector\Set\ValueObject\SetList;

return static function (RectorConfig $rectorConfig): void {
    $rectorConfig->paths([
        __DIR__ . '/../public/typo3conf/ext/',
    ]);

    $rectorConfig->sets([
        SetList::DEAD_CODE,
        SetList::CODE_QUALITY,
    ]);

    $rectorConfig->rule(RecommendedWorldSuperglobalsArrayMethodRector::class);

    $rectorConfig->skip([
        '*/Vendor/*',
        '*/vendor/*',
    ]);
};
