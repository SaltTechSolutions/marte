export function sqlValue(v: unknown): string;
export function insertStatement(table: string, row: Record<string, unknown>): string;
export function stableStringify(v: unknown): string;
export function shellQuote(s: string): string;
export function chunk<T>(list: T[], size: number): T[][];
