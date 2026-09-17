# TYPO3 Site & Configuration Standards

Target Framework: TYPO3 v12 / v13 / v14

## 1. Site Configuration (`config/sites/<identifier>/config.yaml`)
- Manage multi-language setups, routing, and base URLs cleanly in YAML.
- Use environment variables for sensitive or environment-specific values: `%env(BASE_URL)%`.

## 2. Site Sets (TYPO3 v13+)
- In TYPO3 v13+, use Site Sets (`Configuration/Sets/<name>/`) instead of static TypoScript template includes.
- Declare site set dependencies in `config.yaml`:
```yaml
name: my-vendor/site-package
label: 'Site Package'
dependencies:
  - typo3/fluid-styled-content
```

## 3. TypoScript & TSconfig
- Keep TypoScript strictly declarative. Avoid heavy logic in TypoScript; delegate data transformation to DataProcessors or Extbase controllers.
- Use `@import` syntax for modular inclusion of files.
