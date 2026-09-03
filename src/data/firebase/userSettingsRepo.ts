import { doc, setDoc } from 'firebase/firestore';

import { db } from '@/services/firebase';

import { NotificationCategory, UserSettings } from '../types';
import { WatchErrorHandler, watchDoc } from './watch';

/**
 * A person's own preferences, keyed by uid rather than by membership: the
 * phone belongs to the person, and someone who trains at two gyms should not
 * have to mute the same category twice.
 */
export function watchUserSettings(
  userId: string,
  onChange: (settings: UserSettings) => void,
  onError?: WatchErrorHandler,
) {
  return watchDoc(
    'Bildirim tercihleri',
    doc(db, 'user_settings', userId),
    // An absent document means everything is on. The server reads it the same
    // way, so a person who never opened this screen keeps getting everything.
    (snap) => ({ push: (snap.data()?.push ?? {}) as Record<string, boolean> }),
    onChange,
    onError,
  );
}

export async function setNotificationPreference(
  userId: string,
  category: NotificationCategory,
  enabled: boolean,
): Promise<void> {
  // `merge` so switching one category cannot wipe the others, and so the
  // first write creates the document without needing a separate branch.
  await setDoc(doc(db, 'user_settings', userId), { push: { [category]: enabled } }, { merge: true });
}
