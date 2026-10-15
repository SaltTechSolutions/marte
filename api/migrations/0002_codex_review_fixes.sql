-- Fixes from the 15 Oct 2026 cross-model review of 0001 (docs/KARAR-DEFTERI.md).
-- Nothing holds data yet (staging only), so affected tables are dropped and
-- recreated rather than copied; after real data exists this pattern is forbidden.

DROP TABLE class_bookings;
DROP TABLE memberships;
DROP TABLE member_credits;
DROP TABLE pt_sessions;
DROP TABLE program_templates;

-- Every person, account or not, is a users row. Managed members have no
-- identities row; member_id is therefore always a verifiable users.id.
CREATE TABLE memberships (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending','active','rejected','suspended','left')),
  roles TEXT NOT NULL DEFAULT '["member"]' CHECK (json_valid(roles)),
  permissions TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(permissions)),
  display_name TEXT, email TEXT, phone TEXT,
  birth_date INTEGER, height_cm INTEGER CHECK (height_cm IS NULL OR height_cm BETWEEN 100 AND 250),
  photo_url TEXT, short_code TEXT,
  managed INTEGER NOT NULL DEFAULT 0 CHECK (managed IN (0,1)),
  created_by TEXT REFERENCES users(id),
  guardian_id TEXT, guardian_name TEXT,
  guardian_status TEXT CHECK (guardian_status IN ('pending','approved','rejected')),
  guardian_consent_at INTEGER, guardian_consent_version TEXT,
  requested_at INTEGER NOT NULL, approved_at INTEGER, left_at INTEGER,
  PRIMARY KEY (tenant_id, member_id)
);
CREATE UNIQUE INDEX memberships_short_code ON memberships(tenant_id, short_code) WHERE short_code IS NOT NULL;
CREATE INDEX memberships_member ON memberships(member_id);
CREATE INDEX memberships_status ON memberships(tenant_id, status);
CREATE INDEX memberships_guardian ON memberships(guardian_id) WHERE guardian_id IS NOT NULL;

CREATE UNIQUE INDEX classes_tenant_id ON classes(tenant_id, id);   -- composite FK parent

CREATE TABLE member_credits (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, member_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('ptLesson','groupClass')),
  source TEXT NOT NULL CHECK (source IN ('purchase','entitlement')),
  source_package_id TEXT NOT NULL,
  total INTEGER NOT NULL CHECK (total > 0),
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0 AND used <= total),
  starts_at INTEGER NOT NULL, expires_at INTEGER NOT NULL CHECK (expires_at >= starts_at),
  status TEXT NOT NULL CHECK (status IN ('active','exhausted','expired','cancelled','revoked')),
  FOREIGN KEY (tenant_id, member_id) REFERENCES memberships(tenant_id, member_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX member_credits_tenant_id ON member_credits(tenant_id, id);
CREATE INDEX member_credits_lookup ON member_credits(tenant_id, member_id, kind, status, expires_at);
CREATE INDEX member_credits_source ON member_credits(source_package_id);
CREATE INDEX member_credits_expiry ON member_credits(status, expires_at);

CREATE TABLE class_bookings (
  tenant_id TEXT NOT NULL, class_id TEXT NOT NULL, member_id TEXT NOT NULL,
  credit_id TEXT, created_at INTEGER NOT NULL,
  PRIMARY KEY (class_id, member_id),
  FOREIGN KEY (tenant_id, class_id) REFERENCES classes(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, member_id) REFERENCES memberships(tenant_id, member_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, credit_id) REFERENCES member_credits(tenant_id, id)
);
CREATE INDEX class_bookings_member ON class_bookings(tenant_id, member_id, class_id);

CREATE TABLE pt_sessions (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, trainer_id TEXT NOT NULL, member_id TEXT NOT NULL,
  original_trainer_id TEXT, starts_at INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  status TEXT NOT NULL CHECK (status IN ('scheduled','completed','cancelled')),
  credit_id TEXT,
  cancellation_deadline_at INTEGER,    -- frozen at booking; recomputing would change an earned right
  cancelled_by TEXT, cancelled_by_role TEXT CHECK (cancelled_by_role IN ('member','trainer','admin')),
  refund_outcome TEXT, reminder_sent_at INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  FOREIGN KEY (tenant_id, member_id) REFERENCES memberships(tenant_id, member_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, trainer_id) REFERENCES memberships(tenant_id, member_id),
  FOREIGN KEY (tenant_id, credit_id) REFERENCES member_credits(tenant_id, id)
);
CREATE INDEX pt_sessions_trainer ON pt_sessions(tenant_id, trainer_id, starts_at);
CREATE INDEX pt_sessions_member ON pt_sessions(tenant_id, member_id, starts_at);
CREATE INDEX pt_sessions_tenant_time ON pt_sessions(tenant_id, starts_at);
CREATE INDEX pt_sessions_credit ON pt_sessions(credit_id);

-- tenant_id NULL = global template (read by everyone, written by platform admins only).
CREATE TABLE program_templates (
  id TEXT PRIMARY KEY, tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  data TEXT NOT NULL CHECK (json_valid(data)), updated_at INTEGER NOT NULL
);

CREATE TABLE user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  notifications TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(notifications)),
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX refunds_natural ON class_cancellation_refunds(tenant_id, class_id, member_id);
CREATE UNIQUE INDEX renewal_one_pending ON renewal_requests(tenant_id, member_id) WHERE status = 'pending';

CREATE INDEX member_packages_package ON member_packages(tenant_id, package_id, status);
CREATE INDEX member_packages_expiry ON member_packages(status, ends_at);
CREATE INDEX payments_member ON payments(tenant_id, member_id, created_at);
CREATE INDEX announcements_tenant ON announcements(tenant_id, created_at);
CREATE INDEX renewal_status ON renewal_requests(tenant_id, status);
CREATE INDEX push_tokens_user ON push_tokens(user_id);
