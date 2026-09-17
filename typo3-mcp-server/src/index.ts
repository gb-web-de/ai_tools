import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import Parser from "rss-parser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SecurityFinding {
  type: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  file: string;
  line?: number;
  message: string;
  snippet?: string;
  recommendation: string;
}

class Typo3SecurityMcpServer {
  private server: Server;
  private rssParser: Parser;
  private suitePath: string;

  constructor() {
    this.server = new Server(
      {
        name: "typo3-security-mcp",
        version: "1.2.0"
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.rssParser = new Parser();
    this.suitePath = this.resolveSuitePath();
    this.setupHandlers();
  }

  private resolveSuitePath(): string {
    const candidates = [
      path.resolve(__dirname, "../../typo3-security-suite"),
      path.resolve(__dirname, "../typo3-security-suite"),
      path.resolve(process.cwd(), "typo3-security-suite"),
      path.resolve(process.cwd(), "../typo3-security-suite")
    ];

    for (const c of candidates) {
      if (fs.existsSync(c)) {
        return c;
      }
    }
    return candidates[0];
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "audit_typo3_instance",
          description: "Prüft eine TYPO3-Instanz auf Konfigurationsschwächen, Dateirechte, Install Tool Status und Composer-Abhängigkeiten.",
          inputSchema: {
            type: "object",
            properties: {
              projectRoot: {
                type: "string",
                description: "Absoluter Pfad zum TYPO3 Projekt-Wurzelverzeichnis (wo composer.json liegt)."
              }
            },
            required: ["projectRoot"]
          }
        },
        {
          name: "analyze_typo3_extension",
          description: "Umfassender Scan einer TYPO3 Extension. Nutzt tiefgehende PHPStan AST-Sicherheitsregeln und Python Fluid-Scanning (mit Fallback auf Heuristik).",
          inputSchema: {
            type: "object",
            properties: {
              extensionPath: {
                type: "string",
                description: "Absoluter Pfad zum Extension-Verzeichnis."
              }
            },
            required: ["extensionPath"]
          }
        },
        {
          name: "run_phpstan_security_audit",
          description: "Führt die dedizierten TYPO3 PHPStan AST-Sicherheitsregeln (SQLi, Broken Access Control, Echo XSS, Data Leaks) auf beliebigem PHP-Code aus.",
          inputSchema: {
            type: "object",
            properties: {
              targetPath: {
                type: "string",
                description: "Pfad zur zu analysierenden Extension oder PHP-Datei."
              }
            },
            required: ["targetPath"]
          }
        },
        {
          name: "fix_fluid_xss",
          description: "Automatische Reparatur von Fluid-Template XSS-Schwachstellen (ersetzt unsicheres f:format.raw() und aktiviert sicheres Escaping).",
          inputSchema: {
            type: "object",
            properties: {
              templatesPath: {
                type: "string",
                description: "Pfad zu den Fluid-Templates (z. B. Resources/Private/Templates oder eine .html Datei)."
              }
            },
            required: ["templatesPath"]
          }
        },
        {
          name: "apply_rector_fixes",
          description: "Führt Rector für automatische Refactorings, Deprecation-Bereinigung und Code-Qualitätssteigerung aus.",
          inputSchema: {
            type: "object",
            properties: {
              targetPath: {
                type: "string",
                description: "Pfad zum Quellcode."
              },
              dryRun: {
                type: "boolean",
                description: "Wenn true, werden nur Änderungen angezeigt, aber keine Dateien verändert (Standard: true)."
              }
            },
            required: ["targetPath"]
          }
        },
        {
          name: "sync_security_advisories",
          description: "Liest die neuesten TYPO3 Security Advisories (TYPO3-PSA / TYPO3-EXT-SA) vom offiziellen RSS Feed ein.",
          inputSchema: {
            type: "object",
            properties: {
              limit: {
                type: "number",
                description: "Anzahl der abzurufenden Security Advisories (Standard: 10)."
              }
            }
          }
        },
        {
          name: "check_fluid_templates",
          description: "Sucht gezielt in Fluid-Templates (.html) nach f:format.raw(), unsicherem Dynamic Tag Generation und XSS-Risiken.",
          inputSchema: {
            type: "object",
            properties: {
              templatesPath: {
                type: "string",
                description: "Pfad zum Template-Verzeichnis (z. B. Resources/Private/Templates)."
              }
            },
            required: ["templatesPath"]
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "audit_typo3_instance":
            return await this.handleAuditInstance(args?.projectRoot as string);
          case "analyze_typo3_extension":
            return await this.handleAnalyzeExtension(args?.extensionPath as string);
          case "run_phpstan_security_audit":
            return await this.handleRunPhpstanAudit(args?.targetPath as string);
          case "fix_fluid_xss":
            return await this.handleFixFluidXss(args?.templatesPath as string);
          case "apply_rector_fixes":
            return await this.handleApplyRectorFixes(args?.targetPath as string, args?.dryRun !== false);
          case "sync_security_advisories":
            return await this.handleSyncAdvisories((args?.limit as number) || 10);
          case "check_fluid_templates":
            return await this.handleCheckFluidTemplates(args?.templatesPath as string);
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unbekanntes Tool: ${name}`);
        }
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Fehler bei Ausführung von ${name}: ${error.message}`
            }
          ],
          isError: true
        };
      }
    });
  }

  private async handleAuditInstance(projectRoot: string) {
    if (!fs.existsSync(projectRoot)) {
      throw new Error(`Projektverzeichnis nicht gefunden: ${projectRoot}`);
    }

    const findings: SecurityFinding[] = [];

    // 1. Composer Security Audit
    let composerAuditOutput = "";
    try {
      composerAuditOutput = execSync("composer audit --format=json", {
        cwd: projectRoot,
        encoding: "utf8"
      });
    } catch (e: any) {
      composerAuditOutput = e.stdout ? e.stdout.toString() : e.message;
    }

    // 2. Settings.php / LocalConfiguration.php Audit
    const settingsPaths = [
      path.join(projectRoot, "config/system/settings.php"),
      path.join(projectRoot, "typo3conf/LocalConfiguration.php")
    ];

    let settingsFound = false;
    for (const settingsPath of settingsPaths) {
      if (fs.existsSync(settingsPath)) {
        settingsFound = true;
        const content = fs.readFileSync(settingsPath, "utf8");

        if (content.includes("'displayErrors' => 1") || content.includes("'displayErrors' => true")) {
          findings.push({
            type: "CONFIGURATION",
            severity: "HIGH",
            file: settingsPath,
            message: "displayErrors ist in der Systemkonfiguration aktiviert.",
            recommendation: "Setze displayErrors auf 0 oder -1 in Production, um keine sensitiven Systemdetails preiszugeben."
          });
        }

        if (content.includes("'devIPmask' => '*'")) {
          findings.push({
            type: "CONFIGURATION",
            severity: "CRITICAL",
            file: settingsPath,
            message: "devIPmask steht auf '*', alle Anfragen gelten als Developer-IPs.",
            recommendation: "Beschränke devIPmask auf spezifische Admin-IPs oder lasse das Feld leer."
          });
        }

        if (content.includes("'enable_install_tool' => true")) {
          findings.push({
            type: "CONFIGURATION",
            severity: "HIGH",
            file: settingsPath,
            message: "Install Tool ist dauerhaft aktiviert (ENABLE_INSTALL_TOOL file bypass).",
            recommendation: "Deaktiviere das Install Tool nach Wartungsarbeiten wieder."
          });
        }

        if (content.includes("'trustedHostsPattern' => '.*'")) {
          findings.push({
            type: "CONFIGURATION",
            severity: "HIGH",
            file: settingsPath,
            message: "trustedHostsPattern erlaubt alle Host-Header (HTTP Host Header Injection Risk).",
            recommendation: "Spezifiziere Host-Muster explizit (z. B. '.*\\.domain\\.com')."
          });
        }
      }
    }

    if (!settingsFound) {
      findings.push({
        type: "CONFIGURATION",
        severity: "INFO",
        file: projectRoot,
        message: "Keine settings.php oder LocalConfiguration.php im Standardpfad gefunden.",
        recommendation: "Prüfe benutzerdefinierte Konfigurationspfade."
      });
    }

    // 3. Sensible Dateien im Webroot prüfen
    const publicDir = fs.existsSync(path.join(projectRoot, "public"))
      ? path.join(projectRoot, "public")
      : projectRoot;

    const sensitiveFiles = [".env", "composer.json", "composer.lock", "var/log"];
    for (const file of sensitiveFiles) {
      const fullPath = path.join(publicDir, file);
      if (fs.existsSync(fullPath)) {
        findings.push({
          type: "EXPOSURE",
          severity: "HIGH",
          file: fullPath,
          message: `Sensible Datei/Ordner '${file}' befindet sich direkt im Webroot.`,
          recommendation: "Verschiebe das Dokument-Root eine Ebene tiefer (public/) oder sperre den Zugriff via Webserver-Rules."
        });
      }
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              summary: `Audit abgeschlossen mit ${findings.length} Befunden.`,
              findings,
              composerAuditRaw: composerAuditOutput ? JSON.parse(composerAuditOutput || "{}") : null
            },
            null,
            2
          )
        }
      ]
    };
  }

  private async handleRunPhpstanAudit(targetPath: string) {
    const resolvedTarget = path.resolve(targetPath);
    if (!fs.existsSync(resolvedTarget)) {
      throw new Error(`Zielpfad nicht gefunden: ${resolvedTarget}`);
    }

    const phpstanBin = path.join(this.suitePath, "vendor/bin/phpstan");
    const phpstanNeon = path.join(this.suitePath, "phpstan.neon");

    if (!fs.existsSync(phpstanBin) || !fs.existsSync(phpstanNeon)) {
      throw new Error(
        `PHPStan oder phpstan.neon in ${this.suitePath} nicht gefunden. Führe 'composer install' in typo3-security-suite aus.`
      );
    }

    let output = "";
    try {
      output = execSync(
        `"${phpstanBin}" analyse -c "${phpstanNeon}" --error-format=json --no-progress "${resolvedTarget}"`,
        {
          cwd: this.suitePath,
          encoding: "utf8",
          maxBuffer: 10 * 1024 * 1024
        }
      );
    } catch (e: any) {
      output = e.stdout ? e.stdout.toString() : e.message;
    }

    let parsedResult = null;
    try {
      parsedResult = JSON.parse(output);
    } catch {
      return {
        content: [{ type: "text", text: output }]
      };
    }

    const findings: SecurityFinding[] = [];
    if (parsedResult.files) {
      for (const [filePath, fileData] of Object.entries<any>(parsedResult.files)) {
        for (const msg of fileData.messages || []) {
          let severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" = "HIGH";
          let type = "STATIC_ANALYSIS";

          if (msg.message.includes("[SQLi]")) {
            severity = "CRITICAL";
            type = "SQL_INJECTION";
          } else if (msg.message.includes("[Access Control]")) {
            severity = "HIGH";
            type = "BROKEN_ACCESS_CONTROL";
          } else if (msg.message.includes("[XSS]")) {
            severity = "HIGH";
            type = "XSS";
          } else if (msg.message.includes("[Data Leakage]")) {
            severity = "HIGH";
            type = "DATA_LEAKAGE";
          }

          findings.push({
            type,
            severity,
            file: filePath,
            line: msg.line,
            message: msg.message,
            recommendation: "Behebe die Verletzung gemäß den TYPO3 AI Richtlinien."
          });
        }
      }
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              scannedPath: resolvedTarget,
              engine: "PHPStan AST Security Rules",
              totalErrors: parsedResult.totals?.file_errors || findings.length,
              findings
            },
            null,
            2
          )
        }
      ]
    };
  }

  private async handleFixFluidXss(templatesPath: string) {
    const resolvedTarget = path.resolve(templatesPath);
    if (!fs.existsSync(resolvedTarget)) {
      throw new Error(`Templates-Pfad nicht gefunden: ${resolvedTarget}`);
    }

    const scriptPath = path.join(this.suitePath, "scripts/scan_fluid_xss.py");
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Skript nicht gefunden: ${scriptPath}`);
    }

    let output = "";
    try {
      output = execSync(`python3 "${scriptPath}" --fix "${resolvedTarget}"`, {
        encoding: "utf8"
      });
    } catch (e: any) {
      output = e.stdout ? e.stdout.toString() : e.message;
    }

    return {
      content: [
        {
          type: "text",
          text: output
        }
      ]
    };
  }

  private async handleApplyRectorFixes(targetPath: string, dryRun: boolean) {
    const resolvedTarget = path.resolve(targetPath);
    if (!fs.existsSync(resolvedTarget)) {
      throw new Error(`Zielpfad nicht gefunden: ${resolvedTarget}`);
    }

    const rectorBin = path.join(this.suitePath, "vendor/bin/rector");
    const rectorConfig = path.join(this.suitePath, "rector.php");

    if (!fs.existsSync(rectorBin)) {
      throw new Error(`Rector unter ${rectorBin} nicht gefunden.`);
    }

    const flag = dryRun ? "--dry-run" : "";
    let output = "";
    try {
      output = execSync(`"${rectorBin}" process "${resolvedTarget}" --config="${rectorConfig}" ${flag}`, {
        cwd: this.suitePath,
        encoding: "utf8"
      });
    } catch (e: any) {
      output = e.stdout ? e.stdout.toString() : e.message;
    }

    return {
      content: [
        {
          type: "text",
          text: output
        }
      ]
    };
  }

  private async handleAnalyzeExtension(extPath: string) {
    const resolvedExt = path.resolve(extPath);
    if (!fs.existsSync(resolvedExt)) {
      throw new Error(`Extension-Pfad nicht gefunden: ${resolvedExt}`);
    }

    // Prüfen, ob PHPStan Suite verfügbar ist für tiefgehenden AST Scan
    const phpstanBin = path.join(this.suitePath, "vendor/bin/phpstan");
    if (fs.existsSync(phpstanBin)) {
      const phpstanResult = await this.handleRunPhpstanAudit(resolvedExt);
      let fluidResultText = "";

      const scriptPath = path.join(this.suitePath, "scripts/scan_fluid_xss.py");
      if (fs.existsSync(scriptPath)) {
        try {
          fluidResultText = execSync(`python3 "${scriptPath}" "${resolvedExt}"`, {
            encoding: "utf8"
          });
        } catch (e: any) {
          fluidResultText = e.stdout ? e.stdout.toString() : e.message;
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                extension: resolvedExt,
                mode: "DEEP_AST_ANALYSIS",
                phpstanResults: JSON.parse(phpstanResult.content[0].text),
                fluidTemplateScan: fluidResultText
              },
              null,
              2
            )
          }
        ]
      };
    }

    // Heuristik-Fallback
    const findings: SecurityFinding[] = [];
    const files = this.getAllFiles(resolvedExt, [".php", ".html"]);

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.split("\n");

      lines.forEach((line, index) => {
        const lineNum = index + 1;

        if (line.includes("->statement(") || (line.includes("->where(") && line.includes("$"))) {
          if (!line.includes("->createNamedParameter(") && !line.includes("->quote(")) {
            findings.push({
              type: "SQL_INJECTION",
              severity: "HIGH",
              file: filePath,
              line: lineNum,
              snippet: line.trim(),
              message: "Mögliche SQL Injection: Variablenübergabe in DB-Abfrage ohne Prepared Statement / Parameter Quoting.",
              recommendation: "Verwende $queryBuilder->createNamedParameter() zur sicheren Variablenübergabe."
            });
          }
        }

        if (line.includes("@ignorevalidation") && (filePath.includes("Controller") || content.includes("Action"))) {
          findings.push({
            type: "BROKEN_ACCESS_CONTROL",
            severity: "MEDIUM",
            file: filePath,
            line: lineNum,
            snippet: line.trim(),
            message: "Verwendung von @ignorevalidation entdeckt.",
            recommendation: "Stelle sicher, dass in der Controller-Methode Berechtigungen und Objekt-Eigentümerschaft explizit geprüft werden."
          });
        }

        if (line.includes("f:format.raw(") || line.includes("-> f:format.raw()")) {
          findings.push({
            type: "XSS",
            severity: "HIGH",
            file: filePath,
            line: lineNum,
            snippet: line.trim(),
            message: "Fluid f:format.raw() schaltet das HTML-Escaping aus.",
            recommendation: "Prüfe, ob der Inhalt aus Benutzereingaben stammt. Bereinige die Daten mit HTMLPurifier falls nötig."
          });
        }

        if (line.match(/\bunserialize\s*\(/) && !line.includes("allowed_classes")) {
          findings.push({
            type: "DESERIALIZATION",
            severity: "CRITICAL",
            file: filePath,
            line: lineNum,
            snippet: line.trim(),
            message: "unserialize() ohne Einschränkung von 'allowed_classes' verwendet.",
            recommendation: "Verwende JSON anstelle von unserialize() oder setze 'allowed_classes => false'."
          });
        }
      });
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              scannedFilesCount: files.length,
              findingsCount: findings.length,
              mode: "HEURISTIC_FALLBACK",
              findings
            },
            null,
            2
          )
        }
      ]
    };
  }

  private async handleSyncAdvisories(limit: number) {
    const feedUrl = "https://news.typo3.com/security/rss-security";
    const feed = await this.rssParser.parseURL(feedUrl);

    const items = (feed.items || []).slice(0, limit).map((item) => ({
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
      summary: item.contentSnippet || item.content
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              feedTitle: feed.title,
              fetchedCount: items.length,
              advisories: items
            },
            null,
            2
          )
        }
      ]
    };
  }

  private async handleCheckFluidTemplates(templatesPath: string) {
    const resolvedTarget = path.resolve(templatesPath);
    if (!fs.existsSync(resolvedTarget)) {
      throw new Error(`Template-Verzeichnis nicht gefunden: ${resolvedTarget}`);
    }

    const scriptPath = path.join(this.suitePath, "scripts/scan_fluid_xss.py");
    if (fs.existsSync(scriptPath)) {
      let output = "";
      try {
        output = execSync(`python3 "${scriptPath}" "${resolvedTarget}"`, {
          encoding: "utf8"
        });
      } catch (e: any) {
        output = e.stdout ? e.stdout.toString() : e.message;
      }
      return {
        content: [{ type: "text", text: output }]
      };
    }

    const findings: SecurityFinding[] = [];
    const files = this.getAllFiles(resolvedTarget, [".html", ".xml", ".txt"]);

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.split("\n");

      lines.forEach((line, index) => {
        const lineNum = index + 1;

        if (line.includes("f:format.raw")) {
          findings.push({
            type: "XSS_RAW_OUTPUT",
            severity: "HIGH",
            file: filePath,
            line: lineNum,
            snippet: line.trim(),
            message: "Verwendung von f:format.raw deaktiviert automatisches Output Escaping.",
            recommendation: "Nutze f:format.htmlspecialchars oder definiere eigene Sanitizer ViewHelper."
          });
        }
      });
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ scannedFiles: files.length, findings }, null, 2)
        }
      ]
    };
  }

  private getAllFiles(dirPath: string, extensions: string[]): string[] {
    let results: string[] = [];
    const list = fs.readdirSync(dirPath);

    list.forEach((file) => {
      const fullPath = path.join(dirPath, file);
      const stat = fs.statSync(fullPath);

      if (stat && stat.isDirectory()) {
        if (!file.startsWith(".") && file !== "node_modules" && file !== "vendor") {
          results = results.concat(this.getAllFiles(fullPath, extensions));
        }
      } else {
        const ext = path.extname(fullPath).toLowerCase();
        if (extensions.includes(ext)) {
          results.push(fullPath);
        }
      }
    });

    return results;
  }

  public async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("TYPO3 Security MCP Server runs on stdio");
  }
}

const server = new Typo3SecurityMcpServer();
server.run().catch((err) => {
  console.error("Fatal error starting server:", err);
  process.exit(1);
});
