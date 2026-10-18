import { sendPasswordResetEmail } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { BACKEND } from '@/data/backend';
import { app, auth } from '@/services/firebase';

const functions = getFunctions(app, 'europe-west1');

/**
 * Asks for a password-reset link (PER-2).
 *
 * Goes through a callable rather than the SDK's own `sendPasswordResetEmail`
 * so the mail comes from our verified domain in Turkish — see
 * `backend/functions/src/passwordReset.ts`.
 *
 * The server answers the same way whether or not the address has an account,
 * so this cannot report "no such user" and the screen must not imply it: the
 * whole point is that a caller cannot use it to discover who is a member.
 *
 * `retryAfterSeconds` comes back when the request was rate limited and NOT
 * sent. Safe to show: the limits ignore account existence, so it reveals only
 * that this address was asked for recently — which the person asking already
 * knows. Without surfacing it the screen claimed "sent" for a mail that never
 * left, and the member waited for an e-mail that was never coming.
 */
export async function requestPasswordReset(email: string): Promise<{ retryAfterSeconds?: number }> {
  if (BACKEND === 'api') {
    // The Cloud Function (custom Turkish mail from our domain + per-address/IP throttling) goes away with
    // Firebase Functions. Firebase Auth itself still sends the reset mail and rate-limits it: the template
    // language/sender are set in the Firebase console (Authentication > Templates). Same non-disclosure rule:
    // an unknown address looks exactly like a sent one.
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'auth/too-many-requests') return { retryAfterSeconds: 300 };
      if (code !== 'auth/user-not-found' && code !== 'auth/invalid-email') throw e;
    }
    return {};
  }
  const call = httpsCallable<{ email: string }, { ok: boolean; retryAfterSeconds?: number }>(
    functions,
    'requestPasswordReset',
  );
  const { data } = await call({ email: email.trim() });
  return { retryAfterSeconds: data?.retryAfterSeconds };
}
