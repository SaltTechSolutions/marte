/**
 * What "erase one person" means, in statements. Shared by account deletion (`tenantId` omitted: every gym the
 * person is in) and by an admin removing someone from ONE gym (`tenantId` given: only that gym's rows).
 * The rules are the ones account.ts documents (ERASED / KEPT, SCRUBBED / FK ANCHORS); this file only knows
 * how to scope them. Statements are returned in the order they must run (tallies and refunds read rows that
 * a later statement deletes), and `deleteIdx` names the ones whose `meta.changes` count as "rows deleted".
 */

export const ADMIN_ROLE = (alias: string) => `EXISTS (SELECT 1 FROM json_each(${alias}.roles) WHERE value = 'admin')`;

export type EraseOptions = { uid: string; now: number; tenantId?: string };

export function eraseStatements(db: D1Database, o: EraseOptions): { stmts: D1PreparedStatement[]; deleteIdx: number[] } {
  const { uid, now, tenantId } = o;
  /** ` AND <col> = ?3` when scoped to one gym, nothing otherwise. */
  const T = (col = 'tenant_id') => (tenantId ? ` AND ${col} = ?3` : '');
  const stmts: D1PreparedStatement[] = [];
  const deleteIdx: number[] = [];
  /** Numbered params: ?1 person, ?2 now, ?3 gym. Each statement binds exactly as many as it mentions. */
  const add = (sql: string, isDelete = false) => {
    const max = Math.max(0, ...[...sql.matchAll(/\?(\d)/g)].map((m) => Number(m[1])));
    if (isDelete) deleteIdx.push(stmts.length);
    stmts.push(db.prepare(sql).bind(...[uid, now, tenantId].slice(0, max)));
  };
  const mine = (table: string) => add(`DELETE FROM ${table} WHERE member_id = ?1${T()}`, true);

  // Seat and admin tallies first: they are read off memberships that are about to go.
  add(`UPDATE tenants SET active_member_count = MAX(active_member_count - 1, 0) WHERE id IN
         (SELECT tenant_id FROM memberships WHERE member_id = ?1 AND status = 'active'${T()}
            AND EXISTS (SELECT 1 FROM json_each(memberships.roles) WHERE value = 'member'))`);
  add(`UPDATE tenants SET active_admin_count = MAX(active_admin_count - 1, 0) WHERE id IN
         (SELECT tenant_id FROM memberships WHERE member_id = ?1 AND status = 'active'${T()} AND ${ADMIN_ROLE('memberships')})`);
  // The packages this person held stop counting toward their package's in-use tally.
  add(`UPDATE gym_packages SET active_assignment_count =
         (SELECT count(*) FROM member_packages mp WHERE mp.tenant_id = gym_packages.tenant_id AND mp.package_id = gym_packages.id
            AND mp.status IN ('active','frozen') AND mp.member_id != ?1)
       WHERE id IN (SELECT package_id FROM member_packages WHERE member_id = ?1${T()})`);
  // A trainer leaving: their upcoming sessions are cancelled WITH the lesson given back to the member.
  add(`UPDATE member_credits SET
         used = MAX(used - (SELECT count(*) FROM pt_sessions s WHERE s.credit_id = member_credits.id AND s.trainer_id = ?1
                            AND s.status = 'scheduled' AND s.starts_at >= ?2), 0),
         status = CASE WHEN status = 'exhausted' AND expires_at > ?2 THEN 'active' ELSE status END
       WHERE id IN (SELECT credit_id FROM pt_sessions WHERE trainer_id = ?1 AND status = 'scheduled' AND starts_at >= ?2 AND credit_id IS NOT NULL${T()})`);
  add(`UPDATE pt_sessions SET status = 'cancelled', cancelled_at = ?2, cancelled_by = ?1, cancelled_by_role = 'system',
         refund_outcome = CASE WHEN credit_id IS NULL THEN 'no-credit' ELSE 'refunded' END, updated_at = ?2
       WHERE trainer_id = ?1 AND status = 'scheduled' AND starts_at >= ?2${T()}`);
  // A member leaving: upcoming sessions are cancelled (the slot frees), past ones stay for the trainer's calendar.
  add(`UPDATE pt_sessions SET status = 'cancelled', cancelled_at = ?2, cancelled_by = ?1, cancelled_by_role = 'system',
         refund_outcome = 'void', updated_at = ?2
       WHERE member_id = ?1 AND status = 'scheduled' AND starts_at >= ?2${T()}`);
  // Credits are deleted below; a retained session must not point at them.
  add(`UPDATE pt_sessions SET credit_id = NULL WHERE member_id = ?1 AND credit_id IS NOT NULL${T()}`);
  mine('class_waitlist');
  mine('class_bookings');            // class_attendance marks go with them (ON DELETE CASCADE)
  mine('member_credits');
  mine('member_packages');
  mine('checkins');
  mine('programs');
  mine('measurements');
  mine('workout_logs');
  mine('member_notes');
  mine('member_admin_notes');
  mine('member_addresses');
  mine('renewal_requests');
  mine('package_change_requests');
  add(`DELETE FROM calendar_shares WHERE (owner_trainer_id = ?1 OR viewer_trainer_id = ?1)${T()}`, true);
  add(`DELETE FROM trainer_availability WHERE trainer_id = ?1${T()}`, true);
  // A device token is tied to the gym it registered for; account deletion drops all of them.
  add(`DELETE FROM push_tokens WHERE user_id = ?1${T()}`, true);
  // Children of an erased parent lose a consent authority that no longer exists (Firebase left it dangling).
  add(`UPDATE memberships SET guardian_id = NULL, guardian_name = NULL, guardian_status = NULL,
         guardian_consent_at = NULL, guardian_consent_version = NULL WHERE guardian_id = ?1${T()}`);
  // Ledger: anonymised, never deleted. Also the payer's name on entries this person filed for others.
  add(`UPDATE payments SET data = json_remove(json_set(data, '$.memberName', 'Silinmiş üye', '$.memberDeletedAt', ?2), '$.note') WHERE member_id = ?1${T()}`);
  add(`UPDATE payments SET data = json_remove(data, '$.submittedByName') WHERE json_extract(data, '$.submittedBy') = ?1${T()}`);
  // Names stamped on gym content this person authored.
  add(`UPDATE announcements SET created_by_name = NULL WHERE created_by = ?1${T()}`);
  add(`UPDATE exercise_reports SET reported_by_name = NULL WHERE reported_by = ?1${T()}`);
  add(`UPDATE member_notes SET updated_by_name = NULL WHERE updated_by = ?1${T()}`);
  // Memberships: gone, except where a retained PT session still needs the row (as member or as trainer).
  add(`DELETE FROM memberships WHERE member_id = ?1${T()} AND NOT EXISTS (
         SELECT 1 FROM pt_sessions s WHERE s.tenant_id = memberships.tenant_id AND (s.member_id = memberships.member_id OR s.trainer_id = memberships.member_id))`, true);
  add(`UPDATE memberships SET status = 'left', left_at = ?2, roles = '["member"]', permissions = '[]', display_name = 'Silinmiş üye',
         email = NULL, phone = NULL, birth_date = NULL, height_cm = NULL, photo_url = NULL, avatar_id = NULL, short_code = NULL,
         guardian_id = NULL, guardian_name = NULL, guardian_status = NULL, guardian_consent_at = NULL, guardian_consent_version = NULL
       WHERE member_id = ?1${T()}`);
  return { stmts, deleteIdx };
}
