#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

/**
 * Converts PHPStan JSON output to OASIS SARIF v2.1.0 format
 * for GitHub Code Scanning / Security Alerts integration.
 */

const inputFile = process.argv[2];
const outputFile = process.argv[3] || 'phpstan-results.sarif';

if (!inputFile) {
  console.error('Usage: node scripts/phpstan-to-sarif.js <phpstan-json-file> [output-sarif-file]');
  process.exit(1);
}

if (!fs.existsSync(inputFile)) {
  console.error(`Input file not found: ${inputFile}`);
  process.exit(1);
}

const raw = fs.readFileSync(inputFile, 'utf8');
let phpstanData;
try {
  phpstanData = JSON.parse(raw);
} catch (err) {
  console.error('Failed to parse PHPStan JSON:', err.message);
  process.exit(1);
}

const results = [];
const rulesMap = new Map();

/**
 * The security rules emit stable PHPStan error identifiers. Mapping on those
 * rather than on message substrings means a reworded message can no longer
 * silently downgrade a finding to the generic code-quality bucket.
 */
const RULE_BY_IDENTIFIER = {
  'typo3Security.sqlInjection': ['typo3.security.sqlInjection', 'error'],
  'typo3Security.insecureDeserialization': ['typo3.security.remoteCodeExecution', 'error'],
  'typo3Security.brokenAccessControl': ['typo3.security.brokenAccessControl', 'error'],
  'typo3Security.xssEcho': ['typo3.security.crossSiteScripting', 'error'],
  'typo3Security.xssViewHelperEscaping': ['typo3.security.crossSiteScripting', 'error'],
  'typo3Security.ssrf': ['typo3.security.serverSideRequestForgery', 'error'],
  'typo3Security.dataLeakage': ['typo3.security.dataLeakage', 'warning'],
  'typo3Security.insecureFileUpload': ['typo3.security.insecureFileUpload', 'warning'],
  'typo3Security.directSuperglobals': ['typo3.bestPractice.directSuperglobals', 'note'],

  // JavaScript and TypoScript scanners share the identifier contract, so their
  // findings land in the same GitHub security categories as the PHP ones.
  'typo3Security.js.domXss': ['typo3.security.crossSiteScripting', 'error'],
  'typo3Security.js.jqueryHtmlSink': ['typo3.security.crossSiteScripting', 'error'],
  'typo3Security.js.codeInjection': ['typo3.security.remoteCodeExecution', 'error'],
  'typo3Security.js.openRedirect': ['typo3.security.openRedirect', 'error'],
  'typo3Security.js.postMessageOrigin': ['typo3.security.brokenAccessControl', 'warning'],
  'typo3Security.js.hardcodedSecret': ['typo3.security.hardcodedCredential', 'error'],
  'typo3Security.ts.unescapedUserInput': ['typo3.security.crossSiteScripting', 'error'],
  'typo3Security.ts.unsafeParseFunc': ['typo3.security.crossSiteScripting', 'error'],
  'typo3Security.ts.openRedirect': ['typo3.security.openRedirect', 'error'],
  'typo3Security.ts.cacheDisabled': ['typo3.security.denialOfService', 'warning'],
  'typo3Security.ts.debugExposure': ['typo3.security.informationDisclosure', 'warning'],
};

/** Fallback for findings produced before identifiers were introduced. */
const LEGACY_TAGS = [
  ['[SQLi]', 'typo3.security.sqlInjection', 'error'],
  ['[RCE]', 'typo3.security.remoteCodeExecution', 'error'],
  ['[Access Control]', 'typo3.security.brokenAccessControl', 'error'],
  ['[ViewHelper XSS]', 'typo3.security.crossSiteScripting', 'error'],
  ['[XSS]', 'typo3.security.crossSiteScripting', 'error'],
  ['[SSRF]', 'typo3.security.serverSideRequestForgery', 'error'],
  ['[Data Leakage]', 'typo3.security.dataLeakage', 'warning'],
  ['[File Upload]', 'typo3.security.insecureFileUpload', 'warning'],
  ['[Input Handling]', 'typo3.bestPractice.directSuperglobals', 'note'],
];

function classify(msg) {
  const mapped = RULE_BY_IDENTIFIER[msg.identifier];
  if (mapped) return mapped;

  const legacy = LEGACY_TAGS.find(([tag]) => msg.message.includes(tag));
  if (legacy) return [legacy[1], legacy[2]];

  return ['typo3.codeQuality', 'warning'];
}

for (const [filePath, fileInfo] of Object.entries(phpstanData.files || {})) {
  for (const msg of fileInfo.messages || []) {
    const [ruleId, level] = classify(msg);

    if (!rulesMap.has(ruleId)) {
      rulesMap.set(ruleId, {
        id: ruleId,
        shortDescription: { text: ruleId },
        defaultConfiguration: { level }
      });
    }

    const relPath = path.isAbsolute(filePath) ? path.relative(process.cwd(), filePath) : filePath;

    results.push({
      ruleId,
      level,
      message: {
        text: msg.message
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: {
              uri: relPath
            },
            region: {
              startLine: msg.line || 1
            }
          }
        }
      ]
    });
  }
}

const sarifLog = {
  $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
  version: '2.1.0',
  runs: [
    {
      tool: {
        driver: {
          name: 'TYPO3 PHPStan Security Suite',
          version: '2.0.0',
          informationUri: 'https://github.com/typo3-ai-suite',
          rules: Array.from(rulesMap.values())
        }
      },
      results
    }
  ]
};

fs.writeFileSync(outputFile, JSON.stringify(sarifLog, null, 2), 'utf8');
console.log(`✅ SARIF export complete: ${results.length} security alerts written to ${outputFile}`);
