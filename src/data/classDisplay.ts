import { ClassSession, GymClass } from './types';

/** Maps a raw ClassSession doc + viewer identity to the UI-facing GymClass shape. */
export function toGymClass(session: ClassSession, viewerUid: string | undefined): GymClass {
  const time = session.date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const lengthLabel = `${session.durationMinutes} dk`;
  const remaining = session.capacity - session.bookedUserIds.length;
  const isBooked = !!viewerUid && session.bookedUserIds.includes(viewerUid);
  const waitlistIndex = viewerUid ? session.waitlistUserIds.indexOf(viewerUid) : -1;

  if (isBooked) {
    return {
      id: session.id,
      time,
      lengthLabel,
      name: session.name,
      trainerName: session.trainerName,
      meta: `${session.trainerName} · Rezervasyonun var`,
      metaTone: 'ok',
      status: 'booked',
    };
  }
  if (waitlistIndex >= 0) {
    return {
      id: session.id,
      time,
      lengthLabel,
      name: session.name,
      trainerName: session.trainerName,
      meta: `${session.trainerName} · Bekleme listesinde #${waitlistIndex + 1}`,
      metaTone: 'warn',
      status: 'full',
    };
  }
  if (remaining <= 0) {
    return {
      id: session.id,
      time,
      lengthLabel,
      name: session.name,
      trainerName: session.trainerName,
      meta: `${session.trainerName} · DOLU · listede ${session.waitlistUserIds.length} kişi`,
      metaTone: 'danger',
      status: 'full',
    };
  }
  if (remaining <= 2) {
    return {
      id: session.id,
      time,
      lengthLabel,
      name: session.name,
      trainerName: session.trainerName,
      meta: `${session.trainerName} · ${remaining} yer kaldı`,
      metaTone: 'warn',
      status: 'almostFull',
    };
  }
  return {
    id: session.id,
    time,
    lengthLabel,
    name: session.name,
    trainerName: session.trainerName,
    meta: `${session.trainerName} · ${remaining} yer var`,
    metaTone: 'sub',
    status: 'open',
  };
}
