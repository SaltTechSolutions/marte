// Table specs, part 1: people, tenancy, catalog and entitlements.
//
// A spec is { table, from, build(doc, ctx) -> view[], columns: {column: view -> value} }.
// To carry a new column: add one line to `columns` (and read it in `build` if it comes from a new field).
// The coverage check in transform.mjs fails loudly if a column named here is missing from the migrations,
// or if the migrations gain a NOT NULL column without a default that is not named here.
import { Reader } from './ctx.mjs';
import { stableStringify } from './sql.mjs';
import { k, MANAGED_ID, toMs } from './values.mjs';

export const ROLES = ['member', 'trainer', 'admin'];
export const MEMBERSHIP_STATUS = ['pending', 'active', 'rejected', 'suspended', 'left'];
const SUBSCRIPTION_PLANS = ['monthly', 'yearly', 'grandfathered'];

/** Roles of one membership document, including the removed single `role` field of old documents. */
function readRoles(r) {
  const arr = r.raw('roles');
  const legacy = r.raw('role');
  let roles = Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  if (roles.length === 0 && typeof legacy === 'string' && legacy) {
    roles = [legacy];
    r.warn('legacy-role', `role="${legacy}" read as roles=["${legacy}"]`);
  } else if (typeof legacy === 'string' && legacy && !roles.includes(legacy)) {
    r.warn('legacy-role-ignored', `role="${legacy}" differs from roles=${JSON.stringify(roles)}; roles wins`);
  }
  const known = [...new Set(roles.filter((x) => ROLES.includes(x)))];
  if (known.length !== new Set(roles).size) r.warn('unknown-role-dropped', JSON.stringify(roles));
  if (known.length === 0) {
    r.warn('roles-defaulted', 'no usable roles/role; least privilege ["member"] used');
    return ['member'];
  }
  return known;
}

// ---------------------------------------------------------------- tenants
export const tenants = {
  table: 'tenants', from: 'tenants',
  key: (row) => row.id,
  before(ctx) {
    // Firestore never enforced code uniqueness; D1 does. Oldest tenant keeps the code, the rest are reported.
    const byCode = new Map();
    for (const d of ctx.data.tenants ?? []) {
      const code = typeof d.code === 'string' ? d.code.trim().toUpperCase() : '';
      if (!code) continue;
      const created = d.createdAt && typeof d.createdAt === 'object' ? Number(d.createdAt.__ts ?? 0) : 0;
      const cur = byCode.get(code);
      if (!cur || created < cur.created || (created === cur.created && d.__id < cur.id)) byCode.set(code, { id: d.__id, created });
    }
    ctx.codeWinner = byCode;
    ctx.fsCounters = new Map();
  },
  build(doc, ctx) {
    const r = new Reader(ctx, 'tenants', doc);
    const code = r.str('code', { req: true, upper: true });
    if (code && doc.code !== code) r.warn('tenant-code-normalised', `"${doc.code}" -> "${code}"`);
    const name = r.str('name', { req: true });
    const owner = r.uid('ownerUid');
    const branding = r.json('branding', {});
    const createdAt = r.ts('createdAt', { req: true, fallback: 0 });
    const sub = r.raw('subscription');
    const subObj = sub && typeof sub === 'object' ? sub : {};
    const subStatus = typeof subObj.status === 'string' ? subObj.status : null;
    let subPlan = typeof subObj.plan === 'string' ? subObj.plan : null;
    if (subPlan && !SUBSCRIPTION_PLANS.includes(subPlan)) { r.warn('subscription-plan-dropped', `"${subPlan}" is not allowed by the D1 CHECK`); subPlan = null; }
    let subPlatform = typeof subObj.platform === 'string' ? subObj.platform : null;
    if (subPlatform && !['ios', 'android'].includes(subPlatform)) { r.warn('subscription-platform-dropped', `"${subPlatform}" is not allowed by the D1 CHECK`); subPlatform = null; }
    const subExpires = subObj.expiresAt !== undefined ? toMs(subObj.expiresAt) : null;
    for (const f of Object.keys(subObj)) if (!['status', 'plan', 'platform', 'expiresAt'].includes(f)) r.warn('subscription-extra-field', `subscription.${f} has no column`);
    ctx.fsCounters.set(doc.__id, { activeMemberCount: r.raw('activeMemberCount') ?? null, activeAdminCount: r.raw('activeAdminCount') ?? null });
    // Everything else (cancellationHours, address, openingHours, ...) lives in `settings`.
    // subscription_event_at / _event_id stay NULL: the RevenueCat ordering watermark starts empty, so the next event applies.
    const settings = r.blob({ omit: ['code', 'name', 'ownerUid', 'branding', 'createdAt', 'updatedAt', 'activeMemberCount', 'activeAdminCount', 'subscription'] });
    if (code && ctx.codeWinner.get(code)?.id !== doc.__id) {
      ctx.report.conflicts.push({ kind: 'duplicate-tenant-code', code, kept: ctx.codeWinner.get(code).id, excluded: doc.__id });
      return [];
    }
    if (!r.finish(['updatedAt'])) return [];
    return [{ id: doc.__id, code, name, owner, branding, settings, subStatus, subPlan, subPlatform, subExpires: Number.isFinite(subExpires) ? Math.floor(subExpires) : null, createdAt }];
  },
  columns: {
    id: (v) => v.id, code: (v) => v.code, name: (v) => v.name, owner_user_id: (v) => v.owner,
    branding: (v) => v.branding, settings: (v) => v.settings, subscription_status: (v) => v.subStatus,
    subscription_plan: (v) => v.subPlan, subscription_platform: (v) => v.subPlatform, subscription_expires_at: (v) => v.subExpires,
    active_member_count: () => 0, active_admin_count: () => 0,   // recomputed from migrated rows in finalize
    created_at: (v) => v.createdAt,
  },
};

