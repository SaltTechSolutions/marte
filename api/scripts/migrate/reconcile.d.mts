import type { ExportData, Row, Schema } from './transform.mjs';
export interface Check {
  name: string; table: string;
  key: Record<string, [string, (r: any) => unknown]>;
  aggs: Record<string, [string, (r: any) => unknown]>;
}
export const CHECKS: Check[];
export function checkSql(c: Check): string;
export function expectedOf(c: Check, rows: Record<string, Row[]>): Map<string, number[]>;
export function actualOf(c: Check, resultRows: Record<string, unknown>[]): Map<string, number[]>;
export function compare(c: Check, expected: Map<string, number[]>, actual: Map<string, number[]>): string[];
export function parseWranglerJson(text: string): Record<string, unknown>[];
export function rawLedger(data: ExportData, scale: number): Map<string, { n: number; sum: number }>;
export function reconcile(args: { rows: Record<string, Row[]>; results: Record<string, Record<string, unknown>[]>; schema?: Schema; checks?: Check[] }):
  { name: string; status: 'PASS' | 'FAIL' | 'MISSING' | 'SKIP'; diffs: string[]; note: string }[];
export function printCommands(a: { db: string; env?: string; dir: string }): string[];
