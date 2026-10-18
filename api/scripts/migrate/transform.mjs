#!/usr/bin/env node
// Firestore export -> D1 INSERT statements. Pure transformation: no network, no Firebase, no wrangler.
//
//   node transform.mjs --in EXPORT_DIR --out SQL_DIR [--money-scale 1] [--chunk 500] [--no-verify]
//
// Library use: transformAll(exportDir | {collection: docs[]} | Map, opts) -> { sql, resetSql, idMap, report, rows }
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { Ctx } from './lib/ctx.mjs';
import { finalize } from './lib/finalize.mjs';
import { checkCoverage, loadSchema, openWithSql, readMigrations } from './lib/schema.mjs';
import { chunk, insertStatement, shellQuote } from './lib/sql.mjs';
import { ACTIVITY_SPECS } from './lib/specs-activity.mjs';
import { CORE_SPECS } from './lib/specs-core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_MIGRATIONS_DIR = resolve(HERE, '../../migrations');

/** Build order: a spec may only look up rows of specs before it. */
export const SPECS = [...CORE_SPECS, ...ACTIVITY_SPECS];

/** Insert order: every parent before its children (foreign keys are enforced, in the shim and in D1). */
export const OUTPUT_ORDER = [
  'users', 'identities', 'user_settings', 'tenants', 'tenant_contacts', 'memberships',
  'member_notes', 'member_admin_notes', 'member_addresses',
  'gym_packages', 'promotions', 'member_packages', 'member_credits', 'package_change_requests',
  'classes', 'class_bookings', 'class_waitlist', 'class_attendance', 'class_cancellation_refunds',
  'checkins', 'programs', 'program_templates', 'workout_logs', 'measurements', 'payments',
  'pt_sessions', 'trainer_availability', 'calendar_shares', 'push_tokens', 'announcements', 'renewal_requests', 'exercise_reports',
];

/** Tables that exist in the migrations but have no Firestore source (runtime-only or new in D1). */
export const IGNORED_TABLES = [
  'outbox',                                        // runtime-only: starts empty, filled by the Worker
  'billing_events',                                // RevenueCat delivery ledger of the new Worker; Firestore kept none
  'pt_batch_abort', 'txn_abort_guard',             // tripwire tables that never hold a row
];

/** Firestore collections dropped on purpose: server-maintained mirrors that D1 derives with queries. */
export const MIRRORS = {
  member_entitlements: 'rules cache of the current package; D1 reads member_packages directly',
  trainer_busy_slots: 'identity-free mirror of pt_sessions; D1 answers it with a query over pt_sessions',
};
/** marte06 web app collections living in the same Firebase project. */
export const LEGACY_COLLECTIONS = ['members', 'assigned_packages', 'lessons', 'packages', 'settings', 'branches'];

export class SchemaMismatchError extends Error {}

export function readExportDir(dir) {
  const data = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.jsonl')).sort()) {
    const name = f.slice(0, -'.jsonl'.length);
    const docs = [];
    readFileSync(join(dir, f), 'utf8').split('\n').forEach((line, i) => {
      if (!line.trim()) return;
      try { docs.push(JSON.parse(line)); } catch (e) { throw new Error(`${f}:${i + 1}: invalid JSON (${e.message})`); }
    });
    for (const d of docs) if (typeof d.__id !== 'string' || !d.__id) throw new Error(`${f}: a line has no __id`);
    data[name] = docs;
  }
  return data;
}

const normalise = (input) => (typeof input === 'string' ? readExportDir(input) : input instanceof Map ? Object.fromEntries(input) : input);

