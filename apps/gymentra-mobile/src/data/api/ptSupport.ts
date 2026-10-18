import { PtSession } from '../types';
import { apiGet } from './client';
import { getRoster, isStaffIn, mapLimit, pid, rememberTenant, trackedMap } from './classSupport';
import { selfInternalId, toAppId } from './membershipIdentity';

/** What the Worker's pt-sessions reads return (`ptDto` in api/src/reads2.ts). Times are unix ms. */
export interface PtDto {
  id: string;
  trainerId: string;
  memberId: string;
  originalTrainerId: string | null;
  startsAt: number;
  durationMinutes: number;
  status: 'scheduled' | 'completed' | 'cancelled';
  creditId: string | null;
  cancellationDeadlineAt: number | null;
  cancelledAt: number | null;
  cancelledBy: string | null;
  cancelledByRole: string | null;
  refundOutcome: string | null;
}

/** `memberId` / `trainerId` are as the screen holds them (my Firebase uid, or an internal id). */
export const fetchMemberSessions = async (tenantId: string, memberId: string) =>
  apiGet<PtDto[]>(`/tenants/${tenantId}/members/${await pid(memberId)}/pt-sessions?limit=200`);

export const fetchTrainerSessions = async (tenantId: string, trainerId: string, from: number) =>
  apiGet<PtDto[]>(`/tenants/${tenantId}/trainers/${await pid(trainerId)}/pt-sessions?from=${from}&limit=200`);

// ---- display names (keyed by INTERNAL id) ------------------------------------------------------------------------------------------
// Firestore sessions carried `trainerName` / `memberName` (denormalised at write time). The Worker's DTO has
// ids only, so the names are looked up: staff read the roster once (cached); anyone else reads the single
// membership rows they are allowed to see (own row, trainer rows, a child's row for a guardian).

const NAME_TTL_MS = 5 * 60_000;
const MISS_TTL_MS = 60_000;
const names = trackedMap<string, { name: string; at: number }>();
const display = (m: { displayName?: string | null; email?: string | null }) => m.displayName || m.email || '';

export async function namesFor(tenantId: string, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const missing: string[] = [];
  const now = Date.now();
  for (const id of new Set(ids.filter(Boolean))) {
    const hit = names.get(`${tenantId}:${id}`);
    if (hit && now - hit.at < (hit.name ? NAME_TTL_MS : MISS_TTL_MS)) out.set(id, hit.name);
    else missing.push(id);
  }
  if (missing.length === 0) return out;

  const found = new Map<string, string>();
  if (await isStaffIn(tenantId)) {
    for (const r of await getRoster(tenantId)) found.set(r.memberId, display(r));
  } else {
    await mapLimit(missing, 4, async (id) => {
      try {
        found.set(id, display(await apiGet<{ displayName?: string | null; email?: string | null }>(`/tenants/${tenantId}/members/${encodeURIComponent(id)}`)));
      } catch {
        found.set(id, '');   // not visible to this caller (or gone): an empty name, retried after a minute
      }
    });
  }
  for (const id of missing) {
    const name = found.get(id) ?? '';
    names.set(`${tenantId}:${id}`, { name, at: now });
    out.set(id, name);
  }
  return out;
}

const EPOCH = new Date(0);

export function toPtSession(tenantId: string, d: PtDto, who: Map<string, string>): PtSession {
  const role = d.cancelledByRole;
  return {
    id: d.id,
    tenantId,
    trainerId: toAppId(d.trainerId),
    ...(d.originalTrainerId ? { originalTrainerId: toAppId(d.originalTrainerId) } : {}),
    trainerName: who.get(d.trainerId) ?? '',
    memberId: toAppId(d.memberId),
    memberName: who.get(d.memberId) ?? '',
    date: new Date(d.startsAt),
    durationMinutes: d.durationMinutes,
    status: d.status,
    ...(d.creditId ? { creditId: d.creditId } : {}),
    ...(d.cancellationDeadlineAt != null ? { cancellationDeadlineAt: new Date(d.cancellationDeadlineAt) } : {}),
    ...(d.cancelledAt != null ? { cancelledAt: new Date(d.cancelledAt) } : {}),
    // 'system' (account deletion, package undo) has no person behind it: the app's type has no such role.
    ...(role === 'member' || role === 'guardian' || role === 'trainer' || role === 'admin' ? { cancelledByRole: role } : {}),
    ...(d.status === 'cancelled' ? { creditRefunded: d.refundOutcome === 'refunded' } : {}),
    // GAP(api): the DTO has no created_at / updated_at. No screen reads them for a PT session; the epoch makes
    // that visible instead of passing off "now" as a real time.
    createdAt: EPOCH,
    updatedAt: EPOCH,
  };
}

/** DTOs -> app sessions (names resolved, owning gym remembered for the id-only writes). */
export async function toPtSessions(tenantId: string, dtos: PtDto[]): Promise<PtSession[]> {
  await selfInternalId();   // primes the id translation used by toAppId
  rememberTenant('pt', dtos, tenantId);
  const who = await namesFor(tenantId, dtos.flatMap((d) => [d.trainerId, d.memberId]));
  return dtos.map((d) => toPtSession(tenantId, d, who));
}