export const tenantContacts = {
  table: 'tenant_contacts', from: 'tenants__private',
  key: (row) => row.tenant_id,
  build(doc, ctx) {
    if (doc.__id !== 'contact') { ctx.skip('tenant_contacts', doc.__id, `unknown tenants/{id}/private document "${doc.__id}"`); return []; }
    const r = new Reader(ctx, 'tenant_contacts', doc);
    const tenantId = r.str('__tenantId', { req: true });
    r.seen.add('__tenantId');
    if (!r.need('tenants', 'tenant', tenantId)) { r.finish(); return []; }
    const data = r.blob({ omit: ['__tenantId'] });
    if (!r.finish()) return [];
    return [{ tenantId, data }];
  },
  columns: { tenant_id: (v) => v.tenantId, data: (v) => v.data },
};

// ---------------------------------------------------------------- memberships
export const memberships = {
  table: 'memberships', from: 'tenant_memberships',
  key: (row) => k(row.tenant_id, row.member_id),
  before(ctx) { ctx.shortCodes = new Set(); },
  build(doc, ctx) {
    const r = new Reader(ctx, 'tenant_memberships', doc);
    const tenantId = r.tenantId();
    let raw = r.str('userId');
    if (!raw && tenantId && doc.__id.startsWith(tenantId + '_')) {
      raw = doc.__id.slice(tenantId.length + 1);
      r.warn('member-id-from-doc-id', doc.__id);
    }
    if (!raw) r.bad('missing userId');
    else if (tenantId && doc.__id !== `${tenantId}_${raw}`) r.warn('membership-id-mismatch', `doc id ${doc.__id} vs ${tenantId}_${raw}; fields win`);
    const memberId = raw ? ctx.uidId(raw) : null;
    const managed = r.bool('managed');
    if (managed && raw && !MANAGED_ID.test(raw)) r.warn('managed-id-not-synthetic', raw);
    r.need('tenants', 'tenant', tenantId);
    if (tenantId && memberId && ctx.has('memberships', tenantId, memberId)) r.bad('duplicate membership');

    const status = r.enumStr('status', MEMBERSHIP_STATUS, { req: true });
    const roles = readRoles(r);
    const permissions = [...new Set(r.strArr('permissions'))];
    let height = r.int('heightCm');
    if (height !== null && (height < 100 || height > 250)) { r.warn('height-out-of-range', `${height} dropped (D1 CHECK 100..250)`); height = null; }
    let shortCode = r.str('shortCode');
    if (shortCode && tenantId) {
      if (ctx.shortCodes.has(k(tenantId, shortCode))) { r.warn('short-code-duplicate', `${shortCode} cleared on the later row`); shortCode = null; }
      else ctx.shortCodes.add(k(tenantId, shortCode));
    }
    const guardianId = r.uid('guardianId');
    const guardianStatus = r.enumStr('guardianStatus', ['pending', 'approved', 'rejected']);
    if (guardianStatus && !guardianId) r.warn('guardian-status-without-guardian', guardianStatus);
    const approvedAt = r.ts('approvedAt');
    const view = {
      tenantId, memberId, status, roles, permissions, managed,
      displayName: r.str('userDisplayName'), email: r.str('userEmail'), phone: r.str('phone'),
      birthDate: r.ts('birthDate'), height, photoUrl: r.str('photoUrl'), shortCode,
      createdBy: r.uid('createdBy'), guardianId, guardianName: r.str('guardianName'), guardianStatus,
      guardianConsentAt: r.ts('guardianConsentAt'), guardianConsentVersion: r.str('guardianConsentVersion'),
      requestedAt: r.ts('requestedAt', { req: true, fallback: approvedAt ?? 0 }), approvedAt, leftAt: r.ts('leftAt'),
    };
    if (!r.finish(['tenantCode', 'tenantName'])) return [];
    return [view];
  },
  columns: {
    tenant_id: (v) => v.tenantId, member_id: (v) => v.memberId, status: (v) => v.status,
    roles: (v) => JSON.stringify(v.roles), permissions: (v) => JSON.stringify(v.permissions),
    display_name: (v) => v.displayName, email: (v) => v.email, phone: (v) => v.phone,
    birth_date: (v) => v.birthDate, height_cm: (v) => v.height, // Profile photos were removed (18 Oct 2026): the old URLs are NOT carried over; members pick an avatar.
    photo_url: () => null, short_code: (v) => v.shortCode,
    managed: (v) => (v.managed ? 1 : 0), created_by: (v) => v.createdBy,
    guardian_id: (v) => v.guardianId, guardian_name: (v) => v.guardianName, guardian_status: (v) => v.guardianStatus,
    guardian_consent_at: (v) => v.guardianConsentAt, guardian_consent_version: (v) => v.guardianConsentVersion,
    requested_at: (v) => v.requestedAt, approved_at: (v) => v.approvedAt, left_at: (v) => v.leftAt,
  },
};

