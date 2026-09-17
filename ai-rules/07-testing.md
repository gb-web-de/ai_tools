# TYPO3 Automated Testing Standards

Target Framework: TYPO3 v12 / v13 / v14
Tooling: `typo3/testing-framework`

## 1. Unit Tests
- Extend `TYPO3\TestingFramework\Core\Unit\UnitTestCase`.
- Tests pure PHP logic without database connection.
- Locate in `Tests/Unit/`.

```php
declare(strict_types=1);

namespace MyVendor\MyExtension\Tests\Unit\Service;

use PHPUnit\Framework\Attributes\Test;
use TYPO3\TestingFramework\Core\Unit\UnitTestCase;

final class PriceCalculationServiceTest extends UnitTestCase
{
    #[Test]
    public function calculatesDiscountCorrectly(): void
    {
        $service = new PriceCalculationService();
        self::assertSame(90.0, $service->applyDiscount(100.0, 10));
    }
}
```

## 2. Functional Tests
- Extend `TYPO3\TestingFramework\Core\Functional\FunctionalTestCase`.
- Bootstraps a lightweight SQLite database and tests real core/extension interactions.
- Locate in `Tests/Functional/`.
