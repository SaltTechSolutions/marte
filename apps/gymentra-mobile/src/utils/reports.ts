import { ClassSession, MemberPackage, Payment, PtSession, TenantMembership } from '@/data/types';

import { sumPayments } from './revenue';

const MONTHS_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Whole days from `from` to `to`, rounded up — "bitmesine 1 gün" while any
 * part of that day is left, never 0 for something that has not expired yet. */
export function daysUntil(to: Date, from: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / 86400000);
}

export interface MonthlyBucket {
  /** `Eyl` — chart axis label. */
  label: string;
  /** `Eylül 2026` — spoken out where there is room for it. */
  fullLabel: string;
  total: number;
}

/**
 * Confirmed income per calendar month, oldest first, with empty months kept.
 *
 * Dropping a zero month would be the wrong kindness: a gap in the bars is the
 * finding. A chart that silently skips August makes a dead month look like a
 * normal one sitting next to July.
 */
export function monthlyRevenue(payments: Payment[], months: number, now: Date): MonthlyBucket[] {
  const confirmed = payments.filter((p) => p.status === 'confirmed');
  const byMonth = new Map<string, Payment[]>();
  for (const p of confirmed) {
    const k = monthKey(p.createdAt);
    const list = byMonth.get(k);
    if (list) list.push(p);
    else byMonth.set(k, [p]);
  }

  const out: MonthlyBucket[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      label: MONTHS_TR[d.getMonth()],
      fullLabel: `${d.toLocaleDateString('tr-TR', { month: 'long' })} ${d.getFullYear()}`,
      total: sumPayments(byMonth.get(monthKey(d)) ?? []),
    });
  }
  return out;
}

export interface AttendanceStats {
  present: number;
  absent: number;
  /** `null` when nothing was ever marked — not 0. */
  rate: number | null;
  /** Classes whose attendance was actually taken. */
  markedClasses: number;
  /** Classes that came and went with nobody marking anything. */
  unmarkedClasses: number;
}

/**
 * Group class attendance over a window.
 *
 * A class with no `attendance` map is **excluded from the rate**, not counted
 * as everyone absent. The schema draws that line deliberately and a report is
 * exactly where breaking it would lie: "nobody took attendance" and "nobody
 * showed up" are different facts, and an owner acts on them differently — one
 * is a coaching problem, the other a scheduling one. The count of unmarked
 * classes is surfaced next to the rate so the number is read with its caveat.
 */
export function attendanceStats(classes: ClassSession[], until: Date): AttendanceStats {
  let present = 0;
  let absent = 0;
  let markedClasses = 0;
  let unmarkedClasses = 0;

  for (const c of classes) {
    if (c.date > until) continue; // henüz olmamış ders yoklama beklemiyor
    const marks = Object.values(c.attendance ?? {});
    if (marks.length === 0) {
      // Boş bir ders için yoklama alınmamış olması bir eksiklik değil.
      if (c.bookedUserIds.length > 0) unmarkedClasses++;
      continue;
    }
    markedClasses++;
    for (const m of marks) {
      if (m === 'present') present++;
      else if (m === 'absent') absent++;
    }
  }

  const total = present + absent;
  return { present, absent, markedClasses, unmarkedClasses, rate: total === 0 ? null : present / total };
}

export interface ExpiringPackage {
  pkg: MemberPackage;
  daysLeft: number;
}

/**
 * Memberships running out inside `days`, soonest first.
 *
 * `status` is not trusted on its own — PKG-12's daily sweep does not exist
 * yet, so a package that ended last month can still read `active`. `endsAt`
 * is the fact; the status field is a cache of it.
 */
export function expiringPackages(packages: MemberPackage[], now: Date, days: number): ExpiringPackage[] {
  const horizon = new Date(now.getTime() + days * 86400000);
  return packages
    .filter((p) => p.status !== 'cancelled' && p.endsAt >= now && p.endsAt <= horizon)
    .map((p) => ({ pkg: p, daysLeft: daysUntil(p.endsAt, now) }))
    .sort((a, b) => a.pkg.endsAt.getTime() - b.pkg.endsAt.getTime());
}

export interface LapsedMember {
  memberId: string;
  memberName: string;
  /** `null` when the member never had a package at all. */
  lastPackageName: string | null;
  endedAt: Date | null;
}

/**
 * Active members with nothing currently paid for: their last package has run
 * out, or they never had one.
 *
 * This is the closest honest answer to "kimin parası gecikti". The app has no
 * invoice or due date — money changes hands outside it — so a debt cannot be
 * computed. What it can say is who is still walking in without a live package,
 * which is the same list the owner would have written by hand.
 */
