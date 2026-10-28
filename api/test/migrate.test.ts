import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CHECKS, checkSql, parseWranglerJson, printCommands, reconcile } from '../scripts/migrate/reconcile.mjs';
import { checkCoverage, loadSchema, openWithSql, readMigrations, schemaFromSql } from '../scripts/migrate/lib/schema.mjs';
import { serializeValue } from '../scripts/migrate/lib/serialize.mjs';
import { sqlValue } from '../scripts/migrate/lib/sql.mjs';
import { toMs } from '../scripts/migrate/lib/values.mjs';
import { chunkStatements, DEFAULT_MIGRATIONS_DIR, OUTPUT_ORDER, readExportDir, SchemaMismatchError, SPECS, transformAll, verifyOnSqlite } from '../scripts/migrate/transform.mjs';
import { makeDb } from './d1shim';

// Fixture documents (test/fixtures/migrate/*.jsonl) are written by hand from docs/SCHEMA.md, not from real data.
const FIX = 'test/fixtures/migrate';
const iid = (uid: string) => 'u' + createHash('sha256').update('firebase:' + uid).digest('hex').slice(0, 20);
const U = {
  owner: 'uidOwnerSelinSahin000000001', trainer: 'uidTrainerIbrahimCaglar0002', m1: 'uidMemberAyseONeil000000003',
  m2: 'uidMemberCagriOzturk0000004', kid: 'uidKidDeniz0000000000000005', parent: 'uidParentMehmet000000000006',
  pend: 'uidPendingElif00000000000007', susp: 'uidSuspendedOnur0000000000008', ownerB: 'uidOwnerBBurak00000000000009',
  ghost: 'uidGhostRemoved0000000000010', deleted: 'uidDeletedAccount00000000011', pushGhost: 'uidPushGhost00000000000012',
  noRole: 'uidNoRole0000000000000013',
};
const MM = 'mm0123456789abcdef0123';
const T0 = 1750000000000; const D = 86_400_000; const NOW = 1790000000000;

// Most assertions below are written in as-stored numbers; the production default (100, kuruş) is pinned in the money test.
const AS_STORED = { moneyScale: 1 };
const run = () => transformAll(FIX, AS_STORED);
async function loaded() {
  const r = run();
  const db = makeDb();
  await db.exec(r.sql.join('\n'));
  return { r, db };
}
const all = async (db: D1Database, sql: string, ...args: unknown[]) => (await db.prepare(sql).bind(...args).all()).results as any[];
const one = async (db: D1Database, sql: string, ...args: unknown[]) => (await db.prepare(sql).bind(...args).first()) as any;
const has = (list: { table: string; id: string }[], table: string, id: string) => list.some((o) => o.table === table && o.id === id);

describe('migration tool: contract with the migrations', () => {
  it('every table/column the transformer writes exists, and every required target column is written', () => {
    const schema = loadSchema(DEFAULT_MIGRATIONS_DIR);
    const writes = new Map(SPECS.map((s) => [s.table, { columns: Object.keys(s.columns), optional: !!s.optional }]));
    expect(checkCoverage(schema, writes, ['outbox', 'user_settings', 'billing_events', 'pt_batch_abort', 'txn_abort_guard']).errors).toEqual([]);
    for (const s of SPECS) expect(OUTPUT_ORDER).toContain(s.table);
  });

  it('fails loudly when a written column disappears from the migrations', () => {
    const schema = structuredClone(loadSchema(DEFAULT_MIGRATIONS_DIR));
    schema.get('memberships')!.delete('left_at');
    expect(() => transformAll(FIX, { ...AS_STORED, schema })).toThrow(SchemaMismatchError);
    expect(() => transformAll(FIX, { ...AS_STORED, schema })).toThrow(/memberships\.left_at/);
  });

  it('fails loudly when a new NOT NULL column without a default appears, or a written table is gone', () => {
    const withNew = structuredClone(loadSchema(DEFAULT_MIGRATIONS_DIR));
    withNew.get('payments')!.set('tax_code', { notnull: true, hasDefault: false, pk: false, type: 'TEXT' });
    expect(() => transformAll(FIX, { ...AS_STORED, schema: withNew })).toThrow(/payments\.tax_code.*NOT NULL without a default/);
    const noTable = structuredClone(loadSchema(DEFAULT_MIGRATIONS_DIR));
    noTable.delete('identities');
    expect(() => transformAll(FIX, { ...AS_STORED, schema: noTable })).toThrow(/table "identities"/);
  });

  it('a new nullable column or a new table is not an error, but a new table is announced in the report', () => {
    const schema = schemaFromSql([...readMigrations(DEFAULT_MIGRATIONS_DIR), 'ALTER TABLE announcements ADD COLUMN pinned INTEGER; CREATE TABLE future_thing (id TEXT PRIMARY KEY);']);
    const r = transformAll(FIX, { ...AS_STORED, schema });
    expect(r.report.schemaNotes.join('\n')).toMatch(/future_thing/);
  });

  it('without class_waitlist / class_attendance the data is not lost: it stays in classes.data with internal ids', () => {
    const schema = structuredClone(loadSchema(DEFAULT_MIGRATIONS_DIR));
    schema.delete('class_waitlist'); schema.delete('class_attendance');
    const r = transformAll(FIX, { ...AS_STORED, schema });
    expect(r.rows.class_waitlist).toBeUndefined();
    const cls = r.rows.classes.find((c) => c.id === 'clsA1')!;
    const data = JSON.parse(cls.data as string);
    expect(data.waitlistUserIds).toEqual([iid(U.kid), iid(U.pend)]);
    expect(data.attendance).toEqual({ [iid(U.m1)]: 'present', [iid(U.pend)]: 'absent' });
    expect(r.sql.filter((x) => !x.startsWith('INSERT INTO identities')).join('\n')).not.toContain(U.kid);
    expect(Object.keys(r.report.skippedCounts).join()).toMatch(/class_waitlist/);
  });
});

