import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

import { ExerciseReportReason } from '@/data/types';
import { db } from '@/services/firebase';

/**
 * File a report against one of the bundled movement explainers (PER-19).
 *
 * Write-only by design — the rules refuse reads from every client. The
 * explainers ship inside the app, so a report is a message to whoever
 * maintains them, not something the gym administers, and there is no inbox
 * screen for it to feed.
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
  await addDoc(collection(db, 'exercise_reports'), {
    ...params,
    // Trimmed and bounded to match the rule, so a long note is refused here
    // with a message rather than by a permission error the member cannot read.
    note: params.note.trim().slice(0, 500),
    createdAt: serverTimestamp(),
  });
}
