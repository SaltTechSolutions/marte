import { formatBirthDate } from '@/utils/birthDate';

import { MembershipPermission, MembershipRole, TenantMembership } from '../types';
import { sharedWatch } from '../firebase/sharedWatch';
import type { WatchErrorHandler } from '../firebase/watch';
import { ApiError, apiGet, apiPatch, apiPost, apiPut } from './client';
import {
  dropDetails,
  fetchMemberDto,
  hydrate,
  mapMembership,
  membershipId,
  MemberDto,
  tenantLabel,
} from './membershipDto';
import {
  birthDateToMs,
  ensureSelfInternalId,
  fetchMe,
  selfInternalId,
  splitDocId,
  toInternalId,
} from './membershipIdentity';
import { FAST_POLL, watchPoll } from './membershipWatch';
import { invalidate } from './poll';

export { membershipId };

/** After a write: every poller of the gym refreshes now, and the roster details are re-read. */
function changed(tenantId: string): void {
  dropDetails(tenantId);
  invalidate(`t:${tenantId}`);
}

async function fetchMembership(tenantId: string, userId: string): Promise<TenantMembership | null> {
  const memberId = await toInternalId(userId);
  await selfInternalId();                                   // primes the id translation the mapper uses
  const dto = await fetchMemberDto(tenantId, memberId);
  if (!dto) return null;
  return mapMembership(tenantId, dto, await tenantLabel(tenantId));
}

export function getMembership(tenantId: string, userId: string): Promise<TenantMembership | null> {
  return fetchMembership(tenantId, userId);
}

export function getMembershipById(id: string): Promise<TenantMembership | null> {
  const { tenantId, personId } = splitDocId(id);
  return fetchMembership(tenantId, personId);
}

/**
 * Live updates for one membership: the onboarding "pending approval" screen and AuthProvider's
 * role/suspension watcher. `null` means the server says the membership is gone (404), as with Firestore.
 * Polled a little faster than the default: a suspension should not take half a minute to bite.
 */
export function watchMembership(
  tenantId: string,
  userId: string,
  onChange: (membership: TenantMembership | null) => void,
  onError?: WatchErrorHandler,
) {
  return watchPoll(`t:${tenantId}:membership:${userId}`, () => fetchMembership(tenantId, userId), onChange, onError, FAST_POLL);
}

export async function requestJoin(params: {
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  userId: string;
  userDisplayName?: string | null;
  userEmail?: string | null;
}): Promise<void> {
  // A brand-new account has no internal user yet; the first join creates it (idempotent on the server).
  await ensureSelfInternalId({ displayName: params.userDisplayName, email: params.userEmail });
  // The Worker resets a former member (left/rejected) back to a plain pending member, and refuses (409) anyone
  // already pending or active: that refusal reaches the screen as the callable-style error.
  await apiPost(`/tenants/${params.tenantId}/join`);
  changed(params.tenantId);
}

/**
 * Kişinin aktif olduğu TÜM salonlar (P1-8), sıralı: önce katılım tarihi, sonra salon kimliği.
 * Always asks the server (`/me`): unreachable means a rejected promise, never an empty list that
 * AuthProvider would read as "no gym" and use to wipe the on-disk card (DEN-2).
 */
export async function getActiveMemberships(userId: string): Promise<TenantMembership[]> {
  const me = await fetchMe();
  if (!me.userId) return [];
  if ((await toInternalId(userId)) !== me.userId) throw new Error('getActiveMemberships: yalnızca oturumdaki kişi için çalışır');
  const rows = await Promise.all(
    me.memberships.filter((m) => m.status === 'active').map((m) => fetchMembership(m.tenantId, userId)),
  );
  return rows
    .filter((m): m is TenantMembership => m !== null)
    .sort((a, b) => {
      const at = a.approvedAt?.getTime() ?? a.requestedAt.getTime();
      const bt = b.approvedAt?.getTime() ?? b.requestedAt.getTime();
      return at - bt || a.tenantId.localeCompare(b.tenantId);
    });
}

/** Staff-only roster (`GET /tenants/:t/members`), narrowed and completed per list. See `hydrate` for the GAP. */
async function roster(tenantId: string, keep: (m: MemberDto) => boolean): Promise<TenantMembership[]> {
  await selfInternalId();                                   // primes the id translation the mapper uses
  const rows = (await apiGet<MemberDto[]>(`/tenants/${tenantId}/members`)).filter(keep);
  const [full, label] = await Promise.all([hydrate(tenantId, rows), tenantLabel(tenantId)]);
  return full.map((d) => mapMembership(tenantId, d, label));
}

const activeWith = (role: MembershipRole) => (m: MemberDto) => m.status === 'active' && m.roles.includes(role);

