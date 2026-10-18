-- Transactional outbox: side effects (push, e-mail) are rows written in the SAME batch as the
-- state change, then delivered by a consumer. A crash can lose neither the change nor the intent.
CREATE TABLE outbox (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                 -- 'push' | 'email' | ...
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  dedupe_key TEXT UNIQUE,             -- same logical event twice = one delivery
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  last_error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX outbox_due ON outbox(status, next_attempt_at);
