/**
 * Scheduled package jobs (Firebase creditRollover, expirePendingPackageChangeRequests,
 * notifyExpiringPackages, sweepPackageStatuses). Plain functions; the Worker's `scheduled()` handler
 * (Cron Triggers) calls them. Every job is
 *  - idempotent: a second run over the same state changes nothing (state transitions are conditional
 *    UPDATEs, new rows have deterministic ids or outbox dedupe keys);
 *  - chunked: at most `limit` rows per call, `more: true` when rows remain (call again, or wait for the
 *    next tick). A crash between chunks loses nothing: the next run starts from the remaining state;
 *  - atomic per unit: a status change and everything that must follow it (successor credit, counter
 *    recount, outbox rows) share ONE db.batch.
 * Day boundaries are Istanbul calendar days (fixed UTC+3, see pkgSupport).
 */
import { chunks, DAY, guardedOutbox, istanbulDayStart, pkgPush, recountPackage } from '../pkgSupport';

const IN = (n: number) => Array.from({ length: n }, () => '?').join(',');

// ---- creditRollover (PKG-2) ----

/**
 * Expires every past-due credit and, for entitlement-sourced ones whose package is still live, rolls it
 * into its next period. One batch per credit pair: the expiry and the successor commit together, so a
 * crash can never delete a member's entitlement. The successor id is deterministic (`<creditId>_next`),
 * so a redelivered run cannot mint a second one. Credits 'exhausted' (fully spent) roll too: the member
 * who used the product must not lose the right.
 *
 * A successor is created only if the source package is `active` (not frozen / cancelled / expired), has
 * not ended, and still carries a quota (count and periodDays > 0) for that kind. A package cancelled
 * 'until-end' stays `active`, so its periodic credits keep renewing until it ends: the member paid for
 * the period. Purchased lesson bundles (source 'purchase') only expire.
 */
export async function creditRollover(db: D1Database, now: number, limit = 200) {
  const { results: due } = await db.prepare(
    `SELECT id FROM member_credits WHERE status IN ('active','exhausted') AND expires_at <= ? ORDER BY expires_at LIMIT ?`,
  ).bind(now, limit + 1).all<{ id: string }>();
  const ids = due.slice(0, limit).map((r) => r.id);
  let expired = 0, renewed = 0;
  for (const part of chunks(ids, 25)) {
    const stmts: D1PreparedStatement[] = [];
    for (const id of part) {
      stmts.push(
        db.prepare(`UPDATE member_credits SET status = 'expired' WHERE id = ? AND status IN ('active','exhausted') AND expires_at <= ?`).bind(id, now),
        // Adjacent to the UPDATE above: changes() = 1 means THIS run expired it (not another run, not a no-op).
        db.prepare(
          `INSERT OR IGNORE INTO member_credits (id, tenant_id, member_id, kind, source, source_package_id, total, used, starts_at, expires_at, status)
           SELECT ?1 || '_next', x.tenant_id, x.member_id, x.kind, 'entitlement', x.source_package_id, x.cnt, 0, ?2, ?2 + x.per * ${DAY}, 'active'
           FROM (SELECT c.id, c.tenant_id, c.member_id, c.kind, c.source_package_id, c.source,
                   CASE c.kind WHEN 'ptLesson' THEN json_extract(p.data, '$.entitlements.ptLessons.count') ELSE json_extract(p.data, '$.entitlements.groupClasses.count') END AS cnt,
                   CASE c.kind WHEN 'ptLesson' THEN json_extract(p.data, '$.entitlements.ptLessons.periodDays') ELSE json_extract(p.data, '$.entitlements.groupClasses.periodDays') END AS per,
                   p.status AS pstatus, p.ends_at AS pends
                 FROM member_credits c JOIN member_packages p ON p.id = c.source_package_id AND p.tenant_id = c.tenant_id
                 WHERE c.id = ?1) x
           WHERE changes() = 1 AND x.source = 'entitlement' AND x.pstatus = 'active' AND x.pends > ?2
             AND x.cnt > 0 AND x.per > 0`,
        ).bind(id, now),
      );
    }
    await db.batch(stmts);
    const marks = IN(part.length);
    const e = await db.prepare(`SELECT count(*) AS n FROM member_credits WHERE id IN (${marks}) AND status = 'expired'`).bind(...part).first<{ n: number }>();
    const r = await db.prepare(`SELECT count(*) AS n FROM member_credits WHERE id IN (${IN(part.length)})`).bind(...part.map((id) => id + '_next')).first<{ n: number }>();
    expired += e?.n ?? 0;
    renewed += r?.n ?? 0;
  }
  return { due: ids.length, expired, renewed, skipped: Math.max(0, expired - renewed), more: due.length > limit };
}

