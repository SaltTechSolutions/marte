import { sharedWatch } from '../firebase/sharedWatch';
import type { WatchErrorHandler } from '../firebase/watch';
import { Program, ProgramDay, ProgramExercise, ProgramStatus } from '../types';
import { ApiError, apiPost, apiPut } from './client';
import { bodyOf, programFromDto } from './programMap';
import {
  fetchMemberPrograms,
  fetchProgram,
  fetchTenantPrograms,
  internalId,
  locateProgram,
  rememberProgram,
  requireProgram,
  touch,
  watchOne,
  watchPoll,
  writeThrough,
} from './programShared';

/**
 * Cloudflare Worker version of data/firebase/programRepo.ts: same exports, same signatures.
 *
 * Worker contract (api/src/writes2.ts, reads2.ts): a program is `programs(id, tenant_id, member_id, data,
 * updated_at)`; POST creates, PUT REPLACES the whole `data` body (tenant and member stay pinned), so every
 * partial change here is read-modify-write on the fresh body, ordered per program. `updatedAt` is the
 * server's clock; `createdAt` lives in the body (ms) and is set at creation.
 */
const enc = encodeURIComponent;
const AREA = 'programs';

/** Local Firestore-style random id (20 chars), no network: stable ids for exercises inside a program. */
export function newLocalId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 20; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

/**
 * Trainer taps a client → land on a program to edit. Reuses an existing draft
 * or active program for that member instead of spawning duplicates; only
 * creates a fresh draft if the member truly has none yet.
 */
export async function findOrCreateDraftProgram(params: {
  tenantId: string;
  trainerId: string;
  memberId: string;
  memberName: string;
}): Promise<string> {
  const memberId = await internalId(params.memberId);
  const existing = await fetchMemberPrograms(params.tenantId, memberId);   // newest edit first
  const draft = existing.find((p) => p.status === 'draft');
  if (draft) return draft.id;
  const active = existing.find((p) => p.status === 'active');
  if (active) return active.id;

  const { id } = await apiPost<{ id: string }>(`/tenants/${enc(params.tenantId)}/programs`, {
    memberId,
    memberName: params.memberName,
    trainerId: await internalId(params.trainerId),
    name: `${params.memberName} Programı`,
    status: 'draft',
    exercises: [],
    createdAt: Date.now(),
  });
  rememberProgram(id, params.tenantId, memberId);
  touch(params.tenantId, AREA);
  return id;
}

export function watchProgram(
  programId: string,
  onChange: (program: Program | null) => void,
  onError?: WatchErrorHandler,
) {
  return watchOne<Program>(
    'Program',
    programId,
    locateProgram,
    AREA,
    async (loc) => {
      const dto = await fetchProgram(programId);
      return dto ? programFromDto(dto, dto.tenantId, dto.memberId) : null;
    },
    onChange,
    onError,
  );
}

/**
 * Read-modify-write of one program's body; the echo is shown at once, the invalidate refreshes everyone.
 * The write is queued synchronously (before any lookup) so calls land in the order they were made.
 */
async function changeProgram(
  programId: string,
  echo: Record<string, unknown>,
  change: (body: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
  let tenantId: string | undefined;
  try {
    await writeThrough(programId, { ...echo, updatedAt: new Date() }, async () => {
      const loc = await requireProgram(programId);
      tenantId = loc.tenantId;
      const cur = await fetchProgram(programId);
      if (!cur) throw new ApiError(404, 'Program bulunamadı.');
      await apiPut(`/tenants/${enc(loc.tenantId)}/programs/${enc(programId)}`, change(bodyOf(cur)));
    });
  } finally {
    if (tenantId) touch(tenantId, AREA);   // success: everyone refreshes; failure: the echo is replaced by the server's truth
  }
}

/**
 * Çok günlü programı kaydeder (PER-17).
 *
 * `days`'in yanına ilk günün egzersizleri `exercises`'a da yazılıyor: eski
 * sürümdeki bir telefon yalnızca `exercises` okuyor. Tek doğruluk kaynağı
 * `days`; `exercises` onun aynası. `origin`, şablondan kopyalanınca yazılıyor
 * (ısınma bloğu ve kaynağın kimliği); kopyadan sonra şablonla canlı bağ YOK.
 */
export async function saveProgramDays(
  programId: string,
  days: ProgramDay[],
  origin?: { warmup?: string; templateId?: string },
): Promise<void> {
  const patch = {
    days,
    exercises: days[0]?.exercises ?? [],
    ...(origin?.warmup ? { warmup: origin.warmup } : {}),
    ...(origin?.templateId ? { templateId: origin.templateId } : {}),
  };
  await changeProgram(programId, patch, (body) => ({ ...body, ...patch }));
}

/**
 * Isınma ön bloğunu açar ya da kapatır. Kapatmak alanı SİLİYOR, boş metin
 * yazmıyor: "ısınma yok" ile "ısınma kimliği boş" aynı şey değil (PER-18).
 */
export async function setProgramWarmup(programId: string, warmup: string | null): Promise<void> {
  await changeProgram(programId, { warmup: warmup ?? undefined }, (body) => {
    const { warmup: _old, ...rest } = body;
    return warmup ? { ...rest, warmup } : rest;
  });
}

export async function saveProgramExercises(programId: string, exercises: ProgramExercise[]): Promise<void> {
  await changeProgram(programId, { exercises }, (body) => ({ ...body, exercises }));
}

export async function setProgramStatus(programId: string, status: ProgramStatus): Promise<void> {
  await changeProgram(programId, { status }, (body) => ({ ...body, status }));
}

const byLatestEdit = (a: Program, b: Program) => b.updatedAt.getTime() - a.updatedAt.getTime();

/** Member's own workout tab — their current active program, if any. */
export function watchActiveProgramForMember(
  tenantId: string,
  memberId: string,
  onChange: (program: Program | null) => void,
  onError?: WatchErrorHandler,
) {
  return watchPoll(
    'Aktif program',
    `t:${tenantId}:${AREA}:member:${memberId}:active`,
    async () => {
      const id = await internalId(memberId);
      const dto = (await fetchMemberPrograms(tenantId, id)).find((p) => p.status === 'active');
      return dto ? programFromDto(dto, tenantId, id) : null;
    },
    onChange,
    onError,
  );
}

const tenantPrograms = async (tenantId: string, activeOnly: boolean): Promise<Program[]> =>
  (await fetchTenantPrograms(tenantId, activeOnly)).map(({ dto, memberId }) => programFromDto(dto, tenantId, memberId));

/** Trainer client list — which members currently have an active program. */
export function watchActiveProgramsForTenant(
  tenantId: string,
  onChange: (programs: Program[]) => void,
  onError?: WatchErrorHandler,
) {
  const key = `t:${tenantId}:${AREA}:tenant:active`;
  return sharedWatch(
    key,
    (change, err) =>
      watchPoll('Aktif programlar', key, async () => (await tenantPrograms(tenantId, true)).sort(byLatestEdit), change, err),
    onChange,
    onError,
  );
}

/** Every program in the gym, drafts included — the trainer's Programlar tab, last edit first. */
export function watchProgramsForTenant(
  tenantId: string,
  onChange: (programs: Program[]) => void,
  onError?: WatchErrorHandler,
) {
  const key = `t:${tenantId}:${AREA}:tenant:all`;
  return sharedWatch(
    key,
    (change, err) => watchPoll('Programlar', key, async () => (await tenantPrograms(tenantId, false)).sort(byLatestEdit), change, err),
    onChange,
    onError,
  );
}