export function lapsedMembers(
  members: TenantMembership[],
  packages: MemberPackage[],
  now: Date,
): LapsedMember[] {
  const latestByMember = new Map<string, MemberPackage>();
  for (const p of packages) {
    if (p.status === 'cancelled') continue;
    const current = latestByMember.get(p.memberId);
    if (!current || p.endsAt > current.endsAt) latestByMember.set(p.memberId, p);
  }

  const out: LapsedMember[] = [];
  for (const m of members) {
    const latest = latestByMember.get(m.userId);
    if (latest && latest.endsAt >= now) continue; // hâlâ geçerli paketi var
    out.push({
      memberId: m.userId,
      memberName: m.userDisplayName || m.userEmail || 'Adsız üye',
      lastPackageName: latest?.packageName ?? null,
      endedAt: latest?.endsAt ?? null,
    });
  }
  // Hiç paketi olmayanlar en sonda: onlar yeni üye olabilir, biteni olan
  // ise para bırakmayı bırakmış birisi — sahibin önce aramak istediği o.
  return out.sort((a, b) => {
    if (a.endedAt && b.endedAt) return b.endedAt.getTime() - a.endedAt.getTime();
    if (a.endedAt) return -1;
    if (b.endedAt) return 1;
    return a.memberName.localeCompare(b.memberName, 'tr');
  });
}

export interface PendingPayments {
  count: number;
  total: number;
  oldest: Payment | null;
}

/** Member-reported payments still waiting for the owner to confirm. */
export function pendingPayments(payments: Payment[]): PendingPayments {
  const pending = payments.filter((p) => p.status === 'pending');
  const oldest = pending.reduce<Payment | null>(
    (acc, p) => (acc === null || p.createdAt < acc.createdAt ? p : acc),
    null,
  );
  return {
    count: pending.length,
    total: pending.reduce((sum, p) => sum + p.amount, 0),
    oldest,
  };
}

/**
 * New members approved per calendar month.
 *
 * This is joins, not headcount. A running total would be a lie: nothing
 * records when someone left — `leftAt` only exists on people who used the
 * app's leave button, and the gym removes members through a callable that
 * deletes the row outright. Counting joins is a number we can actually stand
 * behind; "aktif üye trendi" as a stock series would need history we never
 * wrote down.
 */
export function memberGrowth(members: TenantMembership[], months: number, now: Date): MonthlyBucket[] {
  const byMonth = new Map<string, number>();
  for (const m of members) {
    const joined = m.approvedAt ?? m.requestedAt;
    if (!joined) continue;
    const k = monthKey(joined);
    byMonth.set(k, (byMonth.get(k) ?? 0) + 1);
  }

  const out: MonthlyBucket[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      label: MONTHS_TR[d.getMonth()],
      fullLabel: `${d.toLocaleDateString('tr-TR', { month: 'long' })} ${d.getFullYear()}`,
      total: byMonth.get(monthKey(d)) ?? 0,
    });
  }
  return out;
}

export interface BurnedCredits {
  /** Üye gelmedi, hak harcanmış kaldı. */
  noShows: number;
  /** Son tarihten sonra iptal edildi, hak yandı. */
  lateCancels: number;
  /** Salonun kendi iptal ettiği, hakkın iade edildiği randevular. */
  gymCancels: number;
  /** En yenisi başta — üye itiraz ettiğinde bakılacak satırlar. */
  rows: { session: PtSession; reason: 'no-show' | 'late-cancel' }[];
}

/**
 * Lessons the member paid for and did not get back, over a window.
 *
 * This is the report half of the no-show policy, and it exists for one
 * conversation: "ben gelmedim, hakkım neden gitti". It counts only sessions
 * that actually cost a credit — a trainer's own package-independent booking
 * has nothing to burn — and it keeps the gym's own cancellations in a
 * separate figure, because those refunded and belong to a different
 * question ("how often do we cancel on members?").
 */
export function burnedCredits(sessions: PtSession[], since: Date, until: Date): BurnedCredits {
  const out: BurnedCredits = { noShows: 0, lateCancels: 0, gymCancels: 0, rows: [] };
  for (const s of sessions) {
    if (s.date < since || s.date > until) continue;
    const byGym = s.cancelledByRole === 'trainer' || s.cancelledByRole === 'admin';
    if (s.status === 'cancelled' && byGym) {
      out.gymCancels++;
      continue;
    }
    if (!s.creditId) continue; // harcanacak bir hak yoktu
    if (s.status === 'no-show') {
      out.noShows++;
      out.rows.push({ session: s, reason: 'no-show' });
    } else if (s.status === 'cancelled' && s.creditRefunded === false) {
      out.lateCancels++;
      out.rows.push({ session: s, reason: 'late-cancel' });
    }
  }
  out.rows.sort((a, b) => b.session.date.getTime() - a.session.date.getTime());
  return out;
}

/** Kaç üye bu ay hiç uğramadı — devamsızlığın sessiz hâli. */
export function inactiveSince(checkinUserIds: Set<string>, members: TenantMembership[]): TenantMembership[] {
  return members.filter((m) => !checkinUserIds.has(m.userId));
}

export { monthStart };
