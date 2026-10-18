import { NotificationCategory, UserSettings } from '../types';
import type { WatchErrorHandler } from '../firebase/watch';
import { apiGet, apiPatch } from './client';
import { watchPoll } from './membershipWatch';
import { invalidate } from './poll';

/**
 * A person's own preferences, keyed by the person rather than by gym (there is no id in the Worker's path,
 * so no route can name someone else's). An absent row means everything is on: `push` comes back empty.
 * Not tenant-scoped, so the poll key is `me:settings`.
 */
export function watchUserSettings(userId: string, onChange: (settings: UserSettings) => void, onError?: WatchErrorHandler) {
  void userId;
  return watchPoll('me:settings', () => apiGet<UserSettings>('/me/settings'), onChange, onError);
}

export async function setNotificationPreference(userId: string, category: NotificationCategory, enabled: boolean): Promise<void> {
  void userId;
  // The Worker merges: switching one category cannot wipe the others, and the first write creates the row.
  await apiPatch('/me/settings', { push: { [category]: enabled } });
  invalidate('me:settings');
}
