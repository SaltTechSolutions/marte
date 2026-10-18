import { TenantMembership } from '../types';
import { ApiError, apiGet } from './client';
import { birthDateFromMs, toAppId } from './membershipIdentity';

/** `${tenantId}_${personId}`, the Firestore doc id the app still addresses memberships by. */
export function membershipId(tenantId: string, userId: string) {
  return `${tenantId}_${userId}`;
}

/** The union of what `GET /members/:id` (full row) and `GET /members` (roster row) return. */
export interface MemberDto {
  memberId: string;
  status: TenantMembership['status'];
  roles: TenantMembership['roles'];
  permissions?: TenantMembership['permissions'];
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
  birthDate?: number | null;
  heightCm?: number | null;
  avatarId?: string | null;
  shortCode?: string | null;
  managed?: boolean;
  guardianId?: string | null;
  guardianName?: string | null;
  guardianStatus?: TenantMembership['guardianStatus'] | null;
  guardianConsentAt?: number | null;
  guardianConsentVersion?: string | null;
  requestedAt?: number;
  approvedAt?: number | null;
  leftAt?: number | null;
  createdBy?: string | null;
}

export interface TenantLabel { code: string; name: string }

const labels = new Map<string, TenantLabel>();

/** Memberships carry the gym's code and name (denormalised in Firestore); D1 keeps them on the gym only. */
export async function tenantLabel(tenantId: string): Promise<TenantLabel> {
  const hit = labels.get(tenantId);
  if (hit) return hit;
  try {
    const t = await apiGet<{ code: string; name: string }>(`/tenants/${tenantId}/settings`);
    const label = { code: t.code, name: t.name };
    labels.set(tenantId, label);
    return label;
  } catch (e) {
    // A person the gym does not (or no longer) lets read it has no use for the label; anything else is real.
    if (e instanceof ApiError && (e.status === 403 || e.status === 404)) return { code: '', name: '' };
    throw e;
  }
}

export function forgetLabels(): void {
  labels.clear();
}

const date = (ms: number | null | undefined) => (ms === null || ms === undefined ? undefined : new Date(ms));
const str = (v: string | null | undefined) => (v === null || v === undefined ? undefined : v);

/**
 * GAP(api): the Worker's membership DTOs do not carry `leftAt`, `createdBy`, `guardianConsentVersion` (and the
 * roster DTO lacks more, see `hydrate`). None of the three is read by a screen; they stay undefined.
 * `guardianConsentAt` IS in Firestore but not in the DTO yet either: the guardian-requests screen then simply
 * omits the "onayın <date>" suffix.
 */
export function mapMembership(tenantId: string, dto: MemberDto, label: TenantLabel): TenantMembership {
  if (dto.requestedAt === undefined || dto.permissions === undefined) {
    throw new Error('GAP(api): membership DTO without requestedAt/permissions reached the mapper unhydrated');
  }
  const userId = toAppId(dto.memberId);
  return {
    id: membershipId(tenantId, userId),
    userId,
    tenantId,
    tenantCode: label.code,
    tenantName: label.name,
    status: dto.status,
    roles: dto.roles ?? [],
    permissions: dto.permissions,
    requestedAt: new Date(dto.requestedAt),
    approvedAt: date(dto.approvedAt),
    leftAt: date(dto.leftAt),
    userDisplayName: str(dto.displayName),
    userEmail: str(dto.email),
    shortCode: str(dto.shortCode),
    phone: str(dto.phone),
    birthDate: birthDateFromMs(dto.birthDate),
    heightCm: dto.heightCm ?? undefined,
    managed: dto.managed === true ? true : undefined,
    createdBy: toAppId(dto.createdBy),
    avatarId: str(dto.avatarId),
    guardianId: toAppId(dto.guardianId),
    guardianName: str(dto.guardianName),
    guardianStatus: dto.guardianStatus ?? undefined,
    guardianConsentAt: date(dto.guardianConsentAt),
    guardianConsentVersion: str(dto.guardianConsentVersion),
  };
}

export async function fetchMemberDto(tenantId: string, memberId: string): Promise<MemberDto | null> {
  try {
    return await apiGet<MemberDto>(`/tenants/${tenantId}/members/${memberId}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

// -------------------------------------------------------------------------------------------------
// Roster hydration.
//
// GAP(api): `GET /tenants/:t/members` (staff) returns a slim row: no `permissions`, `requestedAt`,
// `approvedAt`, `heightCm`, `guardian*`. Screens need `permissions` (Ekip: delegated check-in),
// `requestedAt` (pending requests list), `approvedAt`/`requestedAt` (join date in reports and the
// trainer's recent members). Until the roster DTO carries them, the missing part is read per row from
// `GET /tenants/:t/members/:id` (6 at a time, kept 5 minutes, dropped on every write made through this
// module). Once the roster DTO includes `requestedAt` and `permissions` this path is skipped by itself.
// -------------------------------------------------------------------------------------------------
const DETAIL_TTL_MS = 5 * 60_000;
const CONCURRENCY = 6;
const details = new Map<string, { at: number; dto: MemberDto }>();

export function dropDetails(tenantId: string): void {
  for (const k of details.keys()) if (k.startsWith(`${tenantId}/`)) details.delete(k);
}

export function forgetDetails(): void {
  details.clear();
}

export async function hydrate(tenantId: string, rows: MemberDto[]): Promise<MemberDto[]> {
  const out = rows.slice();
  const todo = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.requestedAt === undefined || r.permissions === undefined);
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const { r, i } = todo[next++];
      const key = `${tenantId}/${r.memberId}`;
      let hit = details.get(key);
      if (!hit || Date.now() - hit.at > DETAIL_TTL_MS) {
        const dto = await fetchMemberDto(tenantId, r.memberId);
        if (!dto) continue;                                  // vanished between the two reads: keep the slim row, it is dropped below
        hit = { at: Date.now(), dto };
        details.set(key, hit);
      }
      // The roster row is the fresher source for the live fields; the detail fills what the roster lacks.
      out[i] = { ...hit.dto, status: r.status, roles: r.roles, displayName: r.displayName, email: r.email,
        phone: r.phone, birthDate: r.birthDate, avatarId: r.avatarId, managed: r.managed, shortCode: r.shortCode };
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
  // A row whose detail 404'd was deleted meanwhile: it is not a member any more.
  return out.filter((r) => r.requestedAt !== undefined && r.permissions !== undefined);
}
