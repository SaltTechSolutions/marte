import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Card } from '@/components/Card';
import { ErrorNotice } from '@/components/ErrorNotice';
import { ListGroup, ListRow } from '@/components/ListRow';
import { MiniBarChart } from '@/components/MiniBarChart';
import { Text } from '@/components/Text';
import { useRefreshControl } from '@/components/useRefreshControl';
import { useAuth } from '@/context/AuthContext';
import { watchClassesForTenant } from '@/data/firebase/classRepo';
import { watchTenantMemberPackages } from '@/data/firebase/memberPackageRepo';
import { watchActiveMembers } from '@/data/firebase/membershipRepo';
import { watchPaymentsForTenant } from '@/data/firebase/paymentRepo';
import { watchSessionsForTenant } from '@/data/firebase/ptSessionRepo';
import { canManageGym, tenantIdIf } from '@/data/membership';
import { ClassSession, MemberPackage, Payment, PtSession, TenantMembership } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';
import {
  attendanceStats,
  burnedCredits,
  expiringPackages,
  lapsedMembers,
  memberGrowth,
  monthlyRevenue,
  pendingPayments,
} from '@/utils/reports';

const EXPIRY_HORIZON_DAYS = 14;
const ATTENDANCE_WINDOW_DAYS = 30;
const TREND_MONTHS = 6;
/** Kaç satır gösterilip gerisi "ve N kişi daha" olsun. */
const PREVIEW_ROWS = 5;

function money(n: number): string {
  return `${Math.round(n).toLocaleString('tr-TR')}₺`;
}