// ---------------------------------------------------------------- users + identities (derived)
/**
 * Firestore has no users collection (Auth holds accounts). A user row exists for every person who appears
 * in a migrated membership, plus real accounts only referenced elsewhere (a guardian without a membership,
 * a tenant owner, a push-token owner). Without those, the first sign-in would mint a NEW id and orphan the link.
 */
export const users = {
  table: 'users', from: null,
  key: (row) => row.id,
  build(_, ctx) {
    const auth = new Map((ctx.data.auth_users ?? []).map((a) => [a.__id, a]));
    const hasAuth = auth.size > 0;
    const cand = new Map();   // internal id -> {names:[[rank, text]], emails:[[rank,text]], times:[], sources:Set}
    const touch = (id, source) => {
      let c = cand.get(id);
      if (!c) { c = { names: [], emails: [], times: [], sources: new Set(), managed: MANAGED_ID.test(id) }; cand.set(id, c); }
      c.sources.add(source);
      return c;
    };
    for (const m of ctx.rows.memberships ?? []) {
      const c = touch(m.member_id, 'membership');
      if (m.display_name) c.names.push([2, m.requested_at, m.display_name]);
      if (m.email) c.emails.push([2, m.requested_at, m.email]);
      c.times.push(m.requested_at);
      if (m.guardian_id) {
        const g = touch(m.guardian_id, 'guardian');
        if (m.guardian_name) g.names.push([0, m.requested_at, m.guardian_name]);
        g.times.push(m.guardian_consent_at ?? m.requested_at);
      }
    }
    for (const t of ctx.rows.tenants ?? []) if (t.owner_user_id) { touch(t.owner_user_id, 'owner').times.push(t.created_at); }
    for (const d of ctx.data.push_tokens ?? []) {
      if (typeof d.userId !== 'string' || !d.userId) continue;
      const c = touch(ctx.uidId(d.userId), 'push-token');
      const ms = d.updatedAt && typeof d.updatedAt === 'object' ? Number(d.updatedAt.__ts) : NaN;
      if (Number.isFinite(ms)) c.times.push(ms);
    }
    for (const d of ctx.data.user_settings ?? []) {
      const c = touch(ctx.uidId(d.__id), 'settings');
      const ms = d.updatedAt && typeof d.updatedAt === 'object' ? Number(d.updatedAt.__ts) : NaN;
      if (Number.isFinite(ms)) c.times.push(ms);
    }
    const out = [];
    for (const id of [...cand.keys()].sort()) {
      const c = cand.get(id);
      const raw = ctx.internalToUid.get(id);
      const a = !c.managed && raw ? auth.get(raw) : undefined;
      if (hasAuth && !c.managed && !a) {
        if (c.sources.has('membership')) ctx.warn('membership-uid-not-in-auth', 'users', raw, 'membership kept; account no longer exists in Firebase Auth (or was not exported)');
        else { ctx.warn('reference-uid-not-in-auth', 'users', raw, `only referenced as ${[...c.sources].join('/')}; no user row created`); ctx.excludedUsers.add(id); continue; }
      }
      const pick = (list) => list.sort((x, y) => y[0] - x[0] || y[1] - x[1] || (x[2] < y[2] ? -1 : 1))[0]?.[2] ?? null;
      const authTime = a?.createdAtMs;
      const times = c.times.filter((t) => Number.isFinite(t));
      if (!c.sources.has('membership')) ctx.report.usersFromReferencesOnly = (ctx.report.usersFromReferencesOnly ?? 0) + 1;
      out.push({
        id, raw: c.managed ? null : raw,
        displayName: a?.displayName || pick(c.names),
        email: a?.email || pick(c.emails),
        createdAt: Number.isFinite(authTime) ? authTime : times.length ? Math.min(...times) : 0,
      });
    }
    return out;
  },
  columns: { id: (v) => v.id, display_name: (v) => v.displayName, email: (v) => v.email, created_at: (v) => v.createdAt },
};

