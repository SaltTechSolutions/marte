import type { WatchErrorHandler } from '../firebase/watch';
import { ProgramTemplate } from '../types';
import { ApiError, apiGet } from './client';
import { Dto, programTemplateFromDto } from './programMap';
import { watchPoll } from './programShared';

/**
 * Hazır program şablonları (PER-18), Worker sürümü: Firebase modülüyle aynı dışa aktarımlar.
 *
 * `GET /v1/program-templates` returns the GLOBAL templates (tenant NULL) plus those of every gym the
 * caller is an active member of; Firebase's query was `tenantId in [null, tenantId]`, so the list is
 * narrowed to this gym here. Template rows are written by seed scripts / the admin tooling, never by the
 * app, so there is nothing to invalidate.
 */
const fetchAll = async (): Promise<ProgramTemplate[]> =>
  (await apiGet<Dto[]>('/program-templates')).map(programTemplateFromDto);

export function watchProgramTemplates(
  tenantId: string,
  cb: (templates: ProgramTemplate[]) => void,
  onError?: WatchErrorHandler,
): () => void {
  return watchPoll(
    'Program şablonları',
    `t:${tenantId}:programTemplates`,
    async () =>
      (await fetchAll())
        .filter((t) => t.tenantId === null || t.tenantId === tenantId)
        // Önce salonun kendi şablonları, sonra global olanlar; her grup kendi içinde başlıkla.
        .sort((a, b) => {
          if ((a.tenantId === null) !== (b.tenantId === null)) return a.tenantId === null ? 1 : -1;
          return a.title.localeCompare(b.title, 'tr');
        }),
    cb,
    onError,
    { intervalMs: 5 * 60_000 },   // seed-managed content: a slow poll is plenty
  );
}

/**
 * Tek şablon — ısınma bloğunu antrenman öncesinde göstermek için. `watch` değil `get`.
 * null: yok ya da bu kullanıcıya görünmüyor (başka salonun şablonu).
 */
export async function getProgramTemplate(id: string): Promise<ProgramTemplate | null> {
  try {
    return programTemplateFromDto(await apiGet<Dto>(`/program-templates/${encodeURIComponent(id)}`));
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}
