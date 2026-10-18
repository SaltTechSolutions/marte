-- Package lifecycle (F3): freeze, cancel, change requests, scheduled sweeps.
-- Enum CHECKs on member_packages / member_credits / package_change_requests are already complete
-- in 0001/0002 (active|frozen|expired|cancelled, ..., pending|approved|rejected|expired|cancelled),
-- so nothing here rebuilds a table.

-- When the latest freeze ends. Lets the daily sweep find frozen packages without scanning JSON.
-- NULL on every non-frozen row. (Rows imported from Firestore must set it from freezes[last].endsAt;
-- the sweep also falls back to the JSON for a frozen row that has no value.)
ALTER TABLE member_packages ADD COLUMN frozen_until INTEGER;
CREATE INDEX member_packages_frozen ON member_packages(status, frozen_until);

-- expirePendingPackageChangeRequests: pending offers past their deadline.
CREATE INDEX package_change_requests_due ON package_change_requests(status, expires_at);
-- A member's own pending offers (the card on Bugun/Hesabim).
CREATE INDEX package_change_requests_member ON package_change_requests(tenant_id, member_id, status);
