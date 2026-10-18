import { Hono } from 'hono';

import { rolesIn } from './auth';
import { abortIf, EMAIL_RE, nameOf, newId, outboxIfChanged, readBody, type App } from './guarded';
import { formatTl } from './format';
import { outboxStatement } from './outbox';

/**
 * Parent-child links for under-18 members (MEMBER-5b) and the parent's bulk payment notice (MEMBER-5e).
 * Ports backend/functions/src/guardians.ts. Both link operations were callables in Firebase because each
 * has to look something up (the parent by e-mail) and stamp a consent record the child cannot choose.
 */
export const guardians = new Hono<App>();

/** The consent text the parent agrees to. Bumped whenever the wording changes, so an old record still says what was accepted. */
export const GUARDIAN_CONSENT_VERSION = '2026-08-31.v1';
const METHODS = ['cash', 'bank_transfer', 'card'];
const MAX_AMOUNT = 100_000_000;   // same cap as POST /payments
const MAX_GROUP = 10;

/**
 * A member (in practice a minor) nominates a parent by e-mail. The parent must already be an ACTIVE,
 * account-holding member of the same gym: we do not create an account on someone else's behalf.
 * Re-requesting after a rejection starts over (no old consent carried forward); re-requesting the same
 * parent while pending/approved is an idempotent no-op, so a double tap neither re-asks nor double-pushes.
 */
guardians.post('/tenants/:tenantId/guardian/request', async (c) => {
  const uid = c.get('userId');
  if (!uid) return c.json({ error: 'bootstrap required' }, 409);
  const tenantId = c.req.param('tenantId')!;
  const b = await readBody(c);
  const email = typeof b.guardianEmail === 'string' ? b.guardianEmail.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return c.json({ error: 'guardianEmail required' }, 400);

  const child = await c.env.DB.prepare(
    `SELECT email, display_name FROM memberships WHERE tenant_id = ? AND member_id = ? AND status IN ('pending','active')`,
  ).bind(tenantId, uid).first<{ email: string | null; display_name: string | null }>();
  if (!child) return c.json({ error: 'no membership in this gym' }, 404);
  if ((child.email ?? '').toLowerCase() === email) return c.json({ error: 'you cannot be your own guardian' }, 400);

  const parent = await c.env.DB.prepare(
    `SELECT member_id, display_name, email, guardian_id FROM memberships
     WHERE tenant_id = ? AND lower(email) = ? AND status = 'active' AND managed = 0 AND member_id != ? LIMIT 1`,
  ).bind(tenantId, email, uid).first<{ member_id: string; display_name: string | null; email: string | null; guardian_id: string | null }>();
  if (!parent) return c.json({ error: 'no active member with that e-mail; the parent must join the gym first' }, 404);
  // A child cannot be their own grandparent: a parent who is themselves linked to someone is almost surely a mistake.
  if (parent.guardian_id) return c.json({ error: 'that member is linked to a guardian themselves; pick an adult' }, 409);

  const guardianName = parent.display_name || parent.email || '';
  const childName = child.display_name || child.email || 'Bir üye';
  await c.env.DB.batch([
    // Every gate is in the WHERE: the child's row must be live, the parent must still be an unlinked active
    // account member, and an identical pending/approved link is left alone.
    c.env.DB.prepare(
      `UPDATE memberships SET guardian_id = ?, guardian_name = ?, guardian_status = 'pending',
         guardian_consent_at = NULL, guardian_consent_version = NULL
       WHERE tenant_id = ? AND member_id = ? AND status IN ('pending','active')
         AND (COALESCE(guardian_id, '') != ? OR COALESCE(guardian_status, '') NOT IN ('pending','approved'))
         AND EXISTS (SELECT 1 FROM memberships g WHERE g.tenant_id = ? AND g.member_id = ? AND g.status = 'active'
                     AND g.managed = 0 AND g.guardian_id IS NULL)`,
    ).bind(parent.member_id, guardianName, tenantId, uid, parent.member_id, tenantId, parent.member_id),
    outboxIfChanged(c.env.DB, 'push', {
      userIds: [parent.member_id], title: 'Ebeveyn onayı isteniyor', category: 'account',
      body: `${childName} seni ebeveyni olarak gösterdi.`, data: { screen: '/member/guardian-requests' },
    }),
  ]);
  const after = await c.env.DB.prepare(
    `SELECT guardian_id, guardian_status FROM memberships WHERE tenant_id = ? AND member_id = ?`,
  ).bind(tenantId, uid).first<{ guardian_id: string | null; guardian_status: string | null }>();
  if (after?.guardian_id !== parent.member_id || !['pending', 'approved'].includes(after.guardian_status ?? '')) {
    return c.json({ error: 'the nominated member is no longer available' }, 409);
  }
  return c.json({ guardianName, status: after.guardian_status });
});

