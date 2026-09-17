# TYPO3 PHP Architecture (DI, Events, Middlewares)

Target Framework: TYPO3 v12 / v13 / v14
PHP Requirement: PHP 8.2+

## 1. Symfony Dependency Injection
- Prefer Constructor Injection over `GeneralUtility::makeInstance()`.
- Use PHP 8 constructor property promotion.
- Configure autowire and autoconfigure in `Configuration/Services.yaml`.

```php
declare(strict_types=1);

namespace MyVendor\MyExtension\Service;

use TYPO3\CMS\Core\Database\ConnectionPool;
use TYPO3\CMS\Core\Resource\ResourceFactory;

final readonly class OrderProcessingService
{
    public function __construct(
        private ConnectionPool $connectionPool,
        private ResourceFactory $resourceFactory,
    ) {}

    public function process(int $orderId): void
    {
        // Business logic
    }
}
```

## 2. PSR-14 Event Handling
- NEVER use legacy TYPO3 hooks if a PSR-14 Event exists.
- Register event listeners in `Configuration/Services.yaml` using the `#[AsEventListener]` attribute or yaml tags.

```php
declare(strict_types=1);

namespace MyVendor\MyExtension\EventListener;

use TYPO3\CMS\Core\Attribute\AsEventListener;
use TYPO3\CMS\Core\Mail\Event\AfterMailerInitializationEvent;

#[AsEventListener(identifier: 'my-extension/mailer-logger')]
final readonly class MailerLogger
{
    public function __invoke(AfterMailerInitializationEvent $event): void
    {
        // Modify or inspect event
    }
}
```

## 3. PSR-15 Request Middlewares
- Register middlewares in `Configuration/RequestMiddlewares.php`.
- Specify explicit `before` or `after` dependencies relative to core middlewares.
- Always return a `Psr\Http\Message\ResponseInterface`.
