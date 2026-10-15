-- GymEntra D1 schema, v1. Maps the 28 Firestore collections (docs/D1-SEMA.md).
-- Enums are CHECK constraints: changing one later means a table rebuild, so the
-- value sets here come straight from docs/SCHEMA.md and must be complete.
-- Times are unix milliseconds (INTEGER). Money is integer kuruş.

CREATE TABLE users (
  id TEXT PRIMARY KEY,                 -- internal id; never a provider uid
  display_name TEXT,
  email TEXT,
  created_at INTEGER NOT NULL
);

-- Managed (account-less) members simply have no row here.
CREATE TABLE identities (
  provider TEXT NOT NULL CHECK (provider IN ('firebase')),
  subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (provider, subject)
);
CREATE INDEX identities_user ON identities(user_id);

CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  owner_user_id TEXT REFERENCES users(id),
  branding TEXT NOT NULL DEFAULT '{}',        -- JSON
  settings TEXT NOT NULL DEFAULT '{}',        -- JSON (cancellationHours, ...)
  subscription_status TEXT,
  active_member_count INTEGER NOT NULL DEFAULT 0,
  active_admin_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE tenant_contacts (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  data TEXT NOT NULL DEFAULT '{}'
);

-- member_id is users.id for app members, 'mm…' for managed ones (no FK on purpose).
CREATE TABLE memberships (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','active','rejected','suspended')),
  roles TEXT NOT NULL DEFAULT '["member"]',   -- JSON array
  permissions TEXT NOT NULL DEFAULT '[]',     -- JSON array
  display_name TEXT, email TEXT, phone TEXT,
  birth_date INTEGER, height_cm INTEGER, photo_url TEXT,
  short_code TEXT,
  managed INTEGER NOT NULL DEFAULT 0 CHECK (managed IN (0,1)),
  created_by TEXT,
  guardian_id TEXT, guardian_name TEXT,
  guardian_status TEXT CHECK (guardian_status IN ('pending','approved','rejected')),
  guardian_consent_at INTEGER, guardian_consent_version TEXT,
  requested_at INTEGER NOT NULL, approved_at INTEGER,
  PRIMARY KEY (tenant_id, member_id)
);
CREATE UNIQUE INDEX memberships_short_code ON memberships(tenant_id, short_code) WHERE short_code IS NOT NULL;
CREATE INDEX memberships_member ON memberships(member_id);

CREATE TABLE member_notes (            -- trainer note
  tenant_id TEXT NOT NULL, member_id TEXT NOT NULL,
  text TEXT NOT NULL, updated_by TEXT NOT NULL, updated_by_name TEXT, updated_at INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, member_id)
);
CREATE TABLE member_admin_notes (      -- admin-only private note
  tenant_id TEXT NOT NULL, member_id TEXT NOT NULL,
  text TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, member_id)
);
CREATE TABLE member_addresses (
  tenant_id TEXT NOT NULL, member_id TEXT NOT NULL,
  address TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, member_id)
);

CREATE TABLE classes (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  data TEXT NOT NULL,                  -- JSON: name, trainer, capacity, ...
  starts_at INTEGER NOT NULL
);
CREATE INDEX classes_tenant_time ON classes(tenant_id, starts_at);
CREATE TABLE class_bookings (          -- was bookedUserIds[] / bookingCredits{}
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL, credit_id TEXT, created_at INTEGER NOT NULL,
  PRIMARY KEY (class_id, member_id)
);
CREATE TABLE class_cancellation_refunds (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, class_id TEXT NOT NULL, class_name TEXT,
  class_date INTEGER NOT NULL, member_id TEXT NOT NULL, credit_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('refunded','nothing-to-refund','credit-missing','credit-mismatch')),
  created_at INTEGER NOT NULL
);
CREATE TABLE checkins (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, member_id TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL
);
CREATE INDEX checkins_member ON checkins(tenant_id, member_id, created_at);

