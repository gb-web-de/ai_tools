export interface JsFinding {
  identifier: string;
  line: number;
  column: number;
  message: string;
}

export interface JsScanResult {
  scanned: number;
  findings: number;
  files: { file: string; findings: JsFinding[] }[];
  /** Files that could not be parsed and were therefore NOT analysed. */
  unreadable: { file: string; reason: string }[];
}

export declare const JS_IDENTIFIER: Record<string, string>;
export declare const JS_IDENTIFIERS: string[];
export declare function scanJavaScript(source: string, options?: { sourceType?: 'module' | 'script' }): JsFinding[];
export declare function collectJavaScriptFiles(target: string): string[];
export declare function scanJavaScriptPath(target: string): JsScanResult;
