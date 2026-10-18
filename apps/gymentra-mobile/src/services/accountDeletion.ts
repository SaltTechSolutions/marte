import { deleteUser } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { apiPost } from '@/data/api/client';
import { BACKEND } from '@/data/backend';

import { app, auth } from './firebase';

// Functions are deployed to europe-west1, same as the rest of the project.
const functions = getFunctions(app, 'europe-west1');

/** What `POST /v1/me/delete-account` answers (api/src/account.ts). */
interface ApiDeletion {
  deleted: boolean;
  authDeletionRequired?: boolean;
  alreadyDeleted?: boolean;
}

/**
 * Deletes the signed-in user's account and personal data.
 *
 * Firebase mode: one callable (`deleteMyAccount`) that does everything server-side.
 * API mode: the Worker erases the D1 data (and refuses with `failed-precondition` when the caller is the
 * only admin of a gym); the identity lives outside D1, so the client finishes the job by deleting the
 * Firebase Auth user itself. Auth deletion needs a recent sign-in; if Firebase asks for one, the error propagates with `auth/requires-recent-login` and
 * the SAME call can simply be repeated after signing in again - the Worker answers `alreadyDeleted`.
 */
export async function deleteMyAccount(): Promise<void> {
  if (BACKEND !== 'api') {
    const call = httpsCallable<void, { deleted: boolean }>(functions, 'deleteMyAccount');
    await call();
    return;
  }
  const res = await apiPost<ApiDeletion>('/me/delete-account', { confirm: true });
  const user = auth.currentUser;
  if (!res.deleted && !res.alreadyDeleted) return;
  if (user) await deleteUser(user);
}