describe('migration tool: applying the output', () => {
  it('applies to the D1 shim with foreign keys on, and row counts match what the report says was emitted', async () => {
    const { r, db } = await loaded();
    expect((await one(db, 'PRAGMA foreign_keys')).foreign_keys).toBe(1);
    expect(await all(db, 'PRAGMA foreign_key_check')).toEqual([]);
    for (const [table, n] of Object.entries(r.report.emitted)) {
      expect((await one(db, `SELECT count(*) c FROM ${table}`)).c, table).toBe(n);
    }
    expect(r.report.emitted.memberships).toBe(11);
    expect(r.report.emitted.payments).toBe(8);
  });

  it('verifyOnSqlite agrees, and catches a statement that breaks a constraint', () => {
    const r = run();
    expect(verifyOnSqlite(r.sql).ok).toBe(true);
    const broken = [...r.sql, `INSERT INTO memberships (tenant_id, member_id, status, requested_at) VALUES ('nope', 'nope', 'active', 1);`];
    const v = verifyOnSqlite(broken);
    expect(v.ok).toBe(false);
  });

  it('is deterministic: same ids and byte-identical SQL on two runs, whatever order the documents arrive in', () => {
    const a = run();
    const b = run();
    expect(b.sql).toEqual(a.sql);
    expect(b.idMap).toEqual(a.idMap);
    const shuffled = Object.fromEntries(Object.entries(readExportDir(FIX)).map(([k, v]) => [k, [...v].reverse()]));
    expect(transformAll(shuffled, AS_STORED).sql).toEqual(a.sql);
    expect(a.idMap.users[U.m1]).toBe(iid(U.m1));
    expect(a.idMap.users[U.m1]).toMatch(/^u[0-9a-f]{20}$/);
  });

  it('splits into files of at most N statements; the chunks apply in order', async () => {
    const r = run();
    const parts = chunkStatements(r.sql, 40);
    expect(parts.every((p) => p.length <= 40)).toBe(true);
    expect(parts.flat()).toEqual(r.sql);
    expect(chunkStatements(r.sql, 500).every((p) => p.length <= 500)).toBe(true);
  });

  it('the CLI writes chunked files, a staging-only reset file, a report and an id map, and the files apply in order', async () => {
    const out = mkdtempSync(join(tmpdir(), 'migrate-'));
    const p = spawnSync(process.execPath, ['scripts/migrate/transform.mjs', '--in', FIX, '--out', out, '--chunk', '40'], { encoding: 'utf8' });
    expect(p.status, p.stderr).toBe(0);
    const files = readdirSync(out).sort();
    const chunks = files.filter((f) => /^data-\d{4}\.sql$/.test(f));
    expect(chunks.length).toBeGreaterThan(1);
    for (const f of chunks) expect(readFileSync(join(out, f), 'utf8').trim().split('\n').length).toBeLessThanOrEqual(40);
    expect(files).toEqual(expect.arrayContaining(['reset-STAGING-ONLY.sql', 'report.json', 'id-map.json']));
    expect(readFileSync(join(out, 'reset-STAGING-ONLY.sql'), 'utf8')).toMatch(/NEVER run this against production/);
    expect(p.stdout).toMatch(/Commands to run BY HAND/);
    const db = makeDb();
    for (const f of chunks) await db.exec(readFileSync(join(out, f), 'utf8'));
    expect((await one(db, 'SELECT count(*) c FROM memberships')).c).toBe(11);
    // the reset file empties everything again, so a rehearsal can be repeated
    await db.exec(readFileSync(join(out, 'reset-STAGING-ONLY.sql'), 'utf8'));
    expect((await one(db, 'SELECT count(*) c FROM memberships')).c).toBe(0);
    for (const f of chunks) await db.exec(readFileSync(join(out, f), 'utf8'));
    expect((await one(db, 'SELECT count(*) c FROM memberships')).c).toBe(11);
  });

  it('the reset command is printed only for a database named staging, never for production or an unnamed one', () => {
    const cli = (...extra: string[]) => {
      const out = mkdtempSync(join(tmpdir(), 'migrate-'));
      const p = spawnSync(process.execPath, ['scripts/migrate/transform.mjs', '--in', FIX, '--out', out, ...extra], { encoding: 'utf8' });
      expect(p.status, p.stderr).toBe(0);
      // the file is always written (its name and header warn); what matters is whether a command to run it is offered
      expect(readdirSync(out)).toContain('reset-STAGING-ONLY.sql');
      return p.stdout;
    };
    const resetLine = /wrangler d1 execute .*reset-STAGING-ONLY\.sql/;
    expect(cli('--db', 'gymentra-staging', '--env', 'staging')).toMatch(resetLine);
    const prod = cli('--db', 'gymentra-prod', '--env', 'production');
    expect(prod).not.toMatch(resetLine);
    expect(prod).toMatch(/wrangler d1 execute gymentra-prod --env 'production' --remote --file .*data-0001\.sql/);   // data files still listed
    expect(cli()).not.toMatch(resetLine);                                   // no --db at all
    expect(cli('--db', 'gymentra-prod')).not.toMatch(resetLine);
  });

  it('no Firebase uid survives anywhere except identities.subject', () => {
    const r = run();
    expect(r.report.warningCounts['uid-leak']).toBeUndefined();
    for (const stmt of r.sql) {
      for (const uid of Object.values(U)) if (stmt.includes(uid)) expect(stmt.startsWith('INSERT INTO identities')).toBe(true);
    }
  });
});

