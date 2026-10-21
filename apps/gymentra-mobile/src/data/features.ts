import { BACKEND } from '@/data/backend';

/**
 * Features whose server side is not live yet.
 *
 * `managedMembers` — manual (account-less) members, the admin's private note,
 * addresses, and the rule that an admin edits only members they created. Its
 * backend (rules + `createManagedMember`) is committed but deliberately NOT
 * deployed to Firebase (decision of 15 Oct 2026: the backend is moving to
 * Cloudflare, see docs/CLOUDFLARE-GECIS.md). With the flag off the app keeps
 * the behaviour the deployed rules still allow: an admin edits name, phone and
 * birth date of any member, and none of the new screens or fields appear.
 * The Worker implements all of it, so the flag follows the backend: on in API
 * mode, off in Firebase mode (whose deployed rules still lack it).
 *
 * `avatars` — the 12 predefined member avatars (18 Oct 2026, replacing member
 * photos). Only the Worker has a field for them; Firestore has no rule or
 * field, so in Firebase mode the picker is hidden and initials are shown.
 */
export const FEATURES = {
  managedMembers: BACKEND === 'api',
  avatars: BACKEND === 'api',
} as const;
