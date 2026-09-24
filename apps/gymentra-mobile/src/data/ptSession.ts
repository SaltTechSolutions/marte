import { PtSession } from './types';

/**
 * Bir üyenin YAKLAŞAN randevuları: yalnızca hâlâ geçerli olanlar.
 *
 * İptal belgeyi silmiyor, `status: 'cancelled'` yazıyor (`cancelPtSession`,
 * sunucuda); tarihi ileride olan iptal edilmiş randevu tarih sorgusunda
 * kalıyor. Ana ekran "yaklaşan randevu" kartına listenin ilkini basıyordu:
 * üye iptal ettiği randevuyu hâlâ görüyor, "İptal et"e basınca sunucu "zaten
 * iptal edilmiş" diyordu (DEN-7).
 *
 * Yalnızca `scheduled`: sunucu tamamlanmış randevuyu da iptal ettirmiyor, yani
 * o satırdaki "İptal et" düğmesi hata verirdi.
 */
export const upcomingScheduled = (sessions: PtSession[]): PtSession[] =>
  sessions.filter((s) => s.status === 'scheduled');
