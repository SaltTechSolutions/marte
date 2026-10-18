import { ExerciseReportReason } from '@/data/types';

import { apiPost } from './client';

/**
 * File a report against one of the bundled movement explainers (PER-19). Write-only; the Worker records it
 * (staff only) and the e-mail to the content owner becomes an outbox job on the server. The reporter is the
 * signed-in user there, so `reportedBy`/`reportedByName` are not sent. There is nothing to refresh.
 */
export async function reportExercise(params: {
  exerciseId: string;
  exerciseName: string;
  tenantId: string;
  reportedBy: string;
  reportedByName?: string;
  reason: ExerciseReportReason;
  note: string;
}): Promise<void> {
  await apiPost(`/tenants/${params.tenantId}/exercise-reports`, {
    exerciseId: params.exerciseId,
    exerciseName: params.exerciseName,
    reason: params.reason,
    note: params.note.trim().slice(0, 500),
  });
}