// ---- expirePendingPackageChangeRequests (PKG-6) ----

/** A proposal nobody answered does not stay pending forever. Set-based and idempotent. */
export async function expirePendingPackageChangeRequests(db: D1Database, now: number, limit = 500) {
  const { results } = await db.prepare(
    `UPDATE package_change_requests SET status = 'expired'
     WHERE id IN (SELECT id FROM package_change_requests WHERE status = 'pending' AND expires_at <= ? ORDER BY expires_at LIMIT ?)
       AND status = 'pending' AND expires_at <= ?
     RETURNING id`,
  ).bind(now, limit, now).all<{ id: string }>();
  return { expired: results.length, more: results.length >= limit };
}

// ---- sweepPackageStatuses (PKG-10 + PKG-12) ----

const FREEZE_END = `COALESCE(frozen_until, json_extract(data, '$.freezes[#-1].endsAt'))`;

/**
 * Keeps member_packages.status honest. Two transitions nothing else performs:
 *  1. un-freeze: a frozen package whose last freeze has ended returns to `active`, or straight to
 *     `expired` if its (shifted) end date has also passed - the dates decide, not the order of the sweeps;
 *  2. expire: an `active` package whose end date has passed becomes `expired`.
 * The in-use counter (gym_packages.active_assignment_count) is recounted in the same batch for every
 * package whose rows moved. `limit` applies per transition.
 */
export async function sweepPackageStatuses(db: D1Database, now: number, limit = 500) {
  let resumed = 0, expired = 0, more = false;

  const frozen = await db.prepare(
    `SELECT id, package_id, tenant_id FROM member_packages WHERE status = 'frozen' AND ${FREEZE_END} <= ? ORDER BY ${FREEZE_END} LIMIT ?`,
  ).bind(now, limit + 1).all<{ id: string; package_id: string; tenant_id: string }>();
  more ||= frozen.results.length > limit;
  for (const part of chunks(frozen.results.slice(0, limit), 40)) {
    const ids = part.map((r) => r.id);
    await db.batch([
      db.prepare(
        `UPDATE member_packages SET status = CASE WHEN ends_at <= ? THEN 'expired' ELSE 'active' END, frozen_until = NULL
         WHERE id IN (${IN(ids.length)}) AND status = 'frozen' AND ${FREEZE_END} <= ?`,
      ).bind(now, ...ids, now),
      ...recountAll(db, part),
    ]);
    resumed += (await db.prepare(`SELECT count(*) AS n FROM member_packages WHERE id IN (${IN(ids.length)}) AND status <> 'frozen'`).bind(...ids).first<{ n: number }>())?.n ?? 0;
  }

  const lapsed = await db.prepare(
    `SELECT id, package_id, tenant_id FROM member_packages WHERE status = 'active' AND ends_at <= ? ORDER BY ends_at LIMIT ?`,
  ).bind(now, limit + 1).all<{ id: string; package_id: string; tenant_id: string }>();
  more ||= lapsed.results.length > limit;
  for (const part of chunks(lapsed.results.slice(0, limit), 40)) {
    const ids = part.map((r) => r.id);
    await db.batch([
      db.prepare(`UPDATE member_packages SET status = 'expired' WHERE id IN (${IN(ids.length)}) AND status = 'active' AND ends_at <= ?`).bind(...ids, now),
      ...recountAll(db, part),
    ]);
    expired += (await db.prepare(`SELECT count(*) AS n FROM member_packages WHERE id IN (${IN(ids.length)}) AND status = 'expired'`).bind(...ids).first<{ n: number }>())?.n ?? 0;
  }
  return { resumed, expired, more };
}

const recountAll = (db: D1Database, rows: { package_id: string; tenant_id: string }[]) =>
  [...new Map(rows.map((r) => [`${r.tenant_id}/${r.package_id}`, r])).values()].map((r) => recountPackage(db, r.tenant_id, r.package_id));

// ---- notifyExpiringPackages (ADMIN-3) ----