export const identities = {
  table: 'identities', from: null,
  key: (row) => row.subject,
  build(_, ctx) {
    return (ctx.rows.users ?? []).filter((u) => !MANAGED_ID.test(u.id)).map((u) => ({ id: u.id, raw: ctx.internalToUid.get(u.id) }));
  },
  columns: { provider: () => 'firebase', subject: (v) => v.raw, user_id: (v) => v.id },
};

/**
 * user_settings/{uid} = { push: { category: false, ... } } (only switched-off categories are stored).
 * D1 keeps the FLAT map ({"payments":false}); an empty or absent map means "everything on" and gets no row.
 */
export const userSettings = {
  table: 'user_settings', from: 'user_settings',
  key: (row) => row.user_id,
  build(doc, ctx) {
    const r = new Reader(ctx, 'user_settings', doc);
    const userId = ctx.uidId(doc.__id);
    if (ctx.excludedUsers.has(userId)) r.orphans.push('user: account no longer exists in Firebase Auth');
    else r.need('users', 'user', userId);
    const push = r.raw('push');
    const flat = {};
    if (push && typeof push === 'object' && !Array.isArray(push)) {
      for (const [cat, on] of Object.entries(push)) {
        if (typeof on === 'boolean') flat[cat] = on;
        else r.warn('setting-not-boolean', `push.${cat} dropped`);
      }
    } else if (push !== undefined && push !== null) r.bad('push is not a map');
    const updatedAt = r.ts('updatedAt', { req: true, fallback: 0 });
    if (!r.finish()) return [];
    if (!Object.keys(flat).length) { ctx.skip('user_settings', doc.__id, 'no switched-off category (absent row means everything on)'); return []; }
    return [{ userId, notifications: stableStringify(flat), updatedAt }];
  },
  columns: { user_id: (v) => v.userId, notifications: (v) => v.notifications, updated_at: (v) => v.updatedAt },
};