/** Bir bölümün başlığı ve altındaki tek cümlelik ne-demek açıklaması. */
function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  const { spacing } = useAppTheme();
  return (
    <View style={{ gap: 2, paddingTop: spacing.sm }}>
      <Text variant="label" tone="sub">
        {title}
      </Text>
      {hint ? (
        <Text variant="helper" tone="sub">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Verisi henüz gelmemiş bir kartın yeri — boş sonuç iddiasında bulunmadan. */
function LoadingCard() {
  return (
    <Card>
      <Text variant="helper" tone="sub">
        Yükleniyor…
      </Text>
    </Card>
  );
}

/**
 * Raporlar — panelin dört sayısının cevaplayamadığı ikinci soru.
 *
 * Sıralama bilinçli ve persona testinden geliyor: sahibin elle üye üye açarak
 * cevapladığı iki soru — "kimin parası bekliyor", "kimin paketi bitiyor" —
 * en üstte. Trendler altta; onlar merak, bunlar bugün yapılacak iş.
 *
 * Her kart bir isim listesine iniyor. Yüzdeyle biten bir rapor sahibi
 * "peki kim?" diye yine üye listesine gönderir; buradaki her satır
 * dokunulabilir ve üye detayına gider.
 */
export default function AdminReports() {
  const router = useRouter();
  const { colors, spacing } = useAppTheme();
  const { activeMembership } = useAuth();
  const tenantId = tenantIdIf(activeMembership, canManageGym(activeMembership));

  // Ekranın baktığı an. Her render'da yeni bir `new Date()` üretmek hesapları
  // sessizce kaydırır ve iki kartın farklı ana bakmasına yol açar; aşağı
  // çekmek hem dinleyicileri hem bu anı tazeler.
  const [now, setNow] = useState(() => new Date());
  const refreshControl = useRefreshControl(() => setNow(new Date()));

  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [packages, setPackages] = useState<MemberPackage[] | null>(null);
  const [members, setMembers] = useState<TenantMembership[] | null>(null);
  const [classes, setClasses] = useState<ClassSession[] | null>(null);
  const [sessions, setSessions] = useState<PtSession[] | null>(null);
  // Düşen bir dinleyici sessizce sonsuz "yükleniyor" bırakıyordu — kart
  // bozuk olduğunu söyleyemiyordu. İlk hata yeter: sayfa tek bir uyarı
  // gösterip yeniden denemeyi teklif ediyor.
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    const fail = (what: string) => () => setFailed((prev) => prev ?? what);
    const unsubPayments = watchPaymentsForTenant(tenantId, setPayments, fail('Ödemeler'));
    const unsubPackages = watchTenantMemberPackages(tenantId, setPackages, fail('Paketler'));
    const unsubMembers = watchActiveMembers(tenantId, setMembers, fail('Üye listesi'));
    const windowStart = new Date(now.getTime() - ATTENDANCE_WINDOW_DAYS * 86400000);
    const unsubClasses = watchClassesForTenant(
      tenantId,
      { from: windowStart, to: now },
      setClasses,
      fail('Dersler'),
    );
    const unsubSessions = watchSessionsForTenant(
      tenantId,
      { from: windowStart, to: now },
      setSessions,
      fail('Randevular'),
    );
    return () => {
      unsubPayments();
      unsubPackages();
      unsubMembers();
      unsubClasses();
      unsubSessions();
    };
  }, [tenantId, now]);

  const pending = useMemo(() => pendingPayments(payments ?? []), [payments]);
  const expiring = useMemo(
    () => expiringPackages(packages ?? [], now, EXPIRY_HORIZON_DAYS),
    [packages, now],
  );
  const lapsed = useMemo(
    () => lapsedMembers(members ?? [], packages ?? [], now),
    [members, packages, now],
  );
  const revenue = useMemo(() => monthlyRevenue(payments ?? [], TREND_MONTHS, now), [payments, now]);
  const growth = useMemo(() => memberGrowth(members ?? [], TREND_MONTHS, now), [members, now]);
  const attendance = useMemo(() => attendanceStats(classes ?? [], now), [classes, now]);
  const burned = useMemo(
    () => burnedCredits(sessions ?? [], new Date(now.getTime() - ATTENDANCE_WINDOW_DAYS * 86400000), now),
    [sessions, now],
  );

  // Her kart kendi verisini bekler. Tek bir genel "yükleniyor" bayrağı
  // yetmiyordu: ödemeler henüz gelmemişken kart "Bekleyen ödeme yok" diyor,
  // paketler gelmemişken herkes "paketi yok" görünüyordu. Boş bir yanıt ile
  // henüz gelmemiş bir yanıt aynı şey değil ve ikincisini birincisi gibi
  // göstermek sahibi yanlış bilgilendiriyor.
  const paymentsReady = payments !== null;
  const packagesReady = packages !== null;
  const rosterReady = packagesReady && members !== null;
  const classesReady = classes !== null;

  return (
    <ScrollView
      refreshControl={refreshControl}
      contentContainerStyle={{
        paddingHorizontal: spacing.md,
        paddingTop: spacing.sm,
        gap: spacing.sm,
        paddingBottom: spacing.lg,
      }}>
      {/* --- 1. Bugün yapılacak iş ------------------------------------- */}

      {failed ? (
        <ErrorNotice
          message={`${failed} yüklenemedi. Aşağıdaki bazı kartlar eksik olabilir.`}
          onRetry={() => {
            setFailed(null);
            setNow(new Date());
          }}
        />
      ) : null}

      <SectionHeader title="ŞİMDİ İLGİLENİLECEKLER" />

      <Pressable onPress={() => router.push('/admin/payments')}>
        <Card outlineColor={pending.count > 0 ? colors.warn : undefined}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Ionicons
              name="hourglass-outline"
              size={22}
              color={paymentsReady && pending.count > 0 ? colors.warn : colors.sub}
            />
            <View style={{ flex: 1 }}>
              <Text variant="body" weight="700">
                {!paymentsReady
                  ? 'Ödemeler yükleniyor…'
                  : pending.count === 0
                    ? 'Bekleyen ödeme yok'
                    : `${pending.count} ödeme onayını bekliyor`}
              </Text>
              <Text variant="helper" tone="sub">
                {!paymentsReady
                  ? ' '
                  : pending.count === 0
                    ? 'Üyelerin bildirdiği her ödeme işlenmiş.'
                    : `Toplam ${money(pending.total)} · en eskisi ${pending.oldest?.memberName ?? ''}`}
              </Text>
            </View>
            {paymentsReady && pending.count > 0 ? (
              <Ionicons name="chevron-forward" size={18} color={colors.sub} />
            ) : null}
          </View>
        </Card>
      </Pressable>

      <SectionHeader
        title={`PAKETİ BİTİYOR · ${EXPIRY_HORIZON_DAYS} GÜN`}
        hint="Yenilemesi konuşulacak üyeler, en yakın bitenden başlayarak."
      />
      {!packagesReady ? (
        <LoadingCard />
      ) : expiring.length === 0 ? (
        <Card>
          <Text variant="helper" tone="sub">
            Önümüzdeki {EXPIRY_HORIZON_DAYS} günde biten paket yok.
          </Text>
        </Card>
      ) : (
        <ListGroup>
          {expiring.slice(0, PREVIEW_ROWS).map((e, i) => (
            <ListRow
              key={e.pkg.id}
              last={i === Math.min(expiring.length, PREVIEW_ROWS) - 1 && expiring.length <= PREVIEW_ROWS}
              onPress={() => router.push({ pathname: '/admin/member', params: { id: e.pkg.memberId } })}>
              <View style={{ flex: 1 }}>
                <Text variant="body" weight="600">
                  {e.pkg.memberName}
                </Text>
                <Text variant="helper" tone="sub">
                  {e.pkg.packageName}
                </Text>
              </View>
              <Text
                variant="helper"
                weight="700"
                style={{ color: e.daysLeft <= 3 ? colors.danger : colors.warn }}>
                {e.daysLeft} gün
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.sub} />
            </ListRow>
          ))}
          {expiring.length > PREVIEW_ROWS ? (
            <ListRow last onPress={() => router.push('/admin/members')}>
              <Text variant="helper" tone="sub" style={{ flex: 1 }}>
                ve {expiring.length - PREVIEW_ROWS} üye daha
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.sub} />
            </ListRow>
          ) : null}
        </ListGroup>
      )}

      <SectionHeader
        title="GEÇERLİ PAKETİ OLMAYANLAR"
        hint="Uygulama borç tutmaz — para salon ile üye arasında el değiştirir. Bu liste, şu an ödenmiş bir paketi olmayan aktif üyeleri gösterir."
      />
      {!rosterReady ? (
        <LoadingCard />
      ) : lapsed.length === 0 ? (
        <Card>
          <Text variant="helper" tone="sub">
            Bütün aktif üyelerin geçerli bir paketi var.
          </Text>
        </Card>
      ) : (
        <ListGroup>
          {lapsed.slice(0, PREVIEW_ROWS).map((l, i) => (
            <ListRow
              key={l.memberId}
              last={i === Math.min(lapsed.length, PREVIEW_ROWS) - 1 && lapsed.length <= PREVIEW_ROWS}
              onPress={() => router.push({ pathname: '/admin/member', params: { id: l.memberId } })}>
              <View style={{ flex: 1 }}>
                <Text variant="body" weight="600">
                  {l.memberName}
                </Text>
                <Text variant="helper" tone="sub">
                  {l.endedAt
                    ? `${l.lastPackageName} bitti · ${l.endedAt.toLocaleDateString('tr-TR')}`
                    : 'Hiç paket atanmamış'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.sub} />
            </ListRow>
          ))}
          {lapsed.length > PREVIEW_ROWS ? (
            <ListRow last onPress={() => router.push('/admin/members')}>
              <Text variant="helper" tone="sub" style={{ flex: 1 }}>
                ve {lapsed.length - PREVIEW_ROWS} üye daha
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.sub} />
            </ListRow>
          ) : null}
        </ListGroup>
      )}

      {/* --- 2. Gidişat ------------------------------------------------- */}

      <SectionHeader title="GİDİŞAT" />

      <Card style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <Text variant="label" tone="sub">
              Aylık gelir
            </Text>
            <Text variant="h2">
              {paymentsReady ? money(revenue[revenue.length - 1]?.total ?? 0) : '–'}
            </Text>
            <Text variant="helper" tone="sub">
              {revenue[revenue.length - 1]?.fullLabel}
            </Text>
          </View>
        </View>
        <MiniBarChart values={revenue.map((b) => b.total)} baseline="zero" />
        <View style={{ flexDirection: 'row' }}>
          {revenue.map((b) => (
            <Text key={b.fullLabel} variant="label" tone="sub" style={{ flex: 1, textAlign: 'center' }}>
              {b.label}
            </Text>
          ))}
        </View>
        <Text variant="helper" tone="sub">
          Yalnızca onaylanmış kayıtlar; iadeler düşülmüş.
        </Text>
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <View>
          <Text variant="label" tone="sub">
            Yeni üye
          </Text>
          <Text variant="h2">{members === null ? '–' : (growth[growth.length - 1]?.total ?? 0)}</Text>
          <Text variant="helper" tone="sub">
            {growth[growth.length - 1]?.fullLabel}
          </Text>
        </View>
        <MiniBarChart values={growth.map((b) => b.total)} baseline="zero" />
        <View style={{ flexDirection: 'row' }}>
          {growth.map((b) => (
            <Text key={b.fullLabel} variant="label" tone="sub" style={{ flex: 1, textAlign: 'center' }}>
              {b.label}
            </Text>
          ))}
        </View>
        <Text variant="helper" tone="sub">
          Aya düşen katılım sayısı. Ayrılanlar kayıt altına alınmadığı için bu
          bir toplam üye eğrisi değil.
        </Text>
      </Card>

      <Card style={{ gap: 6 }}>
        <Text variant="label" tone="sub">
          Yanan ders hakkı · son {ATTENDANCE_WINDOW_DAYS} gün
        </Text>
        {sessions === null ? (
          <Text variant="body" tone="sub">
            Yükleniyor…
          </Text>
        ) : burned.noShows + burned.lateCancels === 0 ? (
          <Text variant="helper" tone="sub">
            Bu aralıkta yanan hak yok.
            {burned.gymCancels > 0 ? ` Salonun iptal ettiği ${burned.gymCancels} randevuda hak iade edildi.` : ''}
          </Text>
        ) : (
          <>
            <Text variant="h2">{burned.noShows + burned.lateCancels}</Text>
            <Text variant="helper" tone="sub">
              {burned.noShows} gelmedi, {burned.lateCancels} geç iptal.
              {burned.gymCancels > 0 ? ` Salonun iptal ettiği ${burned.gymCancels} randevuda hak iade edildi.` : ''}
            </Text>
            {/* Üye "hakkım neden gitti" dediğinde bakılacak satırlar. Tarih ve
                sebep birlikte duruyor; ikisinden biri eksikse cevap değil. */}
            {burned.rows.slice(0, PREVIEW_ROWS).map(({ session, reason }) => (
              <Text key={session.id} variant="label" tone="sub">
                {session.date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ·{' '}
                {session.memberName} · {reason === 'no-show' ? 'gelmedi' : 'geç iptal'}
              </Text>
            ))}
            {burned.rows.length > PREVIEW_ROWS ? (
              <Text variant="label" tone="sub">
                ve {burned.rows.length - PREVIEW_ROWS} kayıt daha
              </Text>
            ) : null}
          </>
        )}
      </Card>

      <Card style={{ gap: 6 }}>
        <Text variant="label" tone="sub">
          Grup dersi katılımı · son {ATTENDANCE_WINDOW_DAYS} gün
        </Text>
        {!classesReady ? (
          <Text variant="body" tone="sub">
            Yükleniyor…
          </Text>
        ) : attendance.rate === null ? (
          <>
            <Text variant="body" tone="sub">
              Henüz yoklama alınmamış
            </Text>
            <Text variant="helper" tone="sub">
              {attendance.unmarkedClasses > 0
                ? `${attendance.unmarkedClasses} ders yoklamasız geçti. Antrenör ders ekranından işaretleyince oran burada çıkar.`
                : 'Bu aralıkta kayıtlı katılımcısı olan ders olmamış.'}
            </Text>
          </>
        ) : (
          <>
            <Text variant="h2">%{Math.round(attendance.rate * 100)}</Text>
            <Text variant="helper" tone="sub">
              {attendance.markedClasses} derste {attendance.present} katılım, {attendance.absent} gelmeyen.
            </Text>
            {attendance.unmarkedClasses > 0 ? (
              <Text variant="helper" style={{ color: colors.warn }}>
                {attendance.unmarkedClasses} ders yoklamasız geçti ve bu orana girmedi — “gelmedi” ile
                “işaretlenmedi” aynı şey değil.
              </Text>
            ) : null}
          </>
        )}
      </Card>
    </ScrollView>
  );
}
