export declare const SUPPORTED_REMEDIATIONS: string[];
export function queryKnowledge(directory: string, options?: { query?: string; type?: string; limit?: number }): unknown;
export function indexKnowledge(directory: string): unknown;
export function recordDeveloperFix(directory: string, input: unknown): unknown;
export function reviewDeveloperFix(directory: string, input: unknown): unknown;