export function transformAll(input, options = {}) {
  const opts = { moneyScale: 1, migrationsDir: DEFAULT_MIGRATIONS_DIR, ...options };
  if (!Number.isInteger(opts.moneyScale) || opts.moneyScale < 1) throw new Error('moneyScale must be a positive integer (1 = as stored, 100 = lira to kurus)');
  const data = normalise(input);
  const schema = opts.schema ?? loadSchema(opts.migrationsDir);

  const writes = new Map(SPECS.map((s) => [s.table, { columns: Object.keys(s.columns), optional: !!s.optional }]));
  const coverage = checkCoverage(schema, writes, IGNORED_TABLES);
  if (coverage.errors.length) {
    throw new SchemaMismatchError(`The migrations and the transformer disagree:\n  - ${coverage.errors.join('\n  - ')}\nFix the table spec in scripts/migrate/lib/specs-*.mjs.`);
  }
  for (const s of SPECS) if (!OUTPUT_ORDER.includes(s.table)) throw new Error(`table ${s.table} has no place in OUTPUT_ORDER`);

  const ctx = new Ctx(data, opts, schema);
  ctx.report.schemaNotes = coverage.unhandled.map((t) => `table "${t}" exists in the migrations but the migration tool does not populate it`);
  for (const [name, docs] of Object.entries(data)) ctx.report.source.collections[name] = docs.length;

  for (const spec of SPECS) {
    if (spec.optional && !schema.has(spec.table)) {
      ctx.report.skippedCounts[`${spec.table}: table not in migrations`] = 0;
      continue;
    }
    ctx.rows[spec.table] = []; ctx.kept[spec.table] = new Map();
    spec.before?.(ctx);
    const docs = spec.from ? ctx.docsOf(spec.from) : [null];
    for (const doc of docs) {
      for (const view of spec.build(doc, ctx)) {
        const row = {};
        for (const [col, fn] of Object.entries(spec.columns)) row[col] = fn(view);
        const key = spec.key(row);
        if (ctx.kept[spec.table].has(key)) { ctx.invalid(spec.table, doc?.__id ?? key, 'duplicate primary key'); continue; }
        ctx.kept[spec.table].set(key, row);
        ctx.rows[spec.table].push(row);
      }
    }
  }

  finalize(ctx);
  return render(ctx, data);
}

function render(ctx, data) {
  const { report } = ctx;
  const sql = [];
  for (const table of OUTPUT_ORDER) {
    for (const row of ctx.rows[table] ?? []) {
      const stmt = insertStatement(table, row);
      if (Buffer.byteLength(stmt) > 100_000) ctx.warn('statement-too-large', table, row.id ?? '?', `${Buffer.byteLength(stmt)} bytes; D1 allows 100000 per statement`);
      sql.push(stmt);
    }
    report.emitted[table] = (ctx.rows[table] ?? []).length;
  }
  const written = OUTPUT_ORDER.filter((t) => ctx.rows[t]);
  // STAGING ONLY. Plain INSERT is used on purpose (no OR REPLACE: a replace would cascade-delete children).
  const resetSql = [...written].reverse().map((t) => `DELETE FROM ${t};`);

  for (const [name, why] of Object.entries(MIRRORS)) {
    const n = data[name]?.length ?? 0;
    report.dropped[`${name} (collection)`] = n;
    report.mirrorsDropped = { ...(report.mirrorsDropped ?? {}), [name]: { count: n, note: why } };
  }
  const known = new Set([...SPECS.map((s) => s.from).filter(Boolean), ...Object.keys(MIRRORS), ...LEGACY_COLLECTIONS, 'auth_users']);
  for (const [name, docs] of Object.entries(data)) {
    if (LEGACY_COLLECTIONS.includes(name)) report.skipped.push({ table: name, id: '*', reason: `legacy marte06 collection, ${docs.length} documents ignored` });
    else if (!known.has(name)) report.unknownCollections.push({ collection: name, documents: docs.length });
  }

  const identities = ctx.rows.identities ?? [];
  const idMap = {
    users: Object.fromEntries(identities.map((i) => [i.subject, i.user_id]).sort((a, b) => (a[0] < b[0] ? -1 : 1))),
    managed: (ctx.rows.users ?? []).filter((u) => u.id.startsWith('mm')).map((u) => u.id).sort(),
    docs: ctx.docMap,
  };
  report.clean = report.orphans.length === 0 && report.invalid.length === 0 && report.conflicts.length === 0;
  report.options = { moneyScale: ctx.opts.moneyScale };
  return { sql, resetSql, idMap, report, rows: ctx.rows };
}

export function chunkStatements(sql, size = 500) {
  return chunk(sql, size);
}

/**
 * Dry-run the generated SQL on an in-memory SQLite built from the migrations, foreign keys ON.
 * This catches CHECK and FK violations on this machine, before anything touches a real D1.
 * It does NOT model D1 limits (statement size, CPU, request size); only a staging D1 can show those.
 */
export function verifyOnSqlite(sql, migrationsDir = DEFAULT_MIGRATIONS_DIR) {
  const db = openWithSql(readMigrations(migrationsDir));
  try {
    db.exec('BEGIN');
    for (let i = 0; i < sql.length; i++) {
      try { db.exec(sql[i]); } catch (e) { return { ok: false, statement: i + 1, error: e.message, sql: sql[i].slice(0, 300) }; }
    }
    const fk = db.prepare('PRAGMA foreign_key_check').all();
    db.exec('COMMIT');
    return fk.length ? { ok: false, error: `foreign_key_check: ${JSON.stringify(fk.slice(0, 5))}` } : { ok: true };
  } finally { db.close(); }
}

