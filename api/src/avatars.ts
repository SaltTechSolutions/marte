/** The predefined member avatars. Must equal the app's `src/data/avatars.generated.ts` (a test compares them). */
export const AVATAR_IDS = ['rock', 'strength', 'tempo', 'rhythm', 'balance', 'breath', 'shield', 'spark', 'pass', 'unity', 'summit', 'trail'] as const;
export const isAvatarId = (v: unknown): v is (typeof AVATAR_IDS)[number] => typeof v === 'string' && (AVATAR_IDS as readonly string[]).includes(v);
