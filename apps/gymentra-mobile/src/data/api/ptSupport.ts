import { PtSession } from '../types';
import { apiGet } from './client';
import { pid, rememberTenant } from './classSupport';
import { selfInternalId, toAppId } from './membershipIdentity';

/** What the Worker's pt-sessions reads return (`ptDto` in api/src/reads2.ts). Times are unix ms. */
export interface PtDto {
  id: string;
  trainerId: string;
  trainerName: string | null;
  memberId: string;
  memberName: string | null;
  originalTrainerId: string | null;
  startsAt: number;
  durationMinutes: number;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no-show';
  creditId: string | null;
  cancellationDeadlineAt: number | null;
  cancelledAt: number | null;
  cancelledBy: string | null;
  cancelledByRole: string | null;
  refundOutcome: string | null;
  createdAt: number;
  updatedAt: number;
}

const qs = (r: { from?: number; to?: number; limit?: number }) =>
  `?${[r.from !== undefined && `from=${r.from}`, r.to !== undefined && `to=${r.to}`, `limit=${r.limit ?? 200}`].filter(Boolean).join('&')}`;

/** `memberId` / `trainerId`: as the screen holds them (my Firebase uid, or an internal id). `from` inclusive, `to` exclusive. */
export const fetchMemberSessions = async (tenantId: string, memberId: string, r: { from?: number; to?: number } = {}) =>
  apiGet<PtDto[]>(`/tenants/${tenantId}/members/${await pid(memberId)}/pt-sessions${qs(r)}`);

export const fetchTrainerSessions = async (tenantId: string, trainerId: string, r: { from?: number; to?: number }) =>
  apiGet<PtDto[]>(`/tenants/${tenantId}/trainers/${await pid(trainerId)}/pt-sessions${qs(r)}`);

/** Admin: every session of the gym in the window. */
export const fetchTenantSessions = async (tenantId: string, r: { from?: number; to?: number }) =>
  apiGet<PtDto[]>(`/tenants/${tenantId}/pt-sessions${qs({ ...r, limit: 1000 })}`);

export function toPtSession(tenantId: string, d: PtDto): PtSession {
  const role = d.cancelledByRole;
  return {
    id: d.id,
    tenantId,
    trainerId: toAppId(d.trainerId),
    ...(d.originalTrainerId ? { originalTrainerId: toAppId(d.originalTrainerId) } : {}),
    trainerName: d.trainerName ?? '',
    memberId: toAppId(d.memberId),
    memberName: d.memberName ?? '',
    date: new Date(d.startsAt),
    durationMinutes: d.durationMinutes,
    status: d.status,
    ...(d.creditId ? { creditId: d.creditId } : {}),
    ...(d.cancellationDeadlineAt != null ? { cancellationDeadlineAt: new Date(d.cancellationDeadlineAt) } : {}),
    ...(d.cancelledAt != null ? { cancelledAt: new Date(d.cancelledAt) } : {}),
    // 'system' (account deletion, package undo) has no person behind it: the app's type has no such role.
    ...(role === 'member' || role === 'guardian' || role === 'trainer' || role === 'admin' ? { cancelledByRole: role } : {}),
    ...(d.status === 'cancelled' ? { creditRefunded: d.refundOutcome === 'refunded' } : {}),
    createdAt: new Date(d.createdAt),
    updatedAt: new Date(d.updatedAt),
  };
}

/** DTOs -> app sessions (person ids translated, owning gym remembered for the id-only writes). */
export async function toPtSessions(tenantId: string, dtos: PtDto[]): Promise<PtSession[]> {
  await selfInternalId();   // primes the id translation used by toAppId
  rememberTenant('pt', dtos, tenantId);
  return dtos.map((d) => toPtSession(tenantId, d));
}