export function formatReport(report) {
  const lines = [];
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  lines.push('Rows emitted: ' + Object.entries(report.emitted).filter(([, n]) => n).map(([t, n]) => `${t}=${n}`).join(' '));
  lines.push(`Source documents: ${Object.entries(report.source.collections).map(([c, n]) => `${c}=${n}`).join(' ')}`);
  lines.push(`Orphans (excluded, operator decides): ${report.orphans.length}  ${JSON.stringify(report.orphanCounts)}`);
  lines.push(`Invalid (excluded): ${report.invalid.length}  ${JSON.stringify(report.invalidCounts)}`);
  lines.push(`Conflicts: ${report.conflicts.length}`);
  lines.push(`Skipped: ${sum(report.skippedCounts)}  ${JSON.stringify(report.skippedCounts)}`);
  lines.push(`Warnings: ${report.warnings.length}  ${JSON.stringify(report.warningCounts)}`);
  lines.push(`Counter drift (Firestore vs recomputed): tenants=${report.counters.tenants.filter((t) => t.drift).length} packages=${report.counters.gymPackages.filter((t) => t.drift).length}`);
  lines.push(`Money: ${report.units.money}`);
  if (report.unknownCollections.length) lines.push(`UNKNOWN collections in the export: ${JSON.stringify(report.unknownCollections)}`);
  if (report.schemaNotes.length) lines.push(...report.schemaNotes.map((n) => `note: ${n}`));
  return lines.join('\n');
}

// ---------------------------------------------------------------- CLI
async function main() {
  const { values } = parseArgs({
    options: {
      in: { type: 'string' }, out: { type: 'string' }, migrations: { type: 'string' }, 'money-scale': { type: 'string', default: '1' },
      chunk: { type: 'string', default: '500' }, 'no-verify': { type: 'boolean', default: false }, db: { type: 'string' }, env: { type: 'string' }, help: { type: 'boolean' },
    },
  });
  if (values.help || !values.in || !values.out) {
    console.log('usage: node transform.mjs --in EXPORT_DIR --out SQL_DIR [--migrations DIR] [--money-scale 1|100] [--chunk 500] [--no-verify] [--db NAME --env staging]');
    process.exit(values.help ? 0 : 2);
  }
  const migrationsDir = values.migrations ? resolve(values.migrations) : DEFAULT_MIGRATIONS_DIR;
  const result = transformAll(resolve(values.in), { moneyScale: Number(values['money-scale']), migrationsDir });
  const { sql, report } = result;
  console.log(formatReport(report));

  if (!values['no-verify']) {
    const v = verifyOnSqlite(sql, migrationsDir);
    if (!v.ok) { console.error(`\nVERIFY FAILED on local SQLite: ${v.error}${v.statement ? ` (statement ${v.statement}: ${v.sql})` : ''}`); process.exit(1); }
    console.log('\nVerified: the SQL applies cleanly to a local SQLite built from the migrations (foreign keys ON). This is NOT proof for D1 limits.');
  }

  const out = resolve(values.out);
  mkdirSync(out, { recursive: true });
  for (const f of readdirSync(out)) if (/^data-\d{4}\.sql$/.test(f)) rmSync(join(out, f));   // stale chunks from an earlier run
  const files = chunkStatements(sql, Number(values.chunk)).map((stmts, i) => {
    const name = `data-${String(i + 1).padStart(4, '0')}.sql`;
    writeFileSync(join(out, name), stmts.join('\n') + '\n');
    return name;
  });
  writeFileSync(join(out, 'reset-STAGING-ONLY.sql'), `-- STAGING ONLY. Empties every table this tool fills so a rehearsal can be repeated.\n-- NEVER run this against production.\n${result.resetSql.join('\n')}\n`);
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(join(out, 'id-map.json'), JSON.stringify(result.idMap, null, 2) + '\n');
  console.log(`\nWrote ${files.length} SQL file(s), report.json, id-map.json (contains Firebase uids: keep it out of git) to ${out}`);
  if (!report.clean) console.log('REPORT IS NOT CLEAN: review orphans/invalid/conflicts before applying anything.');

  const db = values.db ?? '<DB_NAME>';
  const envFlag = values.env ? ` --env ${shellQuote(values.env)}` : '';
  console.log('\nCommands to run BY HAND, staging first (nothing here runs them):');
  console.log(`  wrangler d1 execute ${db}${envFlag} --remote --file ${shellQuote(join(out, 'reset-STAGING-ONLY.sql'))}   # staging only, optional`);
  for (const f of files) console.log(`  wrangler d1 execute ${db}${envFlag} --remote --file ${shellQuote(join(out, f))}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
