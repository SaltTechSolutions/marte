import { Hono } from 'hono';

import { eraseStatements, ADMIN_ROLE } from './erase';
import { abortIf, readBody, type App } from './guarded';
import { outboxStatement } from './outbox';

/**
 * Account lifecycle (F3): the caller's notification preferences and in-app account deletion.
 * Ports `user_settings` rules and `deleteMyAccount` in backend/functions/src/auth.ts.
 */
export const account = new Hono<App>();

/** The five kinds a person may switch off. `account` (consent and access flows) is deliberately not one. */
export const MUTABLE_CATEGORIES = ['bookings', 'packages', 'payments', 'programs', 'announcements'];

// ---------------------------------------------------------------------------------------------
// user_settings: keyed by person, never by gym; only the owner reads or writes it (there is no userId
// in any path, so no route can name someone else's). An absent row means "everything on".
// The row stores the FLAT category map ({"payments":false}): the outbox consumer reads
// json_extract(notifications, '$.' || category). The API speaks the app's shape, { push: {...} }.
// ---------------------------------------------------------------------------------------------
account.get('/me/settings', async (c) => {
  const uid = c.get('userId');
  const row = uid ? await c.env.DB.prepare(`SELECT notifications FROM user_settings WHERE user_id = ?`).bind(uid).first<{ notifications: string }>() : null;
  return c.json({ push: row ? JSON.parse(row.notifications) : {} });
});

account.patch('/me/settings', async (c) => {
  const uid = c.get('userId');
  if (!uid) return c.json({ error: 'bootstrap required' }, 409);
  const push = (await readBody(c)).push;
  if (!push || typeof push !== 'object' || Array.isArray(push) || !Object.keys(push).length) return c.json({ error: 'push map required' }, 400);
  for (const [k, v] of Object.entries(push)) {
    if (!MUTABLE_CATEGORIES.includes(k)) return c.json({ error: `cannot change "${k}"` }, 400);
    if (typeof v !== 'boolean') return c.json({ error: `${k} must be true or false` }, 400);
  }
  // json_patch merges: switching one category cannot wipe the others, and the first write creates the row.
  const patch = JSON.stringify(push);
  await c.env.DB.prepare(
    `INSERT INTO user_settings (user_id, notifications, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET notifications = json_patch(user_settings.notifications, excluded.notifications), updated_at = excluded.updated_at`,
  ).bind(uid, patch, Date.now()).run();
  const row = await c.env.DB.prepare(`SELECT notifications FROM user_settings WHERE user_id = ?`).bind(uid).first<{ notifications: string }>();
  return c.json({ push: JSON.parse(row!.notifications) });
});

// ---------------------------------------------------------------------------------------------
// Account deletion (App Store 5.1.1(v) / Play data-deletion). What is erased and what is kept follows what the
// public page apps/gymentra-site/delete-account promises:
//   ERASED  : identity link, profile, every membership + card, packages, credits, check-ins, measurements,
//             workouts, programs, notes about the person, address, bookings/waitlist, push tokens, settings,
//             calendar shares and trainer availability, renewal/package-change requests.
//   KEPT, SCRUBBED : payments (the gym's ledger: name -> "Silinmiş üye", free-text note removed; amount, date,
//             method and member id stay so totals add up), PT sessions (the trainer's calendar: future ones
//             are cancelled and free their slot, all of them lose the credit link).
//   FK ANCHORS: the `users` row stays as an anonymous tombstone (display name "Silinmiş üye", no e-mail, no
//             identity) because tenants.owner_user_id / memberships.created_by point at it; a membership row
//             stays as a scrubbed 'left' tombstone only where a retained PT session still references it.
// The Firebase Auth user cannot be deleted from D1: the response says so and the caller must finish it.
// ---------------------------------------------------------------------------------------------
/** True for every gym where `?` is an active admin and no OTHER active admin exists. */
const SOLE_ADMIN_SQL = `EXISTS (SELECT 1 FROM memberships m WHERE m.member_id = ? AND m.status = 'active' AND ${ADMIN_ROLE('m')}
  AND NOT EXISTS (SELECT 1 FROM memberships o WHERE o.tenant_id = m.tenant_id AND o.member_id != m.member_id AND o.status = 'active' AND ${ADMIN_ROLE('o')}))`;

