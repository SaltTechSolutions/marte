import { collection, doc, orderBy, query, serverTimestamp, setDoc, Timestamp, where } from 'firebase/firestore';

import { db } from '@/services/firebase';

import { AvailabilityException, TimeWindow, TrainerAvailability, TrainerBusySlot, Weekday } from '../types';
import { trainerAvailabilityFromDoc } from './convert';
import { WatchErrorHandler, watchDoc, watchQuery } from './watch';

const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export function trainerAvailabilityId(tenantId: string, trainerId: string): string {
  return `${tenantId}_${trainerId}`;
}

export function watchTrainerAvailability(
  tenantId: string,
  trainerId: string,
  onChange: (availability: TrainerAvailability | null) => void,
  onError?: WatchErrorHandler,
) {
  return watchDoc(
    'Antrenör müsaitliği',
    doc(db, 'trainer_availability', trainerAvailabilityId(tenantId, trainerId)),
    (snap) => (snap.exists() ? trainerAvailabilityFromDoc(snap) : null),
    onChange,
    onError,
  );
}

export async function setTrainerAvailability(params: {
  tenantId: string;
  trainerId: string;
  weekly: Partial<Record<Weekday, TimeWindow[]>>;
  slotMinutes: number;
  exceptions: AvailabilityException[];
}): Promise<void> {
  await setDoc(doc(db, 'trainer_availability', trainerAvailabilityId(params.tenantId, params.trainerId)), {
    tenantId: params.tenantId,
    trainerId: params.trainerId,
    weekly: params.weekly,
    slotMinutes: params.slotMinutes,
    exceptions: params.exceptions,
    updatedAt: serverTimestamp(),
  });
}

/**
 * "Never configured" vs. "configured with zero hours" — a trainer who
 * hasn't touched this screen yet has an empty `weekly`, and that must read
 * as *unset*, not as "closed every day forever." Screens use this to show
 * "bu antrenör çalışma saatlerini tanımlamamış" instead of a plain empty list.
 */
export function hasAnyAvailability(availability: TrainerAvailability | null): boolean {
  if (!availability) return false;
  return Object.values(availability.weekly).some((windows) => (windows?.length ?? 0) > 0);
}

function dayKeyOf(date: Date): Weekday {
  // getDay(): 0=Sun..6=Sat; WEEKDAYS is Mon-first, so Sunday needs wrapping.
  return WEEKDAYS[(date.getDay() + 6) % 7];
}

function toDateAt(base: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * A trainer's booked times for one day, stripped of who booked them — the
 * only view of another member's session a browsing member is allowed to
 * see. Bounded to the day being viewed, same reasoning as every other
 * unbounded-listener guard in this codebase.
 */
export function watchTrainerBusySlotsForDay(
  tenantId: string,
  trainerId: string,
  date: Date,
  onChange: (slots: TrainerBusySlot[]) => void,
  onError?: WatchErrorHandler,
) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const q = query(
    collection(db, 'trainer_busy_slots'),
    where('tenantId', '==', tenantId),
    where('trainerId', '==', trainerId),
    where('date', '>=', Timestamp.fromDate(start)),
    where('date', '<', Timestamp.fromDate(end)),
    orderBy('date', 'asc'),
  );
  return watchQuery(
    'Antrenör doluluk',
    q,
    (snap) =>
      snap.docs.map((d) => ({
        date: (d.data().date as Timestamp).toDate(),
        durationMinutes: d.data().durationMinutes as number,
        status: d.data().status as TrainerBusySlot['status'],
      })),
    onChange,
    onError,
  );
}

/**
 * Free slots for one trainer on one day: the weekly pattern (or that day's
 * exception override), sliced into `slotMinutes` increments, minus whatever
 * already occupies that day. Pure and synchronous — both inputs are already
 * loaded by the screen (`watchTrainerAvailability`,
 * `watchTrainerBusySlotsForDay`), so this never needs its own fetch.
 */
export function computeFreeSlots(
  availability: TrainerAvailability,
  date: Date,
  busySlotsThatDay: Pick<TrainerBusySlot, 'date' | 'status'>[],
  now: Date = new Date(),
): Date[] {
  const exception = availability.exceptions.find((e) => e.date === toIsoDate(date));
  if (exception?.closed) return [];
  const windows: TimeWindow[] = exception?.windows ?? availability.weekly[dayKeyOf(date)] ?? [];
  if (windows.length === 0) return [];

  const taken = new Set(
    busySlotsThatDay.filter((s) => s.status !== 'cancelled').map((s) => s.date.getTime()),
  );

  const slots: Date[] = [];
  for (const window of windows) {
    let cursor = toDateAt(date, window.start);
    const end = toDateAt(date, window.end);
    while (cursor.getTime() + availability.slotMinutes * 60000 <= end.getTime()) {
      if (cursor.getTime() > now.getTime() && !taken.has(cursor.getTime())) {
        slots.push(new Date(cursor));
      }
      cursor = new Date(cursor.getTime() + availability.slotMinutes * 60000);
    }
  }
  return slots;
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
