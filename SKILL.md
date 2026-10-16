---
name: typo3-administration
description: TYPO3 administration, Symfony Console commands, database schema alignment, and maintenance guidance for TYPO3 v12/v13/v14.
---

# TYPO3 Administration, CLI & Migrations

Target Framework: TYPO3 v12 / v13 / v14

## Required standards

- Use `declare(strict_types=1);` in every PHP file.
- Prefer Symfony Console commands with `#[AsCommand]` and `Command::SUCCESS` return values.
- Keep database work parameterized via `ConnectionPool` and `QueryBuilder` instead of raw SQL.
- Define schema changes in `ext_tables.sql` and use `vendor/bin/typo3 database:updateschema` in CI/CD.
- Avoid deprecated TYPO3 patterns; prefer PSR-14 events and modern core APIs.

## Example command

```php
declare(strict_types=1);

namespace MyVendor\MyExtension\Command;

use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(
    name: 'myextension:cleanup',
    description: 'Cleans up temporary data and expired tokens'
)]
final class CleanupCommand extends Command
{
    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $output->writeln('<info>Cleanup completed successfully.</info>');
        return Command::SUCCESS;
    }
}
```

## Operational guidance

- Register CLI tasks under the extension's command namespace.
- Use dependency injection for services and repository access.
- Keep migration logic versioned, repeatable, and safe.
- Validate changes against the TYPO3 coding and security rules in this repository.
