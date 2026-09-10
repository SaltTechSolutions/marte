import { collection, query, where } from 'firebase/firestore';

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
