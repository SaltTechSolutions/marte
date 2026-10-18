-- The 6-digit front-desk code used to be assigned by a Firestore trigger (assignMembershipShortCode).
-- Here the database does it, in the same transaction as the row: nothing can create a membership
-- without a code, and no route has to remember to. Five random candidates, first one unused in the gym
-- wins; if all five collide (900k space, effectively never) the code stays NULL, as it did in Firebase.
CREATE TRIGGER memberships_short_code_insert AFTER INSERT ON memberships
WHEN NEW.short_code IS NULL
BEGIN
  UPDATE memberships SET short_code = (
    SELECT c FROM (
      SELECT CAST(100000 + abs(random()) % 900000 AS TEXT) AS c
      UNION ALL SELECT CAST(100000 + abs(random()) % 900000 AS TEXT)
      UNION ALL SELECT CAST(100000 + abs(random()) % 900000 AS TEXT)
      UNION ALL SELECT CAST(100000 + abs(random()) % 900000 AS TEXT)
      UNION ALL SELECT CAST(100000 + abs(random()) % 900000 AS TEXT)
    ) WHERE c NOT IN (SELECT short_code FROM memberships WHERE tenant_id = NEW.tenant_id AND short_code IS NOT NULL)
    LIMIT 1)
  WHERE tenant_id = NEW.tenant_id AND member_id = NEW.member_id;
END;

-- A re-joined, previously scrubbed row (account/gym removal nulls the code) gets a fresh one.
CREATE TRIGGER memberships_short_code_update AFTER UPDATE OF status ON memberships
WHEN NEW.short_code IS NULL AND NEW.status IN ('pending','active')
BEGIN
  UPDATE memberships SET short_code = (
    SELECT c FROM (
      SELECT CAST(100000 + abs(random()) % 900000 AS TEXT) AS c
      UNION ALL SELECT CAST(100000 + abs(random()) % 900000 AS TEXT)
      UNION ALL SELECT CAST(100000 + abs(random()) % 900000 AS TEXT)
      UNION ALL SELECT CAST(100000 + abs(random()) % 900000 AS TEXT)
      UNION ALL SELECT CAST(100000 + abs(random()) % 900000 AS TEXT)
    ) WHERE c NOT IN (SELECT short_code FROM memberships WHERE tenant_id = NEW.tenant_id AND short_code IS NOT NULL)
    LIMIT 1)
  WHERE tenant_id = NEW.tenant_id AND member_id = NEW.member_id;
END;
