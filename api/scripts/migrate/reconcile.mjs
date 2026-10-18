#!/usr/bin/env node
// Reconcile a migrated D1 against the Firestore export: per-tenant counts and sums, PASS/FAIL per check.
//
//   1. node reconcile.mjs --print-commands --db gymentra-staging --env staging --d1 ./d1-dump     (prints, never runs)
//   2. run the printed wrangler commands by hand; each writes one JSON file into ./d1-dump
//   3. node reconcile.mjs --export ./export --d1 ./d1-dump [--money-scale 1] [--migrations ../../migrations]
//
// The SQL of each check and the way its expected value is computed from the migrated rows come from ONE
// definition below, so they cannot drift apart. "Expected" is what transform.mjs emitted (after its documented
// exclusions); the documents excluded on purpose are shown separately, never hidden.
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { loadSchema } from './lib/schema.mjs';
import { shellQuote } from './lib/sql.mjs';
import { DEFAULT_MIGRATIONS_DIR, readExportDir, transformAll } from './transform.mjs';

const KIND = [`COALESCE(json_extract(data, '$.kind'), 'charge')`, (r) => JSON.parse(r.data).kind ?? 'charge'];
const tenant = ['tenant_id', (r) => r.tenant_id];
const rolesOf = (r) => r.roles;
const N = ['COUNT(*)', () => 1];
const sum = (col) => [`COALESCE(SUM(${col}), 0)`, (r) => r[col] ?? 0];

/** check: {name, table, key: {alias: [sqlExpr, jsFn]}, aggs: {alias: [sqlExpr, jsFn]}} */
const by = (name, table, key, aggs = { n: N }) => ({ name, table, key, aggs });
export const CHECKS = [
  by('users', 'users', { scope: [`'all'`, () => 'all'] }),
  by('user_settings', 'user_settings', { scope: [`'all'`, () => 'all'] }),
  by('identities', 'identities', { scope: [`'all'`, () => 'all'] }),
  by('tenants', 'tenants', { tenant_id: ['id', (r) => r.id] }, {
    n: N, active_member_count: sum('active_member_count'), active_admin_count: sum('active_admin_count'),
  }),
  by('members_by_status', 'memberships', { tenant_id: tenant, status: ['status', (r) => r.status] }),
  by('members_by_roles', 'memberships', { tenant_id: tenant, roles: ['roles', rolesOf], status: ['status', (r) => r.status] }),
  by('members_flags', 'memberships', { tenant_id: tenant }, {
    n: N, managed: sum('managed'),
    with_guardian: ['COALESCE(SUM(guardian_id IS NOT NULL), 0)', (r) => (r.guardian_id ? 1 : 0)],
    with_short_code: ['COALESCE(SUM(short_code IS NOT NULL), 0)', (r) => (r.short_code ? 1 : 0)],
  }),
  by('classes', 'classes', { tenant_id: tenant }),
  by('class_bookings', 'class_bookings', { tenant_id: tenant }, {
    n: N, credit_backed: ['COALESCE(SUM(credit_id IS NOT NULL), 0)', (r) => (r.credit_id ? 1 : 0)],
  }),
  by('class_waitlist', 'class_waitlist', { tenant_id: tenant }),
  by('class_attendance', 'class_attendance', { tenant_id: tenant, mark: ['mark', (r) => r.mark] }),
  by('class_cancellation_refunds', 'class_cancellation_refunds', { tenant_id: tenant, outcome: ['outcome', (r) => r.outcome] }),
  by('payments', 'payments', { tenant_id: tenant, status: ['status', (r) => r.status], kind: KIND }, { n: N, amount: sum('amount') }),
  by('member_credits', 'member_credits', { tenant_id: tenant, kind: ['kind', (r) => r.kind], status: ['status', (r) => r.status] }, {
    n: N, total: sum('total'), used: sum('used'),
  }),
  by('gym_packages', 'gym_packages', { tenant_id: tenant }, { n: N, active_assignments: sum('active_assignment_count') }),
  by('member_packages', 'member_packages', { tenant_id: tenant, status: ['status', (r) => r.status] }, {
    n: N, final_price: sum('final_price'), with_frozen_until: ['COALESCE(SUM(frozen_until IS NOT NULL), 0)', (r) => (r.frozen_until != null ? 1 : 0)],
  }),
  by('promotions', 'promotions', { tenant_id: tenant }),
  by('package_change_requests', 'package_change_requests', { tenant_id: tenant, status: ['status', (r) => r.status] }),
  by('measurements', 'measurements', { tenant_id: tenant }),
  by('programs', 'programs', { tenant_id: tenant }),
  by('program_templates', 'program_templates', { tenant_id: [`COALESCE(tenant_id, 'GLOBAL')`, (r) => r.tenant_id ?? 'GLOBAL'] }),
  by('workout_logs', 'workout_logs', { tenant_id: tenant }),
  by('checkins', 'checkins', { tenant_id: tenant }),
  by('pt_sessions', 'pt_sessions', { tenant_id: tenant, status: ['status', (r) => r.status] }),
  by('trainer_availability', 'trainer_availability', { tenant_id: tenant }),
  by('calendar_shares', 'calendar_shares', { tenant_id: tenant }),
  by('push_tokens', 'push_tokens', { tenant_id: [`COALESCE(tenant_id, 'NONE')`, (r) => r.tenant_id ?? 'NONE'] }),
  by('announcements', 'announcements', { tenant_id: tenant }),
  by('renewal_requests', 'renewal_requests', { tenant_id: tenant, status: ['status', (r) => r.status] }),
  by('exercise_reports', 'exercise_reports', { tenant_id: tenant }),
  by('member_notes', 'member_notes', { tenant_id: tenant }),
  by('member_admin_notes', 'member_admin_notes', { tenant_id: tenant }),
  by('member_addresses', 'member_addresses', { tenant_id: tenant }),
  by('tenant_contacts', 'tenant_contacts', { tenant_id: tenant }),
];

