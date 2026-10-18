-- Group classes beyond the unlimited-entitlement path (F3): waitlist and register.
-- Enums are CHECK constraints (changing one later is a table rebuild), so the sets are complete:
-- the register is three-state in the app (present / absent / not marked); "not marked" is the absence of a row.

-- Was classes.waitlistUserIds[]. Order is first come first served (created_at, then insertion order).
-- It spends nothing: a credit is only taken when a place is actually given (booking or promotion).
CREATE TABLE class_waitlist (
  tenant_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (class_id, member_id),
  FOREIGN KEY (tenant_id, class_id) REFERENCES classes(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, member_id) REFERENCES memberships(tenant_id, member_id) ON DELETE CASCADE
);
CREATE INDEX class_waitlist_order ON class_waitlist(class_id, created_at);
CREATE INDEX class_waitlist_member ON class_waitlist(tenant_id, member_id);

-- Was classes.attendance{memberId: 'present'|'absent'}. A mark can only exist for a booked member:
-- the composite FK makes that a database invariant, and cancelling a booking (or the class) drops the mark.
CREATE TABLE class_attendance (
  tenant_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  mark TEXT NOT NULL CHECK (mark IN ('present','absent')),
  marked_by TEXT NOT NULL,
  marked_at INTEGER NOT NULL,
  PRIMARY KEY (class_id, member_id),
  FOREIGN KEY (class_id, member_id) REFERENCES class_bookings(class_id, member_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, class_id) REFERENCES classes(tenant_id, id) ON DELETE CASCADE
);
