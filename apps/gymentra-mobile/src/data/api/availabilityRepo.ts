import type { WatchErrorHandler } from '../firebase/watch';
import { AvailabilityException, TimeWindow, TrainerAvailability, TrainerBusySlot, Weekday } from '../types';
import { ApiError, apiGet, apiPut } from './client';
import { live, localized, pid, refresh } from './classSupport';

// Pure helpers: identical to Firestore's by construction (same code), nothing to port.
export { computeFreeSlots, hasAnyAvailability, trainerAvailabilityId } from '../firebase/availabilityRepo';

interface AvailabilityDto {
  weekly: Partial<Record<Weekday, TimeWindow[]>>;
  slotMinutes: number;
  exceptions: AvailabilityException[];
}
interface BusyDto { startsAt: number; durationMinutes: number }

export function watchTrainerAvailability(
  tenantId: string,
  trainerId: string,
  onChange: (availability: TrainerAvailability | null) => void,
  onError?: WatchErrorHandler,
) {
  return live(
    `t:${tenantId}:availability:${trainerId}`,
    async (): Promise<TrainerAvailability | null> => {
      try {
        const a = await apiGet<AvailabilityDto>(`/tenants/${tenantId}/trainers/${await pid(trainerId)}/availability`);
        return {
          tenantId,
          trainerId,
          weekly: a.weekly ?? {},
          slotMinutes: a.slotMinutes ?? 60,
          exceptions: a.exceptions ?? [],
          // GAP(api): the availability DTO has no `updatedAt`. Nothing in the app reads it (the Worker does its own
          // optimistic check on the stored value), so it is the epoch rather than a made-up "now".
          updatedAt: new Date(0),
        };
      } catch (e) {
        // "Never configured" is a normal answer (404), not an error: the screen shows "tanımlamamış".
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    onChange,
    onError,
    { intervalMs: 60_000 },
  );
}

export async function setTrainerAvailability(params: {
  tenantId: string;
  trainerId: string;
  weekly: Partial<Record<Weekday, TimeWindow[]>>;
  slotMinutes: number;
  exceptions: AvailabilityException[];
}): Promise<void> {
  await localized(
    apiPut(`/tenants/${params.tenantId}/trainers/${await pid(params.trainerId)}/availability`, {
      weekly: params.weekly,
      slotMinutes: params.slotMinutes,
      exceptions: params.exceptions,
    }),
  );
  refresh(params.tenantId, `availability:${params.trainerId}`);
}

/**
 * A trainer's booked times for one day, stripped of who booked them (the Worker's `busy` route carries no
 * identity at all). The route lists cancelled sessions out already, and says nothing about whether a session
 * is done, so every slot reads `scheduled`; `computeFreeSlots` only cares about `cancelled`.
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
  return live(
    `t:${tenantId}:busy:${trainerId}:${start.getTime()}`,
    async (): Promise<TrainerBusySlot[]> => {
      const rows = await apiGet<BusyDto[]>(`/tenants/${tenantId}/trainers/${await pid(trainerId)}/busy?from=${start.getTime()}`);
      return rows
        .filter((r) => r.startsAt >= start.getTime() && r.startsAt < end.getTime())
        .map((r) => ({ date: new Date(r.startsAt), durationMinutes: r.durationMinutes, status: 'scheduled' as const }));
    },
    onChange,
    onError,
    { intervalMs: 20_000 },
  );
}