account.post('/me/delete-account', async (c) => {
  const b = await readBody(c);
  // A destructive, irreversible call must be deliberate: a stray POST with no body is not a deletion.
  if (b.confirm !== true) return c.json({ error: 'send {"confirm": true}' }, 400);
  const uid = c.get('userId');
  const subject = c.get('subject');
  // No identity row: nothing left in D1 (never bootstrapped, or an earlier call already finished). Idempotent.
  if (!uid) return c.json({ deleted: true, alreadyDeleted: true, authDeletionRequired: true, subject, photoUrls: [] });

  const db = c.env.DB;
  const soleAdmin = async () => !!(await db.prepare(`SELECT ${SOLE_ADMIN_SQL} AS x`).bind(uid).first<{ x: number }>())?.x;
  // Never strand a gym without an admin (also what removeMemberFromTenant refuses).
  if (await soleAdmin()) return c.json({ error: 'sole admin of a gym; appoint another admin first' }, 409);

  const now = Date.now();
  const { results: trainees } = await db.prepare(
    `SELECT DISTINCT member_id FROM pt_sessions WHERE trainer_id = ? AND status = 'scheduled' AND starts_at >= ?`,
  ).bind(uid, now).all<{ member_id: string }>();
  const { results: kids } = await db.prepare(`SELECT DISTINCT member_id FROM memberships WHERE guardian_id = ? AND managed = 0`).bind(uid).all<{ member_id: string }>();
  const { results: photos } = await db.prepare(`SELECT DISTINCT photo_url FROM memberships WHERE member_id = ? AND photo_url IS NOT NULL`).bind(uid).all<{ photo_url: string }>();

  const run = (sql: string, ...binds: unknown[]) => db.prepare(sql).bind(...binds);
  const stmts: D1PreparedStatement[] = [
    // Re-checked INSIDE the batch: two admins deleting at once cannot both pass a stale read.
    abortIf(db, SOLE_ADMIN_SQL, uid),
  ];
  if (trainees.length) {
    stmts.push(outboxStatement(db, 'push', {
      userIds: trainees.map((t) => t.member_id), category: 'bookings', title: 'Randevun iptal edildi',
      body: 'Antrenörün hesabını sildiği için yaklaşan randevun iptal edildi.', data: { screen: 'member/index' },
    }, `account-deleted:${uid}:sessions`));
  }
  if (kids.length) {
    stmts.push(outboxStatement(db, 'push', {
      userIds: kids.map((k) => k.member_id), category: 'account', title: 'Ebeveyn bağlantın kaldırıldı',
      body: 'Ebeveynin hesabını sildi. Başka bir ebeveyn seçebilirsin.', data: { screen: '/member/edit-profile' },
    }, `account-deleted:${uid}:children`));
  }
  // Every gym's rows (shared with "an admin removes one person from one gym", see erase.ts).
  stmts.push(...eraseStatements(db, { uid, now }).stmts);
  stmts.push(
    run(`DELETE FROM user_settings WHERE user_id = ?`, uid),
    // Unlinking the provider subject is what makes the person unreachable; the users row is the anonymous anchor.
    run(`DELETE FROM identities WHERE user_id = ?`, uid),
    run(`UPDATE users SET display_name = 'Silinmiş üye', email = NULL WHERE id = ?`, uid),
  );

  try {
    await db.batch(stmts);
  } catch (e) {
    if (await soleAdmin()) return c.json({ error: 'sole admin of a gym; appoint another admin first' }, 409);
    throw e;
  }
  // The profile photo lives in R2, outside the D1 batch. Best effort and idempotent: a failure here must not
  // turn a completed erasure into an error (the keys are unguessable and no row points at them any more).
  try {
    const list = await c.env.MEDIA.list({ prefix: `members/${uid}/` });
    if (list.objects.length) await c.env.MEDIA.delete(list.objects.map((o) => o.key));
  } catch (e) {
    console.error('photo cleanup failed', e);
  }
  return c.json({
    deleted: true,
    // The Firebase Auth user is outside D1. The caller (app) must delete it (or an operator must, by `subject`).
    authDeletionRequired: true,
    subject,
    // Profile photos live in object storage, not in D1; they are listed so the storage layer can erase them.
    photoUrls: photos.map((p) => p.photo_url),
  });
});
