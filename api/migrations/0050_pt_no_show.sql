-- PT sessions: a member who does not turn up is a state of its own, 'no-show' (not 'completed', not 'cancelled').
-- The lesson stays spent (no refund_outcome: that column is only for cancelled sessions, see the CHECK below).
-- D1/SQLite cannot ALTER a CHECK, so this is a table rebuild: copy, drop, rename, recreate the indexes.
-- Everything else is exactly migration 0010's table (constraints, foreign keys). pt_batch_abort is untouched.

CREATE TABLE pt_sessions_v3 (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, trainer_id TEXT NOT NULL, member_id TEXT NOT NULL,
  original_trainer_id TEXT,
  starts_at INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 1 AND 480),
  status TEXT NOT NULL CHECK (status IN ('scheduled','completed','cancelled','no-show')),
  credit_id TEXT,                                -- NULL = staff-created, no credit spent
  cancellation_deadline_at INTEGER,              -- frozen at booking; recomputing would change an earned right
  cancelled_at INTEGER, cancelled_by TEXT,
  cancelled_by_role TEXT CHECK (cancelled_by_role IN ('member','guardian','trainer','admin','system')),
  -- refunded: credit came back | late: member cancelled after the deadline, credit burns |
  -- no-credit: nothing was spent | nothing-to-refund: refund due but the credit had no used lesson left |
  -- void: closed by the system with no refund decision (account deletion)
  refund_outcome TEXT CHECK (refund_outcome IN ('refunded','late','no-credit','nothing-to-refund','void')),
  reminder_sent_at INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  CHECK (refund_outcome IS NULL OR status = 'cancelled'),
  FOREIGN KEY (tenant_id, member_id) REFERENCES memberships(tenant_id, member_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, trainer_id) REFERENCES memberships(tenant_id, member_id),
  FOREIGN KEY (tenant_id, credit_id) REFERENCES member_credits(tenant_id, id)
);
INSERT INTO pt_sessions_v3 (id, tenant_id, trainer_id, member_id, original_trainer_id, starts_at, duration_minutes, status,
    credit_id, cancellation_deadline_at, cancelled_at, cancelled_by, cancelled_by_role, refund_outcome, reminder_sent_at, created_at, updated_at)
  SELECT id, tenant_id, trainer_id, member_id, original_trainer_id, starts_at, duration_minutes, status,
    credit_id, cancellation_deadline_at, cancelled_at, cancelled_by, cancelled_by_role, refund_outcome, reminder_sent_at, created_at, updated_at
  FROM pt_sessions;
DROP TABLE pt_sessions;
ALTER TABLE pt_sessions_v3 RENAME TO pt_sessions;
CREATE INDEX pt_sessions_trainer ON pt_sessions(tenant_id, trainer_id, starts_at);
CREATE INDEX pt_sessions_member ON pt_sessions(tenant_id, member_id, starts_at);
CREATE INDEX pt_sessions_tenant_time ON pt_sessions(tenant_id, starts_at);
CREATE INDEX pt_sessions_credit ON pt_sessions(credit_id);
CREATE INDEX pt_sessions_reminder ON pt_sessions(starts_at) WHERE status = 'scheduled' AND reminder_sent_at IS NULL;