function watchRoster(
  area: string,
  tenantId: string,
  keep: (m: MemberDto) => boolean,
  onChange: (rows: TenantMembership[]) => void,
  onError?: WatchErrorHandler,
) {
  return sharedWatch<TenantMembership[]>(
    `t:${tenantId}:members:${area}`,
    (change, err) => watchPoll(`t:${tenantId}:members:${area}`, () => roster(tenantId, keep), change, err),
    onChange,
    onError,
  );
}

/** Live active members of a tenant — trainer client list. */
export function watchActiveMembers(tenantId: string, onChange: (members: TenantMembership[]) => void, onError?: WatchErrorHandler) {
  return watchRoster('active', tenantId, activeWith('member'), onChange, onError);
}

/** Live active trainers of a tenant — calendar-sharing picker on the trainer Profil screen. */
export function watchActiveTrainers(tenantId: string, onChange: (trainers: TenantMembership[]) => void, onError?: WatchErrorHandler) {
  return watchRoster('trainers', tenantId, activeWith('trainer'), onChange, onError);
}

/** Live active admins of a tenant — the Ekip screen's first section (someone holding only `admin` is in no other list). */
export function watchActiveAdmins(tenantId: string, onChange: (admins: TenantMembership[]) => void, onError?: WatchErrorHandler) {
  return watchRoster('admins', tenantId, activeWith('admin'), onChange, onError);
}

/** Live pending join requests for a tenant — admin approvals screen. */
export function watchPendingRequests(tenantId: string, onChange: (requests: TenantMembership[]) => void, onError?: WatchErrorHandler) {
  return watchPoll(`t:${tenantId}:members:pending`, () => roster(tenantId, (m) => m.status === 'pending'), onChange, onError);
}

async function setStatus(id: string, status: 'active' | 'rejected'): Promise<void> {
  const { tenantId, personId } = splitDocId(id);
  await apiPut(`/tenants/${tenantId}/members/${await toInternalId(personId)}/status`, { status });
  changed(tenantId);
}

export const approveMembership = (id: string): Promise<void> => setStatus(id, 'active');
export const rejectMembership = (id: string): Promise<void> => setStatus(id, 'rejected');

/**
 * How many paying members (role `member`, status active) the gym has. The Worker keeps exactly that tally
 * for the free-tier seat limit and tells admins in the gym settings; for anyone else (or an older Worker
 * that omits it) it is counted from the staff roster with the same filter, so the two never disagree.
 */
export async function countActiveMembers(tenantId: string): Promise<number> {
  const t = await apiGet<{ activeMemberCount?: number }>(`/tenants/${tenantId}/settings`);
  if (typeof t.activeMemberCount === 'number') return t.activeMemberCount;
  return (await apiGet<MemberDto[]>(`/tenants/${tenantId}/members`)).filter(activeWith('member')).length;
}

/**
 * GAP(api, minor): `PUT .../roles` takes roles AND permissions together (roles are required, permissions
 * default to none), while the app changes one at a time. The other half is read first and sent back, so a
 * concurrent edit of the same row from another device can be overwritten. A PATCH that accepts either
 * field alone would remove the race.
 */
async function putRoles(
  id: string,
  change: (current: MemberDto) => { roles: MembershipRole[]; permissions: MembershipPermission[] },
): Promise<void> {
  const { tenantId, personId } = splitDocId(id);
  const memberId = await toInternalId(personId);
  const current = await fetchMemberDto(tenantId, memberId);
  if (!current) throw new ApiError(404, 'Aradığın kayıt bulunamadı.');
  await apiPut(`/tenants/${tenantId}/members/${memberId}/roles`, change(current));
  changed(tenantId);
}

/** Grant or revoke a delegated capability (e.g. letting a trainer work the front desk). Admin-only. */
export function setMembershipPermissions(membershipDocId: string, permissions: MembershipPermission[]): Promise<void> {
  return putRoles(membershipDocId, (cur) => ({ roles: cur.roles, permissions }));
}

/** Assign roles. Delegated permissions are kept as they are. */
export function setMembershipRoles(membershipDocId: string, roles: MembershipRole[]): Promise<void> {
  return putRoles(membershipDocId, (cur) => ({ roles, permissions: cur.permissions ?? [] }));
}

/**
 * Corrects basic details. `undefined` fields are left alone; the Worker lets a member edit their own row
 * and an admin edit a hand-added (managed) member's, and refuses everything else with the callable-style error.
 *
 * GAP(api): `heightCm: null` (clear) is not accepted by `PATCH .../details` (height must be 100-250). When the
 * height is already unset, clearing it is a no-op and nothing is sent; when it is set, this throws instead of
 * silently keeping the old value. `photoUrl: null` is fine.
 */