/**
 * The parent answers. Approving records the consent (KVKK): when, by whom (guardian_id), against which
 * version of the text. The child's own `status` is untouched: the gym still approves them separately and
 * that gate lives in the status transition. Rejecting CLEARS the link instead of leaving 'rejected' beside a
 * guardian_id, which would keep granting that person read access to the child's record.
 */
guardians.post('/tenants/:tenantId/guardian/respond', async (c) => {
  const uid = c.get('userId');
  if (!uid) return c.json({ error: 'bootstrap required' }, 409);
  const tenantId = c.req.param('tenantId')!;
  if (!(await rolesIn(c.env.DB, tenantId, uid)).length) return c.json({ error: 'forbidden' }, 403);
  const b = await readBody(c);
  // Strict boolean: Firebase read anything but `true` as a refusal, so a malformed body silently rejected a child.
  if (typeof b.childId !== 'string' || !b.childId || typeof b.approve !== 'boolean') return c.json({ error: 'childId and approve (boolean) required' }, 400);
  const childId = b.childId;

  const child = await c.env.DB.prepare(
    `SELECT guardian_id, guardian_status, display_name, email FROM memberships WHERE tenant_id = ? AND member_id = ?`,
  ).bind(tenantId, childId).first<{ guardian_id: string | null; guardian_status: string | null; display_name: string | null; email: string | null }>();
  // Missing and "not your request" look the same: nobody learns who is in the gym.
  if (!child || child.guardian_id !== uid) return c.json({ error: 'no such request' }, 404);
  if (child.guardian_status !== 'pending') return c.json({ error: 'already answered' }, 409);

  const now = Date.now();
  const approve = b.approve;
  await c.env.DB.batch([
    approve
      ? c.env.DB.prepare(
        `UPDATE memberships SET guardian_status = 'approved', guardian_consent_at = ?, guardian_consent_version = ?
         WHERE tenant_id = ? AND member_id = ? AND guardian_id = ? AND guardian_status = 'pending'`,
      ).bind(now, GUARDIAN_CONSENT_VERSION, tenantId, childId, uid)
      : c.env.DB.prepare(
        `UPDATE memberships SET guardian_id = NULL, guardian_name = NULL, guardian_status = 'rejected',
           guardian_consent_at = NULL, guardian_consent_version = NULL
         WHERE tenant_id = ? AND member_id = ? AND guardian_id = ? AND guardian_status = 'pending'`,
      ).bind(tenantId, childId, uid),
    outboxIfChanged(c.env.DB, 'push', {
      userIds: [childId], category: 'account',
      title: approve ? 'Ebeveyn onayın alındı' : 'Ebeveyn onayı verilmedi',
      body: approve ? 'Kaydın salon yöneticisinin onayını bekliyor.' : 'Gösterdiğin ebeveyn onay vermedi. Başka bir ebeveyn seçebilirsin.',
      data: { screen: '/member/edit-profile' },
    }),
  ]);
  // The conditional UPDATE can lose a race (a parallel answer); read back who won.
  const after = await c.env.DB.prepare(
    `SELECT guardian_id, guardian_status, guardian_consent_at FROM memberships WHERE tenant_id = ? AND member_id = ?`,
  ).bind(tenantId, childId).first<{ guardian_id: string | null; guardian_status: string | null; guardian_consent_at: number | null }>();
  const won = approve
    ? after?.guardian_status === 'approved' && after.guardian_consent_at === now
    : after?.guardian_status === 'rejected' && after.guardian_id === null;
  if (!won) return c.json({ error: 'already answered' }, 409);
  return c.json({ approved: approve, ...(approve ? { consentVersion: GUARDIAN_CONSENT_VERSION, consentAt: now } : {}) });
});

/**
 * One act of paying, several ledger entries (MEMBER-5e). Each child keeps their own pending entry
 * (`member_id` is the child, so the per-child ledger stays right) with the shared `paymentGroupId`.
 * ALL-OR-NOTHING: a single entry the caller may not file for aborts the whole batch, so the parent is never
 * left having paid 900 with a ledger that shows 600. Entries are always `pending`: a parent cannot confirm.
 *
 * Body: { method, note?, totalAmount?, entries: [{ memberId, amount? }] }. Money is integer kuruş.
 * Either every entry carries an `amount` (and `totalAmount`, when sent, must equal their sum) or none
 * does and `totalAmount` is split equally, any odd kuruş going to the last entries.
 */
