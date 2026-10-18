// Types for the plain-JS migration tool, so api/test can import it under `strict`.
export type Row = Record<string, string | number | null>;
export interface Report {
  units: { timestamps: string; money: string };
  source: { collections: Record<string, number> };
  emitted: Record<string, number>;
  dropped: Record<string, number>;
  unmapped: Record<string, number>;
  skipped: { table: string; id: string; reason: string }[];
  skippedCounts: Record<string, number>;
  orphans: { table: string; id: string; reason: string; ref?: Record<string, unknown> }[];
  invalid: { table: string; id: string; reason: string }[];
  conflicts: Record<string, unknown>[];
  warnings: { code: string; table: string; id: string; detail: string }[];
  warningCounts: Record<string, number>;
  orphanCounts: Record<string, number>;
  invalidCounts: Record<string, number>;
  counters: {
    tenants: { tenantId: string; activeMemberCount: { firestore: number | null; d1: number }; activeAdminCount: { firestore: number | null; d1: number }; drift: boolean }[];
    gymPackages: { packageId: string; tenantId: string; activeAssignmentCount: { firestore: number | null; d1: number }; drift: boolean }[];
  };
  schemaNotes: string[];
  unknownCollections: { collection: string; documents: number }[];
  mirrorsDropped?: Record<string, { count: number; note: string }>;
  usersFromReferencesOnly?: number;
  clean: boolean;
  options: { moneyScale: number };
}
export interface TransformResult {
  sql: string[];
  resetSql: string[];
  idMap: { users: Record<string, string>; managed: string[]; docs: Record<string, Record<string, string>> };
  report: Report;
  rows: Record<string, Row[]>;
}
export type ExportData = Record<string, Record<string, unknown>[]>;
export type Schema = Map<string, Map<string, { notnull: boolean; hasDefault: boolean; pk: boolean; type: string }>>;
export interface TransformOptions { moneyScale?: number; migrationsDir?: string; schema?: Schema }
export const DEFAULT_MIGRATIONS_DIR: string;
export const OUTPUT_ORDER: string[];
export const IGNORED_TABLES: string[];
export const SPECS: { table: string; from: string | null; optional?: boolean; columns: Record<string, (v: any) => unknown> }[];
export class SchemaMismatchError extends Error {}
export function readExportDir(dir: string): ExportData;
export function transformAll(input: string | ExportData | Map<string, Record<string, unknown>[]>, options?: TransformOptions): TransformResult;
export function chunkStatements(sql: string[], size?: number): string[][];
export function verifyOnSqlite(sql: string[], migrationsDir?: string): { ok: boolean; statement?: number; error?: string; sql?: string };
export function formatReport(report: Report): string;
