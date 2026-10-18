import type { WatchErrorHandler } from '../firebase/watch';
import { CalendarShare } from '../types';
import { apiDelete, apiGet, apiPut } from './client';
import { live, localized, pid, refresh } from './classSupport';
import { selfInternalId, toAppId } from './membershipIdentity';
import { calendarShareId } from '../firebase/calendarShareRepo';

// Deterministic id: identical to Firestore's by construction (same code).
export { calendarShareId };

interface ShareDto {
  ownerTrainerId: string;
  ownerName: string | null;
  viewerTrainerId: string;
  viewerName: string | null;
  createdAt: number;
}

/**
 * A trainer grants a colleague access to their own calendar. The Worker takes the owner from the token (a trainer
 * can only ever share their OWN calendar), so `ownerTrainerId` / `ownerTrainerName` are not sent: the name is read
 * from the membership when the lists are read.
 */
export async function grantCalendarShare(params: {
  tenantId: string;
  ownerTrainerId: string;
  ownerTrainerName: string;
  viewerTrainerId: string;
}): Promise<void> {
  await localized(apiPut(`/tenants/${params.tenantId}/calendar-shares/${await pid(params.viewerTrainerId)}`));
  refresh(params.tenantId, 'shares', 'pt');
}

export async function revokeCalendarShare(tenantId: string, ownerTrainerId: string, viewerTrainerId: string): Promise<void> {
  await localized(apiDelete(`/tenants/${tenantId}/calendar-shares/${await pid(ownerTrainerId)}/${await pid(viewerTrainerId)}`));
  refresh(tenantId, 'shares', 'pt');
}

async function sharesAs(tenantId: string, as: 'owner' | 'viewer'): Promise<CalendarShare[]> {
  const rows = await apiGet<ShareDto[]>(`/tenants/${tenantId}/calendar-shares?as=${as}`);
  await selfInternalId();   // primes toAppId: my side of a share is my Firebase uid
  return rows.map((r) => {
    const owner = toAppId(r.ownerTrainerId);
    const viewer = toAppId(r.viewerTrainerId);
    return {
      id: calendarShareId(tenantId, owner, viewer),
      tenantId,
      ownerTrainerId: owner,
      ownerTrainerName: r.ownerName ?? '',
      viewerTrainerId: viewer,
      createdAt: new Date(r.createdAt),
    };
  });
}

/** Who I (a trainer) have granted access to — shown on my Profil screen. The Worker reads it for the caller. */
export function watchSharesIGranted(
  tenantId: string,
  ownerTrainerId: string,
  onChange: (shares: CalendarShare[]) => void,
  onError?: WatchErrorHandler,
) {
  return live(`t:${tenantId}:shares:owner:${ownerTrainerId}`, () => sharesAs(tenantId, 'owner'), onChange, onError, { intervalMs: 60_000 });
}

/** Colleagues who have granted ME access — populates the trainer picker on Takvim. */
export function watchSharesGrantedToMe(
  tenantId: string,
  viewerTrainerId: string,
  onChange: (shares: CalendarShare[]) => void,
  onError?: WatchErrorHandler,
) {
  return live(`t:${tenantId}:shares:viewer:${viewerTrainerId}`, () => sharesAs(tenantId, 'viewer'), onChange, onError, { intervalMs: 60_000 });
}