export function checkSql(c) {
  const keys = Object.entries(c.key).map(([alias, [expr]]) => `${expr} AS ${alias}`);
  const aggs = Object.entries(c.aggs).map(([alias, [expr]]) => `${expr} AS ${alias}`);
  const group = Object.values(c.key).map(([expr]) => expr).join(', ');
  return `SELECT ${[...keys, ...aggs].join(', ')} FROM ${c.table} GROUP BY ${group} ORDER BY ${group}`;
}

/** Expected result of a check, computed from the rows transform.mjs emitted: Map<key, number[]>. */
export function expectedOf(c, rows) {
  const out = new Map();
  for (const r of rows[c.table] ?? []) {
    const key = Object.values(c.key).map(([, fn]) => String(fn(r))).join(' | ');
    const acc = out.get(key) ?? Object.keys(c.aggs).map(() => 0);
    Object.values(c.aggs).forEach(([, fn], i) => { acc[i] += Number(fn(r)); });
    out.set(key, acc);
  }
  return out;
}

export function actualOf(c, resultRows) {
  const out = new Map();
  for (const r of resultRows) {
    const key = Object.keys(c.key).map((a) => String(r[a])).join(' | ');
    out.set(key, Object.keys(c.aggs).map((a) => Number(r[a])));
  }
  return out;
}

export function compare(c, expected, actual) {
  const diffs = [];
  const names = Object.keys(c.aggs);
  for (const [key, ev] of expected) {
    const av = actual.get(key);
    if (!av) diffs.push(`${key}: expected ${fmt(names, ev)}, D1 has no such group`);
    else if (ev.some((x, i) => x !== av[i])) diffs.push(`${key}: expected ${fmt(names, ev)}, D1 has ${fmt(names, av)}`);
  }
  for (const [key, av] of actual) if (!expected.has(key)) diffs.push(`${key}: D1 has ${fmt(names, av)} but the export expects nothing`);
  return diffs;
}
const fmt = (names, vals) => names.map((n, i) => `${n}=${vals[i]}`).join(' ');