/**
 * Memberships about to lapse: both the member and the gym's admins hear about it, ONCE, on the day a
 * package has exactly 7 and exactly 1 Istanbul day(s) left (not "7 or fewer": the same warning every
 * morning for a week teaches people to ignore it). `data.notifiedExpiryAt` records the day-count already
 * sent, and the outbox dedupe key `pkg-expiry:<id>:<days>` makes a re-run harmless even if that write
 * were lost. `limit` bounds the packages handled per call across both stages.
 */
export async function notifyExpiringPackages(db: D1Database, now: number, limit = 200) {
  let budget = limit, notified = 0, more = false;
  const adminCache = new Map<string, string[]>();
  const adminsOf = async (tenantId: string) => {
    if (!adminCache.has(tenantId)) {
      const { results } = await db.prepare(
        `SELECT member_id FROM memberships WHERE tenant_id = ? AND status = 'active' AND EXISTS (SELECT 1 FROM json_each(memberships.roles) WHERE value = 'admin')`,
      ).bind(tenantId).all<{ member_id: string }>();
      adminCache.set(tenantId, results.map((r) => r.member_id));
    }
    return adminCache.get(tenantId)!;
  };

  for (const daysLeft of [7, 1]) {
    const windowStart = istanbulDayStart(now) + daysLeft * DAY;
    const { results } = await db.prepare(
      `SELECT id, tenant_id, member_id, data FROM member_packages
       WHERE status = 'active' AND ends_at >= ? AND ends_at < ? AND COALESCE(json_extract(data, '$.notifiedExpiryAt'), 0) <> ?
       ORDER BY ends_at LIMIT ?`,
    ).bind(windowStart, windowStart + DAY, daysLeft, budget + 1).all<{ id: string; tenant_id: string; member_id: string; data: string }>();
    if (results.length > budget) more = true;
    const todo = results.slice(0, budget);
    budget -= todo.length;
    const label = daysLeft === 1 ? 'yarın' : `${daysLeft} gün sonra`;
    for (const part of chunks(todo, 20)) {
      const stmts: D1PreparedStatement[] = [];
      for (const p of part) {
        const d = JSON.parse(p.data) as { packageName?: string; memberName?: string };
        const admins = await adminsOf(p.tenant_id);
        const guard = `EXISTS (SELECT 1 FROM member_packages WHERE id = ? AND json_extract(data, '$.notifiedExpiryAt') = ?)`;
        stmts.push(
          db.prepare(
            `UPDATE member_packages SET data = json_set(data, '$.notifiedExpiryAt', ?2)
             WHERE id = ?1 AND status = 'active' AND COALESCE(json_extract(data, '$.notifiedExpiryAt'), 0) <> ?2`,
          ).bind(p.id, daysLeft),
          guardedOutbox(db, 'push', pkgPush([p.member_id], 'Paketin bitmek üzere', `${d.packageName} paketin ${label} sona eriyor.`, 'member/index'),
            `pkg-expiry:${p.id}:${daysLeft}:member`, guard, [p.id, daysLeft], now),
        );
        if (admins.length) {
          stmts.push(guardedOutbox(db, 'push', pkgPush(admins, 'Paket bitmek üzere', `${d.memberName || 'Bir üye'} · ${d.packageName} ${label} bitiyor.`, 'admin/members'),
            `pkg-expiry:${p.id}:${daysLeft}:admins`, guard, [p.id, daysLeft], now));
        }
      }
      await db.batch(stmts);
      const ids = part.map((p) => p.id);
      notified += (await db.prepare(`SELECT count(*) AS n FROM member_packages WHERE id IN (${IN(ids.length)}) AND json_extract(data, '$.notifiedExpiryAt') = ?`)
        .bind(...ids, daysLeft).first<{ n: number }>())?.n ?? 0;
    }
  }
  return { notified, more };
}

/** Convenience for a single daily Cron Trigger. Each job is independent: one failing must not starve the others. */
export async function runPackageJobs(db: D1Database, now: number) {
  const out: Record<string, unknown> = {};
  const jobs = { sweepPackageStatuses, creditRollover, expirePendingPackageChangeRequests, notifyExpiringPackages } as const;
  for (const [name, job] of Object.entries(jobs)) {
    try { out[name] = await job(db, now); } catch (e) { out[name] = { error: String((e as Error).message).slice(0, 200) }; }
  }
  return out;
}
