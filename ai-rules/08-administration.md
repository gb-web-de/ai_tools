# TYPO3 Administration, CLI & Migrations

Target Framework: TYPO3 v12 / v13 / v14

## 1. Symfony Console Commands
- Implement CLI commands extending `Symfony\Component\Console\Command\Command`.
- Use the `#[AsCommand]` attribute:

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

## 2. Database Schema Migrations
- Define table schemas in `ext_tables.sql`.
- Follow TYPO3 SQL conventions; never run raw DDL queries manually.
- Use `vendor/bin/typo3 database:updateschema` in CI/CD pipelines.