describe('migration tool: field mapping', () => {
  it('recomputes tenant and package counters from the migrated rows, not from Firestore\'s copies', async () => {
    const { r, db } = await loaded();
    const a = await one(db, `SELECT active_member_count m, active_admin_count a FROM tenants WHERE id = 'tnA'`);
    // active + role member: M1, M2, kid, managed, no-role (defaulted). Not: owner (admin+trainer), trainer, pending, suspended.
    expect(a).toEqual({ m: 5, a: 1 });
    expect(await one(db, `SELECT active_member_count m, active_admin_count a FROM tenants WHERE id = 'tnB'`)).toEqual({ m: 0, a: 1 });   // the 'left' member does not count
    expect((await one(db, `SELECT active_assignment_count n FROM gym_packages WHERE id = 'gpGold'`)).n).toBe(2);       // active + frozen, not the expired one
    expect((await one(db, `SELECT active_assignment_count n FROM gym_packages WHERE id = 'gpLessons'`)).n).toBe(1);
    const drift = r.report.counters.tenants.find((t) => t.tenantId === 'tnA')!;
    expect(drift.activeMemberCount).toEqual({ firestore: 999, d1: 5 });
    expect(drift.drift).toBe(true);
    expect(r.report.counters.gymPackages.find((p) => p.packageId === 'gpGold')!.activeAssignmentCount).toEqual({ firestore: 7, d1: 2 });
  });

  it('reads the removed single `role` field as roles, defaults to least privilege, and keeps status left', async () => {
    const { r, db } = await loaded();
    const roles = async (u: string, t = 'tnA') => JSON.parse((await one(db, `SELECT roles FROM memberships WHERE tenant_id = ? AND member_id = ?`, t, iid(u))).roles);
    expect(await roles(U.trainer)).toEqual(['trainer']);
    expect(await roles(U.owner)).toEqual(['admin', 'trainer']);
    expect(await roles(U.noRole)).toEqual(['member']);
    expect(r.report.warningCounts['legacy-role']).toBe(1);
    expect(r.report.warningCounts['roles-defaulted']).toBe(1);
    expect((await one(db, `SELECT status, left_at FROM memberships WHERE tenant_id = 'tnB' AND member_id = ?`, iid(U.m2)))).toEqual({ status: 'left', left_at: T0 + 60 * D });
    expect((await one(db, `SELECT permissions p FROM memberships WHERE tenant_id = 'tnA' AND member_id = ?`, iid(U.trainer))).p).toBe('["checkin"]');
  });

  it('managed member: a users row without identity, created_by mapped, hostile name stored as text', async () => {
    const { db } = await loaded();
    expect(await one(db, `SELECT id FROM users WHERE id = ?`, MM)).toBeTruthy();
    expect(await one(db, `SELECT 1 x FROM identities WHERE user_id = ?`, MM)).toBeNull();
    const m = await one(db, `SELECT managed, created_by, display_name, birth_date, status FROM memberships WHERE tenant_id = 'tnA' AND member_id = ?`, MM);
    expect(m).toMatchObject({ managed: 1, created_by: iid(U.owner), display_name: "Zeynep '; DROP TABLE users; --", status: 'active' });
    expect((await one(db, `SELECT count(*) c FROM users`)).c).toBe(11);
    expect((await one(db, `SELECT address FROM member_addresses WHERE member_id = ?`, MM)).address).toBe('Cumhuriyet Mah. 12/3 "Daire" Kadıköy');
  });

  it('minor with guardian: guardian fields, consent and a user+identity for a parent who has no membership', async () => {
    const { db } = await loaded();
    const kid = await one(db, `SELECT * FROM memberships WHERE tenant_id = 'tnA' AND member_id = ?`, iid(U.kid));
    expect(kid).toMatchObject({
      guardian_id: iid(U.parent), guardian_name: 'Mehmet Kaya', guardian_status: 'approved',
      guardian_consent_at: T0 + 4 * D, guardian_consent_version: '2026-09-v1', birth_date: 1394000000000,
    });
    expect(await one(db, `SELECT * FROM memberships WHERE member_id = ?`, iid(U.parent))).toBeNull();
    expect(await one(db, `SELECT user_id FROM identities WHERE provider = 'firebase' AND subject = ?`, U.parent)).toEqual({ user_id: iid(U.parent) });
    expect((await one(db, `SELECT display_name, email FROM users WHERE id = ?`, iid(U.parent)))).toEqual({ display_name: 'Mehmet Kaya', email: 'mehmet@example.com' });
  });

  it('credit-backed booking keeps its credit; unbacked managed booking has none; the rest are reported as orphans', async () => {
    const { r, db } = await loaded();
    const bookings = await all(db, `SELECT member_id, credit_id FROM class_bookings WHERE class_id = 'clsA1' ORDER BY created_at`);
    expect(bookings).toEqual([{ member_id: iid(U.m1), credit_id: 'crA1' }, { member_id: MM, credit_id: null }]);
    expect(await one(db, `SELECT total, used, status FROM member_credits WHERE id = 'crA1'`)).toEqual({ total: 8, used: 3, status: 'active' });
    expect(has(r.report.orphans, 'class_bookings', `clsA1/${iid(U.m2)}`)).toBe(true);     // its credit does not exist
    expect(has(r.report.orphans, 'class_bookings', `clsA1/${iid(U.ghost)}`)).toBe(true);  // its member is gone
    expect(r.report.orphans.find((o) => o.id === `clsA1/${iid(U.m2)}`)!.reason).toMatch(/crMissing/);
  });

  it('orphan references are reported and excluded, never silently dropped', async () => {
    const { r, db } = await loaded();
    for (const [table, id] of [
      ['member_credits', 'crGhost'], ['member_packages', 'mp5'], ['checkins', 'ci3'], ['payments', 'pay10'], ['pt_sessions', 'pts3'], ['pt_sessions', 'pts4'],
      ['calendar_shares', `tnA_${U.trainer}_${U.ghost}`], ['gym_packages', 'gpDup'], ['push_tokens', 'ExponentPushToken[ghost789]'],
      ['tenant_memberships', `tnDup_${U.m1}`], ['member_notes', `tnA_${U.ghost}`],
    ]) expect(has(r.report.orphans, table, id), `${table}/${id}`).toBe(true);
    expect(await one(db, `SELECT 1 x FROM member_credits WHERE id = 'crGhost'`)).toBeNull();
    expect(await one(db, `SELECT 1 x FROM payments WHERE id = 'pay10'`)).toBeNull();
    expect(await one(db, `SELECT 1 x FROM push_tokens WHERE token = 'ExponentPushToken[ghost789]'`)).toBeNull();
    expect(r.report.orphans.find((o) => o.id === 'crGhost')!.reason).toMatch(/no memberships row/);
    expect(r.report.clean).toBe(false);
    // values the target cannot hold are "invalid", also excluded and listed
    for (const [table, id] of [['member_credits', 'crBad'], ['classes', 'clsBad'], ['gym_packages', 'gpFrac'], ['payments', 'pay9'], ['measurements', 'ms4'], ['tenant_memberships', 'tnA_uidBadStatus00000000000014']]) {
      expect(has(r.report.invalid, table, id), `${table}/${id}`).toBe(true);
    }
    expect(r.report.invalid.find((o) => o.id === 'crBad')!.reason).toMatch(/exceeds total/);
    // a duplicate tenant code is a conflict, and its children become orphans
    expect(r.report.conflicts).toEqual([{ kind: 'duplicate-tenant-code', code: 'TARABYA-01', kept: 'tnA', excluded: 'tnDup' }]);
  });

  it('payments: reversed row + reversal row, kind defaulted to charge, deleted-account ledger row kept, legacy marte06 row skipped', async () => {
    const { r, db } = await loaded();
    const pay = async (id: string) => { const p = await one(db, `SELECT * FROM payments WHERE id = ?`, id); return p && { ...p, data: JSON.parse(p.data) }; };
    const p2 = await pay('pay2');
    expect(p2).toMatchObject({ amount: 750, status: 'confirmed' });
    expect(p2.data).toMatchObject({ kind: 'charge', reversedAt: NOW - 8 * D, reversedByPaymentId: 'pay3', reversalReason: 'Yanlış tutar girildi' });
    expect((await pay('pay3')).data).toMatchObject({ kind: 'reversal', reversesPaymentId: 'pay2' });
    expect((await pay('pay1')).data.kind).toBe('charge');                       // absent kind means charge; the API's reversal query needs it explicit
    expect((await pay('pay8')).data.kind).toBe('refund');
    expect((await pay('pay4')).data).toMatchObject({ submittedBy: iid(U.parent), paymentGroupId: 'grp1', submittedByName: 'Mehmet Kaya' });
    expect((await pay('pay4')).status).toBe('pending');
    expect((await pay('pay11')).status).toBe('rejected');
    expect((await pay('pay7')).data.note).toBe('Ali\'nin "hediyesi"');
    const p6 = await pay('pay6');
    expect(p6.member_id).toBe(iid(U.deleted));                                    // ledger survives account deletion
    expect(await one(db, `SELECT 1 x FROM memberships WHERE member_id = ?`, iid(U.deleted))).toBeNull();
    expect(r.report.warningCounts['payment-of-deleted-account']).toBe(1);
    expect(await pay('pay5')).toBeNull();                                         // marte06 payment without tenantId
    expect(r.report.skippedCounts['payments: no tenantId (legacy marte06 payment in the shared collection)']).toBe(1);
    expect((await one(db, `SELECT count(*) n, sum(amount) s FROM payments WHERE tenant_id = 'tnA' AND status = 'confirmed'`))).toEqual({ n: 6, s: 1350 + 750 + 750 + 400 + 250 + 150 });
    expect(r.report.units.money).toMatch(/whole-lira|whole lira/);
  });

  it('global program template gets tenant_id NULL; a gym template keeps its tenant', async () => {
    const { db } = await loaded();
    const rows = await all(db, `SELECT id, tenant_id FROM program_templates ORDER BY id`);
    expect(rows).toEqual([{ id: 'tpA1', tenant_id: 'tnA' }, { id: 'tpG1', tenant_id: null }, { id: 'tpG2', tenant_id: null }]);
    expect(JSON.parse((await one(db, `SELECT data FROM program_templates WHERE id = 'tpG1'`)).data).days[0].exercises[0].targetWeightKg).toBeNull();
  });

  it('timestamps: epoch zero, negative, _seconds shape, numeric string, fractional and unusable', async () => {
    const { r, db } = await loaded();
    expect((await one(db, `SELECT measured_at m FROM measurements WHERE id = 'ms1'`)).m).toBe(0);
    expect((await one(db, `SELECT measured_at m FROM measurements WHERE id = 'ms2'`)).m).toBe(-1);
    expect((await one(db, `SELECT measured_at m FROM measurements WHERE id = 'ms3'`)).m).toBe(NOW - D);
    expect(await one(db, `SELECT 1 x FROM measurements WHERE id = 'ms4'`)).toBeNull();
    expect(r.report.warningCounts['timestamp-fractional']).toBe(1);
    expect((await one(db, `SELECT birth_date b FROM memberships WHERE member_id = ? AND tenant_id = 'tnA'`, iid(U.m1))).b).toBe(-157766400000);
    const m2 = await one(db, `SELECT birth_date b, requested_at r FROM memberships WHERE member_id = ? AND tenant_id = 'tnA'`, iid(U.m2));
    expect(m2).toEqual({ b: 631152000000, r: T0 + 3 * D });
    // nested timestamps inside JSON become ms too
    expect(JSON.parse((await one(db, `SELECT data FROM promotions WHERE id = 'pr1'`)).data).startsAt).toBe(T0);
    expect(toMs(null)).toBeNull();
    expect(toMs({ __ts: 'x' })).toBeNaN();
    expect(toMs({ __ts: 253402300800000 })).toBeNaN();
    expect(toMs('2026-01-01T00:00:00Z')).toBe(Date.UTC(2026, 0, 1));
    expect(toMs({ seconds: 1, nanoseconds: 500_000_000 })).toBe(1500);
  });

  it('quotes and Turkish characters survive the SQL round trip', async () => {
    const { db } = await loaded();
    expect((await one(db, `SELECT display_name n FROM memberships WHERE member_id = ? AND tenant_id = 'tnA'`, iid(U.m1))).n).toBe("Ayşe O'Neil-Yıldız");
    expect((await one(db, `SELECT display_name n FROM memberships WHERE member_id = ? AND tenant_id = 'tnA'`, iid(U.m2))).n).toBe('Çağrı "Çağ" Öztürk');
    expect((await one(db, `SELECT name n FROM tenants WHERE id = 'tnB'`)).n).toBe('Ali\'s "Güç" Atölyesi');
    expect((await one(db, `SELECT name n FROM tenants WHERE id = 'tnA'`)).n).toBe('Tarabya Spor & Yaşam — Şişli');
    expect(JSON.parse((await one(db, `SELECT data FROM programs WHERE id = 'pg1'`)).data).exercises[0].cue).toBe("Dizler ayak ucunu geçmesin, 'sırt düz'");
    expect((await one(db, `SELECT text FROM member_notes WHERE member_id = ?`, iid(U.m1))).text).toBe('Sağ diz hassas, "squat" derinliği sınırlı');
    expect(sqlValue("it's")).toBe("'it''s'");
    expect(() => sqlValue('a\u0000b')).toThrow(/NUL/);
    expect(() => sqlValue({})).toThrow();
    expect((await one(db, `SELECT count(*) c FROM sqlite_master WHERE name = 'users'`)).c).toBe(1);
  });

  it('ids that embed a Firebase uid follow the member\'s internal id (the API upserts on them)', async () => {
    const { r, db } = await loaded();
    expect((await one(db, `SELECT member_id m FROM renewal_requests WHERE id = ?`, `tnA_${iid(U.m1)}`)).m).toBe(iid(U.m1));
    expect(r.idMap.docs.renewal_requests[`tnA_${U.m1}`]).toBe(`tnA_${iid(U.m1)}`);
    expect(await one(db, `SELECT 1 x FROM pt_sessions WHERE id = ?`, `tnA_${iid(U.trainer)}_1790000000000`)).toBeTruthy();
    expect(await one(db, `SELECT 1 x FROM class_cancellation_refunds WHERE id = ?`, `clsDeleted_${iid(U.m1)}`)).toBeTruthy();
    expect(Object.keys(r.idMap.docs.pt_sessions)).toEqual([`tnA_${U.trainer}_1790000000000`]);
  });

  it('personal training: guardian cancel kept, refund outcome derived, cancelled_at carried, frozen_until set', async () => {
    const { r, db } = await loaded();
    const s1 = await one(db, `SELECT * FROM pt_sessions WHERE credit_id = 'crPT'`);
    expect(s1).toMatchObject({ status: 'cancelled', cancelled_by_role: 'member', refund_outcome: 'refunded', cancelled_at: NOW - D, cancellation_deadline_at: NOW, trainer_id: iid(U.trainer) });
    expect(await one(db, `SELECT cancelled_by_role r, refund_outcome o, original_trainer_id t FROM pt_sessions WHERE id = 'pts2'`)).toEqual({ r: 'guardian', o: 'no-credit', t: iid(U.trainer) });
    expect((await one(db, `SELECT reminder_sent_at r, refund_outcome o FROM pt_sessions WHERE id = 'pts5'`))).toEqual({ r: NOW - 9 * D - 3_600_000, o: null });
    expect((await one(db, `SELECT frozen_until f FROM member_packages WHERE id = 'mp3'`)).f).toBe(NOW + D);
    expect((await one(db, `SELECT count(*) c FROM member_packages WHERE frozen_until IS NOT NULL`)).c).toBe(1);
    expect(r.report.warningCounts['pt-cancelled-by-role-dropped']).toBeUndefined();
  });

  it('class register marks need a booking; their marker is an explicit migration sentinel', async () => {
    const { r, db } = await loaded();
    expect(await all(db, `SELECT member_id, mark, marked_by FROM class_attendance`)).toEqual([{ member_id: iid(U.m1), mark: 'present', marked_by: 'migration:firestore' }]);
    expect(has(r.report.orphans, 'class_attendance', `clsA1/${iid(U.pend)}`)).toBe(true);
    expect((await all(db, `SELECT member_id FROM class_waitlist ORDER BY created_at`)).map((x) => x.member_id)).toEqual([iid(U.kid), iid(U.pend)]);
  });

  it('subscription, tenant contact and settings are carried; denormalised copies are counted as dropped', async () => {
    const { r, db } = await loaded();
    expect(await one(db, `SELECT subscription_status s, subscription_expires_at e, subscription_plan p, subscription_event_at ev, owner_user_id o FROM tenants WHERE id = 'tnA'`))
      .toEqual({ s: 'active', e: 1900000000000, p: null, ev: null, o: iid(U.owner) });
    expect(JSON.parse((await one(db, `SELECT settings s FROM tenants WHERE id = 'tnA'`)).s)).toMatchObject({ cancellationHours: 12, address: 'Tarabya Cd. No:5, Sarıyer' });
    expect((await one(db, `SELECT code c FROM tenants WHERE id = 'tnB'`)).c).toBe('BESIKTAS-02');
    expect(JSON.parse((await one(db, `SELECT data d FROM tenant_contacts WHERE tenant_id = 'tnA'`)).d)).toMatchObject({ phone: '+90 212 555 0100', updatedAt: T0 + 2 * D });
    expect(r.report.dropped['tenant_memberships.tenantName']).toBeGreaterThan(0);
    expect(r.report.dropped['checkins.membershipId']).toBe(3);
  });

  it('user_settings: Firestore {push:{...}} becomes the flat map the outbox reads; empty maps get no row; a vanished account is an orphan', async () => {
    const { r, db } = await loaded();
    expect(await all(db, `SELECT user_id, notifications FROM user_settings`)).toEqual([{ user_id: iid(U.m1), notifications: '{"announcements":false,"payments":false}' }]);
    expect(r.report.warningCounts['setting-not-boolean']).toBe(1);
    expect(r.report.skippedCounts['user_settings: no switched-off category (absent row means everything on)']).toBe(1);
    expect(has(r.report.orphans, 'user_settings', U.pushGhost)).toBe(true);
  });

  it('drops the server-maintained mirrors with a counted note, and notes legacy collections instead of migrating them', () => {
    const r = run();
    expect(r.report.mirrorsDropped).toMatchObject({ member_entitlements: { count: 2 }, trainer_busy_slots: { count: 3 } });
    expect(r.rows.member_entitlements).toBeUndefined();
    expect(r.report.skipped.some((s) => s.table === 'members' && /legacy/.test(s.reason))).toBe(true);
    expect(r.report.unknownCollections).toEqual([]);
  });

  it('users come from memberships and from real accounts only referenced (guardian); Auth fills names; a vanished account is not resurrected', async () => {
    const { r, db } = await loaded();
    expect((await one(db, `SELECT display_name n, email e, created_at c FROM users WHERE id = ?`, iid(U.m1)))).toEqual({ n: "Ayşe O'Neil-Yıldız", e: 'ayse@example.com', c: expect.any(Number) });
    expect(await one(db, `SELECT 1 x FROM users WHERE id = ?`, iid(U.pushGhost))).toBeNull();
    expect(await one(db, `SELECT 1 x FROM users WHERE id = ?`, iid(U.ghost))).toBeNull();
    expect(r.report.usersFromReferencesOnly).toBe(1);
    expect((await one(db, `SELECT count(*) c FROM identities`)).c).toBe(10);
  });

  it('money scale: 1 copies as stored; 100 converts lira to kurus everywhere an amount lives, and rescues 99.5', async () => {
    const r1 = run();
    const r100 = transformAll(FIX, { moneyScale: 100 });
    const row = (r: typeof r1, t: string, id: string) => r.rows[t].find((x) => x.id === id)!;
    expect(row(r1, 'payments', 'pay1').amount).toBe(1350);
    expect(row(r100, 'payments', 'pay1').amount).toBe(135000);
    expect(row(r100, 'payments', 'pay9').amount).toBe(9950);          // invalid at scale 1
    expect(row(r100, 'gym_packages', 'gpFrac')).toBeTruthy();
    const d = (r: typeof r1, t: string, id: string) => JSON.parse(row(r, t, id).data as string);
    expect(d(r100, 'gym_packages', 'gpGold').price).toBe(150000);
    expect(row(r100, 'member_packages', 'mp1').final_price).toBe(135000);
    expect(d(r100, 'member_packages', 'mp1').listPrice).toBe(150000);
    expect(d(r100, 'promotions', 'pr2').value).toBe(20000);            // amountDiscount is money
    expect(d(r100, 'promotions', 'pr1').value).toBe(10);               // percent is not
    expect(d(r100, 'package_change_requests', 'pcr1')).toMatchObject({ priceDelta: 50000, currentSummary: { price: 150000 }, proposedSummary: { price: 200000 } });
    expect(d(r100, 'package_change_requests', 'pcr2').refundAmount).toBe(30000);
    expect(() => transformAll(FIX, { moneyScale: 0 })).toThrow();
    // the default is kuruş (decision of 18 Oct 2026)
    expect(row(transformAll(FIX), 'payments', 'pay1').amount).toBe(135000);
  });
});