// ---------------------------------------------------------------- member-scoped small tables
/** Resolve (tenantId, memberId) of a member-scoped document and require a membership row. */
export function memberOf(r, { field = 'memberId', requireMembership = true } = {}) {
  const tenantId = r.tenantId();
  let raw = r.str(field);
  if (!raw && tenantId && r.id.startsWith(tenantId + '_')) { raw = r.id.slice(tenantId.length + 1); r.warn('member-id-from-doc-id', r.id); }
  if (!raw) r.bad(`missing ${field}`);
  const memberId = raw ? r.ctx.uidId(raw) : null;
  if (!r.need('tenants', 'tenant', tenantId)) return { tenantId, memberId, raw };
  if (requireMembership) r.need('memberships', 'member', tenantId, memberId);
  return { tenantId, memberId, raw };
}

function noteSpec(table, { named }) {
  return {
    table, from: table,
    key: (row) => k(row.tenant_id, row.member_id),
    build(doc, ctx) {
      const r = new Reader(ctx, table, doc);
      const { tenantId, memberId } = memberOf(r);
      const v = { tenantId, memberId, text: r.text('text', { req: true }), by: r.uid('updatedBy', { req: true }),
        byName: named ? r.str('updatedByName') : null, at: r.ts('updatedAt', { req: true, fallback: 0 }) };
      // member_admin_notes has no name column: the denormalised copy is dropped, not carried.
      if (!r.finish(named ? [] : ['updatedByName'])) return [];
      return [v];
    },
    columns: {
      tenant_id: (v) => v.tenantId, member_id: (v) => v.memberId, text: (v) => v.text, updated_by: (v) => v.by,
      ...(named ? { updated_by_name: (v) => v.byName } : {}), updated_at: (v) => v.at,
    },
  };
}
export const memberNotes = noteSpec('member_notes', { named: true });
export const memberAdminNotes = noteSpec('member_admin_notes', { named: false });

export const memberAddresses = {
  table: 'member_addresses', from: 'member_addresses',
  key: (row) => k(row.tenant_id, row.member_id),
  build(doc, ctx) {
    const r = new Reader(ctx, 'member_addresses', doc);
    const { tenantId, memberId } = memberOf(r);
    const v = { tenantId, memberId, address: r.text('address', { req: true }), by: r.uid('updatedBy', { req: true }), at: r.ts('updatedAt', { req: true, fallback: 0 }) };
    if (!r.finish()) return [];
    return [v];
  },
  columns: { tenant_id: (v) => v.tenantId, member_id: (v) => v.memberId, address: (v) => v.address, updated_by: (v) => v.by, updated_at: (v) => v.at },
};