guardians.post('/tenants/:tenantId/payments/group', async (c) => {
  const uid = c.get('userId');
  if (!uid) return c.json({ error: 'bootstrap required' }, 409);
  const tenantId = c.req.param('tenantId')!;
  const b = await readBody(c);
  if (!METHODS.includes(b.method as string)) return c.json({ error: 'method' }, 400);
  if (b.note !== undefined && (typeof b.note !== 'string' || b.note.length > 300)) return c.json({ error: 'note <= 300' }, 400);
  if (!Array.isArray(b.entries) || b.entries.length < 1 || b.entries.length > MAX_GROUP) return c.json({ error: `entries 1-${MAX_GROUP}` }, 400);
  const entries = b.entries as { memberId?: unknown; amount?: unknown }[];
  if (entries.some((e) => !e || typeof e !== 'object' || typeof e.memberId !== 'string' || !e.memberId)) return c.json({ error: 'entries[].memberId' }, 400);
  const ids = entries.map((e) => e.memberId as string);
  if (new Set(ids).size !== ids.length) return c.json({ error: 'duplicate memberId' }, 400);
  const okMoney = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= MAX_AMOUNT;

  const withAmount = entries.filter((e) => e.amount !== undefined).length;
  let amounts: number[];
  if (withAmount === 0) {
    if (!okMoney(b.totalAmount)) return c.json({ error: 'totalAmount (integer kuruş) required for an equal split' }, 400);
    const total = b.totalAmount as number, n = ids.length;
    const base = Math.floor(total / n), extra = total - base * n;
    amounts = ids.map((_, i) => base + (i >= n - extra ? 1 : 0));
    if (amounts.some((a) => a <= 0)) return c.json({ error: 'totalAmount too small to split' }, 400);
  } else if (withAmount === entries.length) {
    if (!entries.every((e) => okMoney(e.amount))) return c.json({ error: 'amounts must be positive integer kuruş' }, 400);
    amounts = entries.map((e) => e.amount as number);
    if (b.totalAmount !== undefined && b.totalAmount !== amounts.reduce((s, a) => s + a, 0)) return c.json({ error: 'amounts do not add up to totalAmount' }, 400);
  } else return c.json({ error: 'give an amount for every entry or for none' }, 400);

  // Route-level check (fast 403); the SAME condition is re-checked inside the batch below.
  const mine = (await c.env.DB.prepare(
    `SELECT count(*) AS n FROM memberships WHERE tenant_id = ? AND member_id IN (${ids.map(() => '?').join(',')})
       AND ((guardian_id = ? AND guardian_status = 'approved') OR (member_id = ? AND status = 'active'))`,
  ).bind(tenantId, ...ids, uid, uid).first<{ n: number }>())?.n;
  if (mine !== ids.length) return c.json({ error: 'forbidden' }, 403);

  const groupId = newId('pg');
  const now = Date.now();
  const submitter = await nameOf(c.env.DB, uid);
  const { results: admins } = await c.env.DB.prepare(
    `SELECT member_id FROM memberships WHERE tenant_id = ? AND status = 'active' AND member_id != ?
       AND EXISTS (SELECT 1 FROM json_each(memberships.roles) WHERE value = 'admin')`,
  ).bind(tenantId, uid).all<{ member_id: string }>();
  const total = amounts.reduce((s, a) => s + a, 0);

  const payments = ids.map((memberId, i) => ({ id: newId('pay'), memberId, amount: amounts[i] }));
  const stmts: D1PreparedStatement[] = [
    // All-or-nothing: if the caller lost the right to file for ANY entry since the check above, nothing is written.
    abortIf(c.env.DB,
      `(SELECT count(*) FROM memberships WHERE tenant_id = ? AND member_id IN (${ids.map(() => '?').join(',')})
          AND ((guardian_id = ? AND guardian_status = 'approved') OR (member_id = ? AND status = 'active'))) != ?`,
      tenantId, ...ids, uid, uid, ids.length),
    ...payments.map((p) => c.env.DB.prepare(
      `INSERT INTO payments (id, tenant_id, member_id, amount, status, data, created_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
    ).bind(p.id, tenantId, p.memberId, p.amount, JSON.stringify({
      method: b.method, kind: 'charge', submittedBy: uid, ...(submitter ? { submittedByName: submitter } : {}),
      paymentGroupId: groupId, ...(typeof b.note === 'string' && b.note ? { note: b.note } : {}),
    }), now)),
  ];
  // One push per act of paying (Firebase sent one per ledger row). Same batch, so it exists iff the payments do.
  if (admins.length) {
    stmts.push(outboxStatement(c.env.DB, 'push', {
      userIds: admins.map((a) => a.member_id), category: 'payments', title: 'Yeni ödeme bildirimi',
      body: `${submitter ?? 'Bir üye'} · ${ids.length} kişi · ${formatTl(total)} onayını bekliyor.`,
      data: { screen: 'admin/payments', paymentGroupId: groupId },
    }, `payment-group:${groupId}`));
  }
  try {
    await c.env.DB.batch(stmts);
  } catch (e) {
    // The in-batch authorisation re-check fired (rights changed between check and write): nothing was written.
    const again = (await c.env.DB.prepare(
      `SELECT count(*) AS n FROM memberships WHERE tenant_id = ? AND member_id IN (${ids.map(() => '?').join(',')})
         AND ((guardian_id = ? AND guardian_status = 'approved') OR (member_id = ? AND status = 'active'))`,
    ).bind(tenantId, ...ids, uid, uid).first<{ n: number }>())?.n;
    if (again !== ids.length) return c.json({ error: 'forbidden' }, 403);
    throw e;
  }
  return c.json({ paymentGroupId: groupId, payments }, 201);
});
