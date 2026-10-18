import type { Schema } from '../transform.mjs';
export function migrationFiles(dir: string): string[];
export function readMigrations(dir: string): string[];
export function openWithSql(sqlTexts: string[], opts?: { foreignKeys?: boolean }): import('node:sqlite').DatabaseSync;
export function schemaFromSql(sqlTexts: string[]): Schema;
export function loadSchema(dir: string): Schema;
export function checkCoverage(schema: Schema, writes: Map<string, { columns: string[]; optional: boolean }>, ignored?: string[]): { errors: string[]; unhandled: string[] };