// ---------------------------------------------------------------- catalog
const MONEY_PACKAGE = ['price'];
export const gymPackages = {
  table: 'gym_packages', from: 'gym_packages',
  key: (row) => row.id,
  build(doc, ctx) {
    const r = new Reader(ctx, 'gym_packages', doc);
    const tenantId = r.tenantId();
    r.need('tenants', 'tenant', tenantId);
    r.money('price', { req: true });   // validates the scaling; the blob applies it
    const data = r.blob({ omit: ['tenantId', 'activeAssignmentCount'], money: MONEY_PACKAGE });
    ctx.fsPackageCounts ??= new Map();
    ctx.fsPackageCounts.set(doc.__id, r.raw('activeAssignmentCount') ?? null);
    if (!r.finish()) return [];
    return [{ id: doc.__id, tenantId, data }];
  },
  columns: { id: (v) => v.id, tenant_id: (v) => v.tenantId, data: (v) => v.data, active_assignment_count: () => 0 },
};

export const promotions = {
  table: 'promotions', from: 'promotions',
  key: (row) => row.id,
  build(doc, ctx) {
    const r = new Reader(ctx, 'promotions', doc);
    const tenantId = r.tenantId();
    r.need('tenants', 'tenant', tenantId);
    // `value` is a lira amount only for amountDiscount; for the other kinds it is a percent / day / lesson count.
    const money = doc.kind === 'amountDiscount' ? ['value'] : [];
    const data = r.blob({ omit: ['tenantId'], money });
    if (!r.finish()) return [];
    return [{ id: doc.__id, tenantId, data }];
  },
  columns: { id: (v) => v.id, tenant_id: (v) => v.tenantId, data: (v) => v.data },
};

// ---------------------------------------------------------------- packages, credits, change requests
const PKG_STATUS = ['active', 'frozen', 'expired', 'cancelled'];
export const memberPackages = {
  table: 'member_packages', from: 'member_packages',
  key: (row) => row.id,
  build(doc, ctx) {
    const r = new Reader(ctx, 'member_packages', doc);
    const { tenantId, memberId } = memberOf(r);
    const packageId = r.str('packageId', { req: true });
    const listPrice = doc.listPrice;
    let finalPrice = r.money('finalPrice');
    if (finalPrice === null) {
      const fb = r.money(typeof listPrice === 'number' ? 'listPrice' : 'price');
      if (fb === null) r.bad('no finalPrice/listPrice');
      else { r.warn('final-price-from-list-price', String(fb)); finalPrice = fb; }
    }
    const startsAt = r.ts('startsAt', { req: true });
    const status = r.enumStr('status', PKG_STATUS, { req: true });
    // 0030: rows imported from Firestore set frozen_until from freezes[last].endsAt (NULL unless frozen).
    let frozenUntil = null;
    if (status === 'frozen') {
      const last = Array.isArray(doc.freezes) ? doc.freezes[doc.freezes.length - 1] : undefined;
      const ms = last && typeof last === 'object' ? toMs(last.endsAt) : null;
      if (Number.isFinite(ms)) frozenUntil = Math.floor(ms);
      else r.warn('frozen-without-end', 'status frozen but freezes[last].endsAt missing; frozen_until NULL (the sweep falls back to the JSON)');
    }
    const view = {
      id: doc.__id, tenantId, memberId, packageId, finalPrice, startsAt, frozenUntil,
      endsAt: r.ts('endsAt', { req: true }), status,
      paymentId: r.str('paymentId'), assignedAt: r.ts('assignedAt', { req: true, fallback: startsAt ?? 0 }), assignedBy: r.uid('assignedBy'),
      data: r.blob({ omit: ['tenantId', 'memberId', 'packageId', 'finalPrice', 'startsAt', 'endsAt', 'status', 'paymentId', 'assignedAt', 'assignedBy'], money: ['listPrice'] }),
    };
    if (!r.finish()) return [];
    return [view];
  },
  columns: {
    id: (v) => v.id, tenant_id: (v) => v.tenantId, member_id: (v) => v.memberId, package_id: (v) => v.packageId,
    final_price: (v) => v.finalPrice, starts_at: (v) => v.startsAt, ends_at: (v) => v.endsAt, status: (v) => v.status,
    payment_id: (v) => v.paymentId, data: (v) => v.data, assigned_at: (v) => v.assignedAt, assigned_by: (v) => v.assignedBy,
    frozen_until: (v) => v.frozenUntil,
  },
};

