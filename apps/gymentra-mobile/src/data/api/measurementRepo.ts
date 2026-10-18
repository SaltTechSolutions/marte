import type { WatchErrorHandler } from '../firebase/watch';
import type { MeasurementEntry } from '../types';
import { apiGet, apiPost } from './client';
import { Dto, measurementFromDto } from './programMap';
import { selfInternalId } from './membershipIdentity';
import { internalId, touch, watchPoll } from './programShared';

/**
 * Cloudflare Worker version of data/firebase/measurementRepo.ts: same exports, same signatures.
 *
 * Append-only, like the Firestore rules: the Worker has POST and GET only. A new row is filed under the
 * CALLER (a `memberId` in the body is ignored), with the server clock as `recordedAt`, and a weight outside
 * 0..500 kg is refused (400).
 */
const enc = encodeURIComponent;
const AREA = 'measurements';

export async function addMeasurement(params: {
  tenantId: string;
  memberId: string;
  weightKg: number;
  chestCm?: number;
  waistCm?: number;
  armCm?: number;
}): Promise<void> {
  await apiPost(`/tenants/${enc(params.tenantId)}/measurements`, {
    weightKg: params.weightKg,
    ...(params.chestCm != null ? { chestCm: params.chestCm } : {}),
    ...(params.waistCm != null ? { waistCm: params.waistCm } : {}),
    ...(params.armCm != null ? { armCm: params.armCm } : {}),
  });
  touch(params.tenantId, AREA);
}

/** Newest-first history — Gelişim screen reads [0] as "current", the rest for the trend chart. */
export function watchMeasurements(
  tenantId: string,
  memberId: string,
  onChange: (entries: MeasurementEntry[]) => void,
  onError?: WatchErrorHandler,
) {
  return watchPoll(
    'Ölçümler',
    `t:${tenantId}:${AREA}:member:${memberId}`,
    async () => {
      const id = await internalId(memberId);
      await selfInternalId();   // primes the id cache that toAppId reads
      const rows = await apiGet<Dto[]>(`/tenants/${enc(tenantId)}/members/${enc(id)}/measurements?limit=100`);
      return rows.map((d) => measurementFromDto(d, tenantId, id));
    },
    onChange,
    onError,
  );
}
