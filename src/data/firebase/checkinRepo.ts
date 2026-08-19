import { addDoc, collection, getDocs, query, serverTimestamp, Timestamp, where } from 'firebase/firestore';

import { db } from '@/services/firebase';

import { TenantMembership } from '../types';
import { membershipFromDoc } from './convert';
import { getMembershipById } from './membershipRepo';
import { WatchErrorHandler, watchQuery } from './watch';

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Live count of today's check-ins for a tenant — powers the admin dashboard's "live" stat. */
export function watchTodayCheckinCount(
  tenantId: string,
  onChange: (count: number) => void,
  onError?: WatchErrorHandler,
) {
  const q = query(
    collection(db, 'checkins'),
    where('tenantId', '==', tenantId),
    where('checkedInAt', '>=', Timestamp.fromDate(startOfToday())),
  );
  return watchQuery('Bugünkü giriş sayısı', q, (snap) => snap.size, onChange, onError);
}

/**
 * A member re-scanned inside this window is treated as the same visit.
 * Long enough to swallow an accidental double-scan or a quick step outside,
 * short enough that a genuine second visit (morning and evening) still
 * counts.
 */
const DUPLICATE_WINDOW_MINUTES = 60;

/**
 * Shared write path for both check-in routes. Refuses a second record for a
 * member who was already admitted recently — otherwise a double-scan
 * silently inflates the day's counter and the gym's attendance numbers.
 */
async function recordCheckIn(
  tenantId: string,
  membership: TenantMembership,
  membershipDocId: string,
): Promise<{ ok: true; name: string } | { ok: false; reason: 'already-checked-in' }> {
  const name = membership.userDisplayName || membership.userEmail || membership.userId;

  const cutoff = new Date(Date.now() - DUPLICATE_WINDOW_MINUTES * 60 * 1000);
  const recent = await getDocs(
    query(
      collection(db, 'checkins'),
      where('tenantId', '==', tenantId),
      where('userId', '==', membership.userId),
      where('checkedInAt', '>=', Timestamp.fromDate(cutoff)),
    ),
  );
  if (!recent.empty) return { ok: false, reason: 'already-checked-in' };

  await addDoc(collection(db, 'checkins'), {
    tenantId,
    userId: membership.userId,
    membershipId: membershipDocId,
    checkedInAt: serverTimestamp(),
  });

  return { ok: true, name };
}

/**
 * Records a front-desk scan. The scanned QR payload is the member's
 * tenant_membership doc id (`${tenantId}_${uid}`) — we look it up first so
 * the scanner can reject a code from the wrong gym or an inactive member
 * before writing anything.
 */
export async function checkInByMembershipId(tenantId: string, membershipId: string): Promise<
  | { ok: true; name: string }
  | { ok: false; reason: 'not-found' | 'wrong-tenant' | 'inactive' | 'already-checked-in' }
> {
  const membership = await getMembershipById(membershipId);
  if (!membership) return { ok: false, reason: 'not-found' };
  if (membership.tenantId !== tenantId) return { ok: false, reason: 'wrong-tenant' };
  if (membership.status !== 'active') return { ok: false, reason: 'inactive' };

  return recordCheckIn(tenantId, membership, membershipId);
}

/**
 * Manual-entry check-in path: staff types the member's short 6-digit code
 * instead of the full membership id (which is a `${tenantId}_${uid}` string
 * — fine for a QR payload, unusable for a human to type). The query is
 * scoped to the current tenant, so a code from another gym naturally comes
 * back as "not-found" rather than leaking that it belongs elsewhere.
 */
export async function checkInByShortCode(tenantId: string, shortCode: string): Promise<
  | { ok: true; name: string }
  | { ok: false; reason: 'not-found' | 'inactive' | 'already-checked-in' }
> {
  const snap = await getDocs(
    query(collection(db, 'tenant_memberships'), where('tenantId', '==', tenantId), where('shortCode', '==', shortCode)),
  );
  if (snap.empty) return { ok: false, reason: 'not-found' };
  const membership = membershipFromDoc(snap.docs[0]);
  if (membership.status !== 'active') return { ok: false, reason: 'inactive' };

  return recordCheckIn(tenantId, membership, membership.id);
}

/**
 * A member's own visit history. The rules already allow this read
 * (`resource.data.userId == request.auth.uid`) but nothing surfaced it, so
 * "how often did I actually come this month?" had no answer in the app.
 *
 * Bounded to `since` so the listener doesn't grow with every visit ever.
 */
export function watchMyCheckins(
  tenantId: string,
  userId: string,
  since: Date,
  onChange: (dates: Date[]) => void,
  onError?: WatchErrorHandler,
) {
  const q = query(
    collection(db, 'checkins'),
    where('tenantId', '==', tenantId),
    where('userId', '==', userId),
    where('checkedInAt', '>=', Timestamp.fromDate(since)),
  );
  return watchQuery(
    'Giriş geçmişim',
    q,
    (snap) =>
      snap.docs
        .map((d) => (d.data().checkedInAt as Timestamp | null)?.toDate())
        .filter((d): d is Date => d != null)
        .sort((a, b) => b.getTime() - a.getTime()),
    onChange,
    onError,
  );
}

/** Today's check-ins for the whole gym — powers the admin's "who's in right
 * now" list. Same index as the counter above. */
export function watchTodayCheckins(
  tenantId: string,
  onChange: (entries: { id: string; userId: string; checkedInAt: Date }[]) => void,
  onError?: WatchErrorHandler,
) {
  const q = query(
    collection(db, 'checkins'),
    where('tenantId', '==', tenantId),
    where('checkedInAt', '>=', Timestamp.fromDate(startOfToday())),
  );
  return watchQuery(
    'Bugün girenler',
    q,
    (snap) =>
      snap.docs
        .map((d) => ({
          id: d.id,
          userId: d.data().userId as string,
          checkedInAt: (d.data().checkedInAt as Timestamp | null)?.toDate() ?? new Date(),
        }))
        .sort((a, b) => b.checkedInAt.getTime() - a.checkedInAt.getTime()),
    onChange,
    onError,
  );
}
