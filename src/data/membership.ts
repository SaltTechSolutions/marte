import { MembershipPermission, MembershipRole, TenantMembership } from './types';

/**
 * Every "can this person do X?" question in the app answers here.
 *
 * Screens must not compare roles directly (`role === 'admin'`): a gym owner
 * who also coaches holds two roles, and a trainer can be delegated a single
 * admin capability without becoming an admin. Raw comparisons can't express
 * either case and drift apart over time — that's how `trainer/index` ended up
 * locking admins out of a tab that `trainer/calendar` let them into.
 */

type Maybe = TenantMembership | null | undefined;

function isActive(m: Maybe): m is TenantMembership {
  return !!m && m.status === 'active';
}

export function hasRole(m: Maybe, role: MembershipRole): boolean {
  return isActive(m) && m.roles.includes(role);
}

export function hasPermission(m: Maybe, permission: MembershipPermission): boolean {
  return isActive(m) && m.permissions.includes(permission);
}

/** Approvals, payment ledger, branding, class schedule — the owner's surface. */
export function canManageGym(m: Maybe): boolean {
  return hasRole(m, 'admin');
}

/**
 * Front-desk QR scanning. Admins always can; a trainer can be granted it so
 * someone covers the door when the owner isn't in — which is the norm in a
 * small studio.
 */
export function canCheckIn(m: Maybe): boolean {
  return hasRole(m, 'admin') || hasPermission(m, 'checkin');
}

/** Own PT calendar, own member roster, program authoring. */
export function canCoach(m: Maybe): boolean {
  return hasRole(m, 'trainer');
}

/**
 * Read and reassign EVERY trainer's calendar. Deliberately separate from
 * canCoach: this is oversight (covering for an absent trainer), not coaching,
 * and it must not hand an owner a PT calendar they never asked for.
 */
export function canOverseeCalendars(m: Maybe): boolean {
  return hasRole(m, 'admin');
}

/** Anyone who works here, as opposed to a paying member. */
export function isStaff(m: Maybe): boolean {
  return canCoach(m) || canManageGym(m);
}

/** Which home screen this person lands on, most privileged first. */
export function primaryRole(m: Maybe): MembershipRole | null {
  if (!isActive(m)) return null;
  if (m.roles.includes('admin')) return 'admin';
  if (m.roles.includes('trainer')) return 'trainer';
  if (m.roles.includes('member')) return 'member';
  return null;
}

export const ROLE_HOME: Record<MembershipRole, string> = {
  admin: '/admin',
  trainer: '/trainer',
  member: '/member',
};

export const ROLE_LABEL: Record<MembershipRole, string> = {
  admin: 'Yönetici',
  trainer: 'Antrenör',
  member: 'Üye',
};

/** The gym this membership belongs to, but only when the capability holds —
 * screens use this to guard in one line instead of repeating role checks. */
export function tenantIdIf(m: Maybe, allowed: boolean): string | null {
  return allowed && m ? m.tenantId : null;
}
