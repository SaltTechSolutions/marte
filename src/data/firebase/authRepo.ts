import { getFunctions, httpsCallable } from 'firebase/functions';

import { app } from '@/services/firebase';

const functions = getFunctions(app, 'europe-west1');

/**
 * Asks for a password-reset link (PER-2).
 *
 * Goes through a callable rather than the SDK's own `sendPasswordResetEmail`
 * so the mail comes from our verified domain in Turkish — see
 * `marte06/functions/src/passwordReset.ts`.
 *
 * The server answers the same way whether or not the address has an account,
 * so this cannot report "no such user" and the screen must not imply it: the
 * whole point is that a caller cannot use it to discover who is a member.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const call = httpsCallable<{ email: string }, { ok: boolean }>(functions, 'requestPasswordReset');
  await call({ email: email.trim() });
}