/** Accepts `wrangler d1 execute --json` output: [{results:[...], success:true, meta:{...}}] (banner lines tolerated). */
export function parseWranglerJson(text) {
  const start = text.search(/[[{]/);
  if (start < 0) throw new Error('no JSON found');
  const parsed = JSON.parse(text.slice(start));
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!first || first.success === false) throw new Error(`wrangler reported failure: ${JSON.stringify(first?.error ?? first)}`);
  if (!Array.isArray(first.results)) throw new Error('no "results" array in the wrangler output');
  return first.results;
}

/** Independent of transform logic: per-tenant confirmed ledger straight from the raw export documents. */
export function rawLedger(data, scale) {
  const out = new Map();
  for (const d of data.payments ?? []) {
    if (!d.tenantId || d.status !== 'confirmed' || typeof d.amount !== 'number') continue;
    const e = out.get(d.tenantId) ?? { n: 0, sum: 0 };
    e.n += 1; e.sum += Math.round(d.amount * scale);
    out.set(d.tenantId, e);
  }
  return out;
}

/**
 * results: {checkName: rows[]} parsed from the D1 dump. Returns [{name, status, diffs, note}] with status
 * PASS | FAIL | MISSING | SKIP (table absent from the migrations).
 */
export function reconcile({ rows, results, schema, checks = CHECKS }) {
  return checks.map((c) => {
    if (schema && !schema.has(c.table)) return { name: c.name, status: 'SKIP', diffs: [], note: `table ${c.table} is not in the migrations` };
    const got = results[c.name];
    if (!got) return { name: c.name, status: 'MISSING', diffs: [`no D1 result file ${c.name}.json`], note: '' };
    const diffs = compare(c, expectedOf(c, rows), actualOf(c, got));
    return { name: c.name, status: diffs.length ? 'FAIL' : 'PASS', diffs, note: '' };
  });
}

export function printCommands({ db, env, dir }) {
  const envFlag = env ? ` --env ${shellQuote(env)}` : '';
  return CHECKS.map((c) => `wrangler d1 execute ${db}${envFlag} --remote --json --command ${shellQuote(checkSql(c))} > ${shellQuote(join(dir, c.name + '.json'))}`);
}

function main() {
  const { values } = parseArgs({
    options: {
      export: { type: 'string' }, d1: { type: 'string' }, 'money-scale': { type: 'string', default: '1' }, migrations: { type: 'string' },
      'print-commands': { type: 'boolean', default: false }, db: { type: 'string' }, env: { type: 'string' }, help: { type: 'boolean' },
    },
  });
  if (values.help || !values.d1) {
    console.log('usage:\n  node reconcile.mjs --print-commands --db NAME [--env staging] --d1 DIR\n  node reconcile.mjs --export DIR --d1 DIR [--money-scale 1] [--migrations DIR]');
    process.exit(values.help ? 0 : 2);
  }
  const dir = resolve(values.d1);
  if (values['print-commands']) {
    mkdirSync(dir, { recursive: true });
    console.log('# Run these by hand against the SAME database you just loaded (staging first). They only read.');
    console.log(printCommands({ db: values.db ?? '<DB_NAME>', env: values.env, dir }).join('\n'));
    return;
  }
  if (!values.export) { console.error('--export is required'); process.exit(2); }
  const migrationsDir = values.migrations ? resolve(values.migrations) : DEFAULT_MIGRATIONS_DIR;
  const scale = Number(values['money-scale']);
  const data = readExportDir(resolve(values.export));
  const { rows, report } = transformAll(data, { moneyScale: scale, migrationsDir });
  const schema = loadSchema(migrationsDir);

  const results = {};
  for (const c of CHECKS) {
    const f = join(dir, c.name + '.json');
    if (!existsSync(f)) continue;
    try { results[c.name] = parseWranglerJson(readFileSync(f, 'utf8')); } catch (e) { console.error(`${c.name}.json: ${e.message}`); }
  }
  const outcome = reconcile({ rows, results, schema });
  for (const o of outcome) {
    console.log(`${o.status.padEnd(7)} ${o.name}${o.note ? `  (${o.note})` : ''}`);
    for (const d of o.diffs.slice(0, 10)) console.log(`          ${d}`);
    if (o.diffs.length > 10) console.log(`          ... ${o.diffs.length - 10} more`);
  }

  // What was left out on purpose: shown every time, so a green run cannot hide a shrunken migration.
  console.log('\nExcluded on purpose by transform.mjs (D1 is compared against the rest):');
  console.log(`  orphans=${report.orphans.length} invalid=${report.invalid.length} conflicts=${report.conflicts.length} skipped=${Object.values(report.skippedCounts).reduce((a, b) => a + b, 0)}`);
  const raw = rawLedger(data, scale); const mig = new Map();
  for (const p of rows.payments ?? []) if (p.status === 'confirmed') { const e = mig.get(p.tenant_id) ?? { n: 0, sum: 0 }; e.n += 1; e.sum += p.amount; mig.set(p.tenant_id, e); }
  let ledgerDiff = 0;
  for (const [t, e] of raw) {
    const m = mig.get(t) ?? { n: 0, sum: 0 };
    if (m.n !== e.n || m.sum !== e.sum) { ledgerDiff++; console.log(`  WARN confirmed ledger of ${t}: export ${e.n} rows / ${e.sum}, migrated ${m.n} rows / ${m.sum} (see report.json invalid/orphans for payments)`); }
  }
  if (!ledgerDiff) console.log('  confirmed payments: every tenant\'s export total equals the migrated total');

  const failed = outcome.filter((o) => o.status === 'FAIL' || o.status === 'MISSING').length;
  console.log(`\n${failed ? 'RECONCILE FAILED' : 'RECONCILE PASSED'}: ${outcome.filter((o) => o.status === 'PASS').length} passed, ${failed} failed/missing, ${outcome.filter((o) => o.status === 'SKIP').length} skipped`);
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
