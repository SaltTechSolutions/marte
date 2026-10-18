// Steps that need every table built: server-owned counters, soft-reference checks, leak scan.
import { MANAGED_ID } from './values.mjs';

const parse = (s) => JSON.parse(s);

export function finalize(ctx) {
  const rows = (t) => ctx.rows[t] ?? [];
  const { report } = ctx;

  // Owners / creators that did not become users: the FK must hold, the loss is reported.
  for (const t of rows('tenants')) {
    if (t.owner_user_id && !ctx.has('users', t.owner_user_id)) {
      ctx.warn('tenant-owner-unknown', 'tenants', t.id, 'ownerUid has no user row; owner_user_id set NULL');
      t.owner_user_id = null;
    }
  }
  for (const m of rows('memberships')) {
    if (m.created_by && !ctx.has('users', m.created_by)) {
      ctx.warn('created-by-unknown', 'memberships', `${m.tenant_id}/${m.member_id}`, 'createdBy account is gone; created_by set NULL');
      m.created_by = null;
    }
  }

  // Counters are recomputed from the migrated rows, never copied from Firestore's (possibly stale) copies.
  const members = new Map(); const admins = new Map();
  for (const m of rows('memberships')) {
    if (m.status !== 'active') continue;
    const roles = parse(m.roles);
    if (roles.includes('member')) members.set(m.tenant_id, (members.get(m.tenant_id) ?? 0) + 1);
    if (roles.includes('admin')) admins.set(m.tenant_id, (admins.get(m.tenant_id) ?? 0) + 1);
  }
  for (const t of rows('tenants')) {
    t.active_member_count = members.get(t.id) ?? 0;
    t.active_admin_count = admins.get(t.id) ?? 0;
    const fs = ctx.fsCounters?.get(t.id) ?? {};
    const drift = fs.activeMemberCount !== t.active_member_count || fs.activeAdminCount !== t.active_admin_count;
    report.counters.tenants.push({
      tenantId: t.id,
      activeMemberCount: { firestore: fs.activeMemberCount ?? null, d1: t.active_member_count },
      activeAdminCount: { firestore: fs.activeAdminCount ?? null, d1: t.active_admin_count },
      drift,
    });
  }
  const assigned = new Map();
  const promoUse = new Map();
  for (const mp of rows('member_packages')) {
    if (mp.status === 'active' || mp.status === 'frozen') assigned.set(`${mp.tenant_id}/${mp.package_id}`, (assigned.get(`${mp.tenant_id}/${mp.package_id}`) ?? 0) + 1);
    const pid = parse(mp.data).promotionId;
    if (pid) promoUse.set(`${mp.tenant_id}/${pid}`, (promoUse.get(`${mp.tenant_id}/${pid}`) ?? 0) + 1);
  }
  for (const p of rows('gym_packages')) {
    p.active_assignment_count = assigned.get(`${p.tenant_id}/${p.id}`) ?? 0;
    const fs = ctx.fsPackageCounts?.get(p.id) ?? null;
    report.counters.gymPackages.push({ packageId: p.id, tenantId: p.tenant_id, activeAssignmentCount: { firestore: fs, d1: p.active_assignment_count }, drift: fs !== p.active_assignment_count });
  }

  // Soft references (no FK in D1): kept, but flagged.
  for (const p of rows('promotions')) {
    const redeemed = parse(p.data).redeemed ?? 0;
    const used = promoUse.get(`${p.tenant_id}/${p.id}`) ?? 0;
    if (redeemed !== used) ctx.warn('promotion-redeemed-drift', 'promotions', p.id, `redeemed=${redeemed} but ${used} migrated member_packages reference it`);
  }
  for (const mp of rows('member_packages')) {
    if (!ctx.has('gym_packages', mp.package_id)) ctx.warn('package-catalog-missing', 'member_packages', mp.id, `package ${mp.package_id} is not in the migrated catalog (the assignment row is a self-contained snapshot)`);
    if (mp.payment_id && !ctx.has('payments', mp.payment_id)) ctx.warn('assignment-payment-missing', 'member_packages', mp.id, `payment ${mp.payment_id} not migrated`);
  }
  const memberPackageIds = new Set(rows('member_packages').map((x) => x.id));
  for (const c of rows('member_credits')) {
    if (!memberPackageIds.has(c.source_package_id)) ctx.warn('credit-source-missing', 'member_credits', c.id, `source_package_id ${c.source_package_id} is not a migrated member_packages row`);
  }
  for (const p of rows('payments')) {
    const d = parse(p.data);
    for (const f of ['reversesPaymentId', 'reversedByPaymentId']) {
      if (d[f] && !ctx.has('payments', d[f])) ctx.warn('payment-pointer-dangling', 'payments', p.id, `${f}=${d[f]} is not a migrated payment`);
    }
  }

  // No Firebase uid may survive anywhere except identities.subject.
  const uids = new Set([...ctx.uidToInternal.keys()].filter((u) => !MANAGED_ID.test(u)));
  for (const [table, list] of Object.entries(ctx.rows)) {
    for (const row of list) {
      for (const [col, val] of Object.entries(row)) {
        if (typeof val !== 'string' || (table === 'identities' && col === 'subject')) continue;
        for (const tok of val.match(/[A-Za-z0-9]{20,}/g) ?? []) {
          if (uids.has(tok)) ctx.warn('uid-leak', table, row.id ?? row.token ?? '?', `${col} still contains a Firebase uid`);
        }
      }
    }
  }
}
