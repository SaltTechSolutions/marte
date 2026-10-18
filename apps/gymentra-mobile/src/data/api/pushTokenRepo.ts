import { apiDelete, apiPut } from './client';

/**
 * A token belongs to a DEVICE, so the Worker moves it to whoever signs in on it (same as overwriting the
 * Firestore doc whose id was the token). The Worker only accepts a well-formed Expo token and a gym the
 * caller is an active member of; anything else is a refusal the caller already handles.
 */
export async function registerPushToken(params: {
  userId: string;
  tenantId: string;
  token: string;
  platform: 'ios' | 'android';
}): Promise<void> {
  await apiPut('/me/push-token', { token: params.token, platform: params.platform, tenantId: params.tenantId });
}

export async function unregisterPushToken(token: string): Promise<void> {
  await apiDelete(`/me/push-token?token=${encodeURIComponent(token)}`);
}
