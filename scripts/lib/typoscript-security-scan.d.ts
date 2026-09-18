export interface TypoScriptFinding {
  identifier: string;
  line: number;
  path: string;
  message: string;
}

export interface TypoScriptAssignment {
  path: string;
  operator: string;
  value: string;
  line: number;
  condition: string | null;
}

export interface TypoScriptScanResult {
  scanned: number;
  findings: number;
  files: { file: string; findings: TypoScriptFinding[] }[];
}

export declare const TS_IDENTIFIER: Record<string, string>;
export declare const TS_IDENTIFIERS: string[];
export declare function parseTypoScript(source: string): TypoScriptAssignment[];
export declare function scanTypoScript(source: string): TypoScriptFinding[];
export declare function collectTypoScriptFiles(target: string): string[];
export declare function scanTypoScriptPath(target: string): TypoScriptScanResult;