describe('migration tool: reconcile', () => {
  const asWrangler = (rows: unknown[]) => JSON.stringify([{ results: rows, success: true, meta: {} }]);
  async function dump(db: D1Database, schema: ReturnType<typeof loadSchema>) {
    const results: Record<string, Record<string, unknown>[]> = {};
    for (const c of CHECKS) {
      if (!schema.has(c.table)) continue;
      results[c.name] = parseWranglerJson(asWrangler(await all(db, checkSql(c))));
    }
    return results;
  }

  it('PASSes on a faithfully migrated D1, FAILs when a count or a ledger sum is off, and reports MISSING files', async () => {
    const { r, db } = await loaded();
    const schema = loadSchema(DEFAULT_MIGRATIONS_DIR);
    const results = await dump(db, schema);
    const good = reconcile({ rows: r.rows, results, schema });
    expect(good.filter((o) => o.status === 'FAIL' || o.status === 'MISSING')).toEqual([]);
    expect(good.filter((o) => o.status === 'PASS').length).toBeGreaterThan(25);

    await db.exec(`UPDATE payments SET amount = amount + 1 WHERE id = 'pay1'; DELETE FROM class_bookings WHERE member_id = '${MM}'; UPDATE member_credits SET used = used - 1 WHERE id = 'crA1';`);
    const bad = reconcile({ rows: r.rows, results: await dump(db, schema), schema });
    const failed = bad.filter((o) => o.status === 'FAIL').map((o) => o.name).sort();
    expect(failed).toEqual(['class_bookings', 'member_credits', 'payments']);
    expect(bad.find((o) => o.name === 'payments')!.diffs.join()).toMatch(/tnA \| confirmed \| charge/);

    delete results.payments;
    expect(reconcile({ rows: r.rows, results, schema }).find((o) => o.name === 'payments')!.status).toBe('MISSING');
  });

  it('the CLI reads wrangler-shaped dump files and exits 0 on a faithful D1, 1 on a damaged one', () => {
    const r = run();
    const sqlite = openWithSql(readMigrations(DEFAULT_MIGRATIONS_DIR));
    sqlite.exec(r.sql.join('\n'));
    const dir = mkdtempSync(join(tmpdir(), 'd1dump-'));
    const write = () => { for (const c of CHECKS) { try { writeFileSync(join(dir, c.name + '.json'), asWrangler(sqlite.prepare(checkSql(c)).all())); } catch { /* table absent */ } } };
    write();
    const ok = spawnSync(process.execPath, ['scripts/migrate/reconcile.mjs', '--export', FIX, '--d1', dir, '--money-scale', '1'], { encoding: 'utf8' });
    expect(ok.status, ok.stdout + ok.stderr).toBe(0);
    expect(ok.stdout).toMatch(/RECONCILE PASSED/);
    expect(ok.stdout).toMatch(/Excluded on purpose/);
    sqlite.exec(`DELETE FROM payments WHERE id = 'pay2'`);
    write();
    const bad = spawnSync(process.execPath, ['scripts/migrate/reconcile.mjs', '--export', FIX, '--d1', dir, '--money-scale', '1'], { encoding: 'utf8' });
    expect(bad.status).toBe(1);
    expect(bad.stdout).toMatch(/FAIL\s+payments/);
    const cmds = spawnSync(process.execPath, ['scripts/migrate/reconcile.mjs', '--print-commands', '--db', 'gymentra-staging', '--env', 'staging', '--d1', dir], { encoding: 'utf8' });
    expect(cmds.status).toBe(0);
    expect(cmds.stdout).toMatch(/wrangler d1 execute gymentra-staging/);
  });

  it('prints one read-only wrangler command per check; it never runs anything itself', () => {
    const cmds = printCommands({ db: 'gymentra-staging', env: 'staging', dir: '/tmp/d1 dump' });
    expect(cmds).toHaveLength(CHECKS.length);
    for (const c of cmds) {
      expect(c).toMatch(/^wrangler d1 execute gymentra-staging --env 'staging' --remote --json --command '/);
      expect(c).not.toMatch(/--file|INSERT|UPDATE|DELETE|DROP/i);
      expect(c).toContain("'/tmp/d1 dump/");
    }
    expect(() => parseWranglerJson('[{"success":false,"error":"boom"}]')).toThrow(/failure/);
    expect(parseWranglerJson('⛅️ wrangler 4\n' + asWrangler([{ a: 1 }]))).toEqual([{ a: 1 }]);
  });
});

describe('migration tool: exporter', () => {
  const src = readFileSync('scripts/migrate/export-firestore.mjs', 'utf8');

  it('is read-only by construction: no Firestore write API appears in the exporter or its serializer', () => {
    const code = (s: string) => s.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
    for (const f of [src, readFileSync('scripts/migrate/lib/serialize.mjs', 'utf8')]) {
      expect(code(f)).not.toMatch(/\.(set|update|delete|create|add|commit|batch|runTransaction|bulkWriter|recursiveDelete|listen|onSnapshot)\s*\(/);
    }
    expect(src).toMatch(/\.get\(\)/);
  });

  it('refuses to run without --project, and refuses to export from an emulator', () => {
    const noProject = spawnSync(process.execPath, ['scripts/migrate/export-firestore.mjs', '--out', mkdtempSync(join(tmpdir(), 'exp-'))], { encoding: 'utf8' });
    expect(noProject.status).toBe(2);
    expect(noProject.stderr).toMatch(/--project is required/);
    const emu = spawnSync(process.execPath, ['scripts/migrate/export-firestore.mjs', '--project', 'x', '--out', mkdtempSync(join(tmpdir(), 'exp-'))], { encoding: 'utf8', env: { ...process.env, FIRESTORE_EMULATOR_HOST: 'localhost:8080' } });
    expect(emu.status).toBe(2);
    expect(emu.stderr).toMatch(/emulator/);
  });

  it('serialises Firestore value types into the export format', () => {
    class Timestamp { seconds = 1; nanoseconds = 5e8; toMillis() { return 1500; } }
    class GeoPoint { latitude = 41; longitude = 29; }
    class DocumentReference { path = 'tenants/tnA'; firestore = {}; }
    const out = serializeValue({
      at: new Timestamp(), d: new Date(7), geo: new GeoPoint(), ref: new DocumentReference(), bytes: new Uint8Array([1, 2]),
      nested: [{ t: new Timestamp(), skip: undefined }], n: null, nan: NaN, s: "it's",
    });
    expect(out).toEqual({
      at: { __ts: 1500 }, d: { __ts: 7 }, geo: { __geo: [41, 29] }, ref: { __ref: 'tenants/tnA' }, bytes: { __bytes: 'AQI=' },
      nested: [{ t: { __ts: 1500 } }], n: null, nan: { __num: 'NaN' }, s: "it's",
    });
  });

  it('readExportDir names the file and line of a broken export', () => {
    const dir = mkdtempSync(join(tmpdir(), 'exp-'));
    writeFileSync(join(dir, 'tenants.jsonl'), '{"__id":"a"}\n{not json}\n');
    expect(() => readExportDir(dir)).toThrow(/tenants\.jsonl:2/);
  });
});