export const memberCredits = {
  table: 'member_credits', from: 'member_credits',
  key: (row) => k(row.tenant_id, row.id),
  build(doc, ctx) {
    const r = new Reader(ctx, 'member_credits', doc);
    const { tenantId, memberId } = memberOf(r);
    const total = r.int('total', { req: true, min: 1 });
    const used = r.int('used', { req: true, min: 0 });
    if (total !== null && used !== null && used > total) r.bad(`used ${used} exceeds total ${total}`);
    const startsAt = r.ts('startsAt', { req: true });
    const expiresAt = r.ts('expiresAt', { req: true });
    if (startsAt !== null && expiresAt !== null && expiresAt < startsAt) r.bad('expiresAt before startsAt');
    const view = {
      id: doc.__id, tenantId, memberId, total, used, startsAt, expiresAt,
      kind: r.enumStr('kind', ['ptLesson', 'groupClass'], { req: true }),
      source: r.enumStr('source', ['purchase', 'entitlement'], { req: true }),
      sourcePackageId: r.str('sourcePackageId', { req: true }),
      status: r.enumStr('status', ['active', 'exhausted', 'expired', 'cancelled', 'revoked'], { req: true }),
    };
    if (!r.finish()) return [];
    return [view];
  },
  columns: {
    id: (v) => v.id, tenant_id: (v) => v.tenantId, member_id: (v) => v.memberId, kind: (v) => v.kind, source: (v) => v.source,
    source_package_id: (v) => v.sourcePackageId, total: (v) => v.total, used: (v) => v.used,
    starts_at: (v) => v.startsAt, expires_at: (v) => v.expiresAt, status: (v) => v.status,
  },
};

export const packageChangeRequests = {
  table: 'package_change_requests', from: 'package_change_requests',
  key: (row) => row.id,
  build(doc, ctx) {
    const r = new Reader(ctx, 'package_change_requests', doc);
    const { tenantId, memberId } = memberOf(r);
    const view = {
      id: doc.__id, tenantId, memberId,
      effectiveAt: r.ts('effectiveAt', { req: true }), expiresAt: r.ts('expiresAt', { req: true }),
      status: r.enumStr('status', ['pending', 'approved', 'rejected', 'expired', 'cancelled'], { req: true }),
      appliedAt: r.ts('appliedAt'), createdBy: r.uid('createdBy'), createdAt: r.ts('createdAt', { req: true, fallback: 0 }),
      respondedAt: r.ts('respondedAt'),
      data: r.blob({
        omit: ['tenantId', 'memberId', 'effectiveAt', 'expiresAt', 'status', 'appliedAt', 'createdBy', 'createdAt', 'respondedAt'],
        money: ['priceDelta', 'refundAmount', 'currentSummary.price', 'proposedSummary.price'],
      }),
    };
    if (!r.finish()) return [];
    return [view];
  },
  columns: {
    id: (v) => v.id, tenant_id: (v) => v.tenantId, member_id: (v) => v.memberId, data: (v) => v.data,
    effective_at: (v) => v.effectiveAt, expires_at: (v) => v.expiresAt, status: (v) => v.status,
    applied_at: (v) => v.appliedAt, created_by: (v) => v.createdBy, created_at: (v) => v.createdAt, responded_at: (v) => v.respondedAt,
  },
};

export const CORE_SPECS = [
  tenants, tenantContacts, memberships, users, identities, userSettings, memberNotes, memberAdminNotes, memberAddresses,
  gymPackages, promotions, memberPackages, memberCredits, packageChangeRequests,
];
