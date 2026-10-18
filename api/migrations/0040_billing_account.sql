-- F3 slice: tenants / guardians / account lifecycle / billing.
-- ALTER ... ADD COLUMN keeps CHECKs, so the enums below are complete on purpose
-- (changing one later is a table rebuild).

-- RevenueCat webhook state. `subscription_status` already exists (0001) and stays free text:
-- the webhook only ever writes 'active' | 'expired' | 'cancelled'.
-- `subscription_event_at` is the ordering watermark: an event older than it never overwrites a newer state.
ALTER TABLE tenants ADD COLUMN subscription_plan TEXT CHECK (subscription_plan IN ('monthly','yearly','grandfathered'));
ALTER TABLE tenants ADD COLUMN subscription_platform TEXT CHECK (subscription_platform IN ('ios','android'));
ALTER TABLE tenants ADD COLUMN subscription_expires_at INTEGER;
ALTER TABLE tenants ADD COLUMN subscription_event_at INTEGER;
ALTER TABLE tenants ADD COLUMN subscription_event_id TEXT;

-- Every webhook delivery, applied or not: idempotency key + audit trail.
CREATE TABLE billing_events (
  event_id TEXT PRIMARY KEY,           -- RevenueCat event id (fallback: type:timestamp:app_user_id)
  tenant_id TEXT NOT NULL,
  type TEXT NOT NULL,
  event_at INTEGER NOT NULL,           -- RevenueCat event_timestamp_ms
  applied INTEGER NOT NULL DEFAULT 0 CHECK (applied IN (0,1)),
  received_at INTEGER NOT NULL
);
CREATE INDEX billing_events_tenant ON billing_events(tenant_id, event_at);

-- Batch tripwire. D1 `batch()` is atomic, but a conditional statement that matches 0 rows is not an error,
-- so an invariant that must stop the WHOLE batch (last admin, all-or-nothing multi-child payment) inserts
-- a 0 here when it is violated: the CHECK fails, the batch throws and rolls back. Never holds a row.
CREATE TABLE txn_abort_guard (ok INTEGER NOT NULL CHECK (ok = 1));
