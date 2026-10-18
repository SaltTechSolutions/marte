// Reads the TARGET schema by actually running the migrations on an in-memory SQLite (node:sqlite),
// so ALTER / DROP / rebuild-style migrations are honoured exactly as D1 would see them.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function migrationFiles(dir) {
  return readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
}

/** Open an in-memory DB with the given SQL texts applied in order. */
export function openWithSql(sqlTexts, { foreignKeys = true } = {}) {
  const db = new DatabaseSync(':memory:');
  if (foreignKeys) db.exec('PRAGMA foreign_keys = ON');
  for (const t of sqlTexts) db.exec(t);
  return db;
}

export function readMigrations(dir) {
  return migrationFiles(dir).map((f) => readFileSync(join(dir, f), 'utf8'));
}

/** Schema as Map<table, Map<column, {notnull, hasDefault, pk, type}>>. */
export function schemaFromSql(sqlTexts) {
  const db = openWithSql(sqlTexts, { foreignKeys: false });
  const schema = new Map();
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all();
  for (const { name } of tables) {
    const cols = new Map();
    for (const c of db.prepare(`PRAGMA table_info(${name})`).all()) {
      cols.set(c.name, { notnull: c.notnull === 1, hasDefault: c.dflt_value !== null, pk: c.pk > 0, type: c.type });
    }
    schema.set(name, cols);
  }
  db.close();
  return schema;
}

export function loadSchema(migrationsDir) {
  return schemaFromSql(readMigrations(migrationsDir));
}

/**
 * Loud contract between the transformer and the migrations.
 * `writes`: Map<table, {columns: string[], optional: boolean}>.
 * Errors: a written table/column the migrations do not have, or a NOT NULL column without a default
 * (or a PK column) that the transformer does not write. Notes: tables in the schema nobody handles.
 */
export function checkCoverage(schema, writes, ignoredTables = []) {
  const errors = [];
  for (const [table, w] of writes) {
    const cols = schema.get(table);
    if (!cols) {
      if (!w.optional) errors.push(`table "${table}" is written by the transformer but does not exist in the migrations`);
      continue;
    }
    for (const c of w.columns) {
      if (!cols.has(c)) errors.push(`column "${table}.${c}" is written by the transformer but does not exist in the migrations`);
    }
    for (const [name, info] of cols) {
      if (w.columns.includes(name)) continue;
      if (info.pk || (info.notnull && !info.hasDefault)) {
        errors.push(`column "${table}.${name}" is ${info.pk ? 'a PRIMARY KEY' : 'NOT NULL without a default'} but the transformer does not write it`);
      }
    }
  }
  const unhandled = [...schema.keys()].filter((t) => !writes.has(t) && !ignoredTables.includes(t)).sort();
  return { errors, unhandled };
}