CREATE TABLE programs (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, member_id TEXT NOT NULL,
  data TEXT NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX programs_member ON programs(tenant_id, member_id);
CREATE TABLE program_templates (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE workout_logs (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, member_id TEXT NOT NULL,
  data TEXT NOT NULL, logged_at INTEGER NOT NULL
);
CREATE INDEX workout_logs_member ON workout_logs(tenant_id, member_id, logged_at);
CREATE TABLE measurements (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, member_id TEXT NOT NULL,
  data TEXT NOT NULL, measured_at INTEGER NOT NULL
);
CREATE INDEX measurements_member ON measurements(tenant_id, member_id, measured_at);

CREATE TABLE payments (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, member_id TEXT NOT NULL,
  amount INTEGER NOT NULL, status TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL
);
CREATE INDEX payments_tenant ON payments(tenant_id, created_at);

CREATE TABLE gym_packages (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, data TEXT NOT NULL,
  active_assignment_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE promotions (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE member_packages (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, member_id TEXT NOT NULL,
  package_id TEXT NOT NULL, final_price INTEGER NOT NULL,
  starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','frozen','expired','cancelled')),
  payment_id TEXT, data TEXT NOT NULL DEFAULT '{}', assigned_at INTEGER NOT NULL, assigned_by TEXT
);
CREATE INDEX member_packages_member ON member_packages(tenant_id, member_id);
CREATE TABLE member_credits (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, member_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('ptLesson','groupClass')),
  source TEXT NOT NULL CHECK (source IN ('purchase','entitlement')),
  source_package_id TEXT NOT NULL,
  total INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0 AND used <= total),
  starts_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','exhausted','expired'))
);
CREATE INDEX member_credits_member ON member_credits(tenant_id, member_id, status);
CREATE TABLE package_change_requests (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, member_id TEXT NOT NULL,
  data TEXT NOT NULL, effective_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','expired','cancelled')),
  applied_at INTEGER, created_by TEXT, created_at INTEGER NOT NULL, responded_at INTEGER
);
-- member_entitlements is a Firestore rules cache; here it is a view over member_packages.

CREATE TABLE pt_sessions (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, trainer_id TEXT NOT NULL, member_id TEXT NOT NULL,
  original_trainer_id TEXT, starts_at INTEGER NOT NULL, duration_minutes INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('scheduled','completed','cancelled')),
  credit_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX pt_sessions_trainer ON pt_sessions(tenant_id, trainer_id, starts_at);
CREATE INDEX pt_sessions_member ON pt_sessions(tenant_id, member_id, starts_at);
-- trainer_busy_slots is a query over pt_sessions without identity columns (no mirror table).
CREATE TABLE trainer_availability (
  tenant_id TEXT NOT NULL, trainer_id TEXT NOT NULL,
  weekly TEXT NOT NULL DEFAULT '{}', slot_minutes INTEGER NOT NULL DEFAULT 60,
  exceptions TEXT NOT NULL DEFAULT '[]', updated_at INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, trainer_id)
);
CREATE TABLE calendar_shares (
  tenant_id TEXT NOT NULL, owner_trainer_id TEXT NOT NULL, viewer_trainer_id TEXT NOT NULL,
  created_at INTEGER NOT NULL, PRIMARY KEY (tenant_id, owner_trainer_id, viewer_trainer_id)
);

CREATE TABLE push_tokens (
  token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id TEXT, updated_at INTEGER NOT NULL
);
CREATE TABLE announcements (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
  created_by TEXT NOT NULL, created_by_name TEXT, created_at INTEGER NOT NULL, expires_at INTEGER
);
CREATE TABLE renewal_requests (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, member_id TEXT NOT NULL, member_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','handled','withdrawn')),
  note TEXT, created_at INTEGER NOT NULL, handled_at INTEGER, handled_by TEXT
);
CREATE TABLE exercise_reports (
  id TEXT PRIMARY KEY, exercise_id TEXT NOT NULL, exercise_name TEXT, tenant_id TEXT NOT NULL,
  reported_by TEXT NOT NULL, reported_by_name TEXT,
  reason TEXT NOT NULL CHECK (reason IN ('pose','muscles','text','other')),
  note TEXT NOT NULL, created_at INTEGER NOT NULL
);
