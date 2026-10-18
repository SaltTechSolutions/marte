import type { WatchErrorHandler } from '../firebase/watch';
import { CalendarShare } from '../types';
import { apiDelete, apiPut } from './client';
import { localized, pid, refresh, unavailableWatch } from './classSupport';

// Deterministic id: identical to Firestore's by construction (same code).
export { calendarShareId } from '../firebase/calendarShareRepo';

/**
 * A trainer grants a colleague access to their own calendar. The Worker takes the owner from the token (a trainer
 * can only ever share their OWN calendar), so `ownerTrainerId` / `ownerTrainerName` are not sent: the name is not
 * stored (it is read from the membership when needed).
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

/**
 * Who I (a trainer) have granted access to — shown on my Profil screen.
 *
 * GAP(api): the Worker can write calendar shares (PUT/DELETE `/tenants/:t/calendar-shares/...`) but has NO route that
 * lists them (`calendar_shares` is only read inside the pt-sessions authorisation). Needed:
 * `GET /tenants/:t/calendar-shares?as=owner` -> `[{ ownerTrainerId, viewerTrainerId, createdAt }]` for the caller.
 * Until then the screen gets its error callback, never an empty list.
 */
export function watchSharesIGranted(
  _tenantId: string,
  _ownerTrainerId: string,
  _onChange: (shares: CalendarShare[]) => void,
  onError?: WatchErrorHandler,
) {
  return unavailableWatch('GET /tenants/:t/calendar-shares?as=owner does not exist (calendar shares granted by me)', onError);
}

/**
 * Colleagues who have granted ME access — populates the trainer picker on Takvim.
 *
 * GAP(api): same missing list route, `?as=viewer`; each row also needs the owner's display name
 * (`ownerTrainerName`), which can come from the membership read once the ids are known.
 */
export function watchSharesGrantedToMe(
  _tenantId: string,
  _viewerTrainerId: string,
  _onChange: (shares: CalendarShare[]) => void,
  onError?: WatchErrorHandler,
) {
  return unavailableWatch('GET /tenants/:t/calendar-shares?as=viewer does not exist (calendars shared with me)', onError);
}
