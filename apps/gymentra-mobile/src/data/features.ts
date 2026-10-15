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
 * Turn it on only when the server side it needs is deployed.
 */
export const FEATURES = {
  managedMembers: false,
} as const;
