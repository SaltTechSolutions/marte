/**
 * Which backend the app talks to. `firebase` = Firestore + Cloud Functions (today's production);
 * `api` = the Cloudflare Worker (docs/CLOUDFLARE-GECIS.md). Firebase Auth is the identity provider in
 * BOTH modes. Chosen at build time so one store release cuts over (decision: build in parallel,
 * switch once). Default stays `firebase` until the cutover release.
 */
export const BACKEND: 'firebase' | 'api' = process.env.EXPO_PUBLIC_BACKEND === 'api' ? 'api' : 'firebase';
