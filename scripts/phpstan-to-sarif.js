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

for (const [filePath, fileInfo] of Object.entries(phpstanData.files || {})) {
  for (const msg of fileInfo.messages || []) {
    let ruleId = 'typo3.codeQuality';
    let level = 'warning';

    if (msg.message.includes('[SQLi]')) {
      ruleId = 'typo3.security.sqlInjection';
      level = 'error';
    } else if (msg.message.includes('[RCE]')) {
      ruleId = 'typo3.security.remoteCodeExecution';
      level = 'error';
    } else if (msg.message.includes('[Access Control]')) {
      ruleId = 'typo3.security.brokenAccessControl';
      level = 'error';
    } else if (msg.message.includes('[XSS]') || msg.message.includes('[ViewHelper XSS]')) {
      ruleId = 'typo3.security.crossSiteScripting';
      level = 'error';
    } else if (msg.message.includes('[SSRF]')) {
      ruleId = 'typo3.security.serverSideRequestForgery';
      level = 'error';
    } else if (msg.message.includes('[Data Leakage]')) {
      ruleId = 'typo3.security.dataLeakage';
      level = 'warning';
    } else if (msg.message.includes('[File Upload]')) {
      ruleId = 'typo3.security.insecureFileUpload';
      level = 'warning';
    } else if (msg.message.includes('[Input Handling]')) {
      ruleId = 'typo3.bestPractice.directSuperglobals';
      level = 'note';
    }

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
