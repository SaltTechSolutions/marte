import { Tenant } from './types';

/**
 * Free tier: a gym may hold this many active members before it needs a
 * subscription. Must stay in step with `withinMemberLimit` in
 * `marte06/firestore.rules` — the rule is the real gate, this is UX.
 */
export const FREE_MEMBER_LIMIT = 10;

/**
 * Whether the gym may activate one more member.
 *
 * Deliberately mirrors the rule exactly:
 *
 *   activeMemberCount < FREE_MEMBER_LIMIT || subscription.status == 'active'
 *
 * The screen used to check only the count, so a gym with a real subscription
 * was still bounced to the paywall — the server would have allowed the write,
 * but the client never attempted it. The pilot gym (51 members, a
 * `grandfathered` subscription) could not approve anyone because of this.
 *
 * Expiry is intentionally NOT re-derived from `expiresAt` here: the rule keys
 * off `status` alone, and a client that disagreed with the rule is precisely
 * the failure this function exists to prevent. Whatever moves a subscription
 * to `expired` must write `status`.
 */
export function canActivateAnotherMember(tenant: Tenant | null | undefined, activeCount: number): boolean {
  if (tenant?.subscription?.status === 'active') return true;
  return activeCount < FREE_MEMBER_LIMIT;
}

/**
 * How many people may hold the `admin` role in one gym. Mirrors
 * `withinAdminLimit` in `marte06/firestore.rules` — the rule is the gate,
 * this is what lets the screen say "3/3" before the write is refused.
 */
export const ADMIN_SEAT_LIMIT = 3;

/**
 * Whether one more admin may be granted. A tenant with no counter yet reads
 * as under the limit, exactly as the rule does — an old gym that predates
 * the counter must not be locked out of promoting anyone.
 */
export function canAddAdmin(tenant: Tenant | null | undefined): boolean {
  return (tenant?.activeAdminCount ?? 0) < ADMIN_SEAT_LIMIT;
}
