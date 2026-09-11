import { collection, doc, getDoc, query, where } from 'firebase/firestore';

import { db } from '@/services/firebase';

import { ProgramTemplate } from '../types';
import { programTemplateFromDoc } from './convert';
import { WatchErrorHandler, watchQuery } from './watch';

/**
 * Hazır program şablonları (PER-18).
 *
 * İki tür şablon aynı koleksiyonda: `tenantId: null` olanlar GLOBAL —
 * yayımlanmış kılavuz ve araştırmalara dayanan, `seed_program_templates.cjs`
 * ile yazılan ortak şablonlar; `tenantId` dolu olanlar o salonun kendi
 * yazdıkları. Antrenör ikisini bir arada görür, çünkü seçerken aradaki fark
 * onu ilgilendirmiyor: ikisi de "başlangıç noktası".
 *
 * Sorgu tek alanda `in` kullanıyor, bileşik index istemiyor.
 */
export function watchProgramTemplates(
  tenantId: string,
  cb: (templates: ProgramTemplate[]) => void,
  onError?: WatchErrorHandler,
): () => void {
  return watchQuery(
    'Program şablonları',
    query(collection(db, 'program_templates'), where('tenantId', 'in', [null, tenantId])),
    // Sıra: önce salonun kendi şablonları (antrenör onları arıyor), sonra
    // global olanlar; her grup kendi içinde başlıkla. Firestore'da sıralamak
    // ikinci alan demek, yani index; liste 20-30 belge, burada ucuz.
    (snap) =>
      snap.docs.map(programTemplateFromDoc).sort((a, b) => {
        if ((a.tenantId === null) !== (b.tenantId === null)) return a.tenantId === null ? 1 : -1;
        return a.title.localeCompare(b.title, 'tr');
      }),
    cb,
    onError,
  );
}

/**
 * Tek şablon — ısınma bloğunu antrenman öncesinde göstermek için.
 *
 * `watch` değil `get`: ısınma bir kere okunup ekranda duruyor, canlı
 * güncellenmesinin bir anlamı yok. Program yalnızca ısınmanın KİMLİĞİNİ
 * taşıyor (`Program.warmup`), içeriğini değil — şablon düzeltilince eski
 * programlar da düzelmiş ısınmayı görüyor. Günlerin aksine ısınma
 * kopyalanmıyor, çünkü antrenörün üyeye özel düzenlediği şey o değil.
 */
export async function getProgramTemplate(id: string): Promise<ProgramTemplate | null> {
  const snap = await getDoc(doc(db, 'program_templates', id));
  return snap.exists() ? programTemplateFromDoc(snap) : null;
}