export async function updateMemberDetails(
  membershipDocId: string,
  details: {
    userDisplayName?: string;
    userEmail?: string;
    phone?: string;
    birthDate?: Date | null;
    heightCm?: number | null;
    photoUrl?: string | null;
  },
): Promise<void> {
  const { tenantId, personId } = splitDocId(membershipDocId);
  const memberId = await toInternalId(personId);
  const patch: Record<string, unknown> = {};
  if (details.userDisplayName !== undefined) patch.displayName = details.userDisplayName.trim();
  if (details.userEmail !== undefined) patch.email = details.userEmail.trim();
  if (details.phone !== undefined) patch.phone = details.phone.trim();
  if (details.birthDate !== undefined && details.birthDate !== null) patch.birthDate = birthDateToMs(details.birthDate);
  if (details.photoUrl !== undefined) patch.photoUrl = details.photoUrl;
  if (typeof details.heightCm === 'number') patch.heightCm = details.heightCm;
  if (details.heightCm === null) {
    const current = await fetchMemberDto(tenantId, memberId);
    if (current?.heightCm !== null && current?.heightCm !== undefined) {
      throw new Error('GAP(api): PATCH /tenants/:t/members/:m/details cannot clear heightCm');
    }
  }
  if (Object.keys(patch).length === 0) return;
  await apiPatch(`/tenants/${tenantId}/members/${memberId}/details`, patch);
  changed(tenantId);
}

/**
 * An admin adds a member by hand — someone with no account who pays at the desk. `birthDate` travels as a
 * plain `YYYY-MM-DD`; the Worker refuses under-18s (412) and enforces the free-tier seat limit (429).
 */
export async function createManagedMember(params: {
  tenantId: string;
  name: string;
  phone?: string;
  email?: string;
  birthDate?: Date | null;
  address?: string;
}): Promise<{ memberId: string; membershipId: string }> {
  const res = await apiPost<{ memberId: string }>(`/tenants/${params.tenantId}/members/managed`, {
    name: params.name,
    ...(params.phone?.trim() ? { phone: params.phone.trim() } : {}),
    ...(params.email?.trim() ? { email: params.email.trim() } : {}),
    ...(params.address?.trim() ? { address: params.address.trim() } : {}),
    ...(params.birthDate ? { birthDate: formatBirthDate(params.birthDate) } : {}),
  });
  changed(params.tenantId);
  return { memberId: res.memberId, membershipId: membershipId(params.tenantId, res.memberId) };
}

/**
 * GAP(api): the Worker has no route that removes a member and their data from one gym (the Firebase callable
 * `removeMemberFromTenant`; docs/KARAR-DEFTERI lists it under "bilerek yapılmadı"). Needed: an admin-only
 * `DELETE /tenants/:t/members/:memberId` that cascades like `me/delete-account` does, scoped to one gym, and
 * answers `{ deleted: number }`. Until then this fails loudly instead of pretending.
 */
export async function removeMemberFromTenant(_tenantId: string, _memberId: string): Promise<{ deleted: number }> {
  throw new Error('GAP(api): no route to remove a member from a gym (needs DELETE /tenants/:t/members/:memberId)');
}

/** The member ends their own membership. The Worker refuses the gym's last admin (409). */
export async function leaveTenant(membershipDocId: string): Promise<void> {
  const { tenantId } = splitDocId(membershipDocId);
  await apiPost(`/tenants/${tenantId}/leave`);
  changed(tenantId);
}

/** A member nominates a parent by e-mail (MEMBER-5b). Returns the matched parent's name. */
export async function requestGuardian(tenantId: string, guardianEmail: string): Promise<string> {
  const res = await apiPost<{ guardianName: string }>(`/tenants/${tenantId}/guardian/request`, { guardianEmail });
  changed(tenantId);
  return res.guardianName;
}

/** The parent answers. Approving records the KVKK consent server-side. */
export async function respondToGuardian(tenantId: string, childId: string, approve: boolean): Promise<void> {
  await apiPost(`/tenants/${tenantId}/guardian/respond`, { childId: await toInternalId(childId), approve });
  changed(tenantId);
}

/** The children linked to this member — both the ones still asking and the ones already approved. */
export function watchMyChildren(
  tenantId: string,
  guardianId: string,
  onChange: (children: TenantMembership[]) => void,
  onError?: WatchErrorHandler,
) {
  const fetcher = async () => {
    const self = await selfInternalId();
    if (!self) return [];
    if ((await toInternalId(guardianId)) !== self) throw new Error('watchMyChildren: yalnızca oturumdaki kişi için çalışır');
    const links = (await apiGet<{ tenantId: string; memberId: string }[]>('/me/children')).filter((l) => l.tenantId === tenantId);
    const label = await tenantLabel(tenantId);
    const rows = await Promise.all(links.map((l) => fetchMemberDto(tenantId, l.memberId)));
    return rows.filter((d): d is MemberDto => d !== null).map((d) => mapMembership(tenantId, d, label));
  };
  return watchPoll(`t:${tenantId}:children:${guardianId}`, fetcher, onChange, onError);
}
