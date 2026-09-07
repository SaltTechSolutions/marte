import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from '@/services/firebase';

/** Doc id is the token itself — re-registering the same device just overwrites. */
export async function registerPushToken(params: {
  userId: string;
  tenantId: string;
  token: string;
  platform: 'ios' | 'android';
}): Promise<void> {
  await setDoc(doc(db, 'push_tokens', params.token), {
    userId: params.userId,
    tenantId: params.tenantId,
    platform: params.platform,
    updatedAt: serverTimestamp(),
  });
}

export async function unregisterPushToken(token: string): Promise<void> {
  await deleteDoc(doc(db, 'push_tokens', token));
}
