<?php
declare(strict_types=1);

use Rector\Config\RectorConfig;
use Security\TYPO3\Generated\DisallowUnserializeClassesRector;

require_once __DIR__ . '/DisallowUnserializeClassesRector.php';

return static function (RectorConfig $config): void {
    $config->disableParallel();
    $config->cacheDirectory(__DIR__ . '/.cache');
    $config->rule(DisallowUnserializeClassesRector::class);
};
