# TYPO3 Extension Architecture & Configuration

Target Framework: TYPO3 v12 / v13 / v14

## Standard Directory Layout
```
my_extension/
├── Classes/
│   ├── Controller/
│   ├── Domain/
│   │   ├── Model/
│   │   └── Repository/
│   ├── EventListener/
│   └── Middleware/
├── Configuration/
│   ├── RequestMiddlewares.php
│   ├── Services.yaml
│   ├── Sets/                    # TYPO3 v13+ Site Sets
│   │   └── MyExtensionSet/
│   │       ├── config.yaml
│   │       └── setup.typoscript
│   └── TCA/
│       └── tx_myext_domain_model_item.php
├── Resources/
│   ├── Private/
│   │   ├── Language/locallang.xlf
│   │   ├── Layouts/
│   │   ├── Partials/
│   │   └── Templates/
│   └── Public/
│       ├── Css/
│       └── JavaScript/
├── composer.json
└── ext_emconf.php
```

## TCA Best Practices
- Every TCA definition must be located in `Configuration/TCA/<tablename>.php`.
- Return the TCA array as `return [...]`.
- Always configure standard control fields (`tstamp`, `crdate`, `deleted`, `hidden`).
- In TYPO3 v12+, use modern TCA types (`type => 'datetime'`, `type => 'file'`, `type => 'link'`).
