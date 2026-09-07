import { getFunctions, httpsCallable } from 'firebase/functions';

import { app } from './firebase';

// Functions are deployed to europe-west1, same as the rest of the project.
const functions = getFunctions(app, 'europe-west1');

/**
 * Deletes the signed-in user's account and personal data.
 *
 * Server-side on purpose: security rules deliberately forbid the client from
 * deleting measurements/workout logs/payments, so a phone in the wrong hands
 * can't rewrite history. See `deleteMyAccount` in backend/functions.
 *
 * Throws with `failed-precondition` when the caller is the only remaining
 * admin of a gym — deleting them would leave it unmanageable.
 */
export async function deleteMyAccount(): Promise<void> {
  const call = httpsCallable<void, { deleted: boolean }>(functions, 'deleteMyAccount');
  await call();
}
