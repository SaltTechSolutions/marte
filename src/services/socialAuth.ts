import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { GoogleAuthProvider, OAuthProvider, signInWithCredential, updateProfile, UserCredential } from 'firebase/auth';
import { Platform } from 'react-native';

import { auth } from './firebase';

type GoogleModule = typeof import('@react-native-google-signin/google-signin');
let google: GoogleModule | null = null;

/**
 * Loaded on first use, not at import.
 *
 * `@react-native-google-signin/google-signin` calls
 * `TurboModuleRegistry.getEnforcing` in its own module scope, so merely
 * importing it throws wherever the native module is absent — which is every
 * Expo Go client. `onboarding/register` imports this file and expo-router
 * loads every route, so one missing native module took the whole app down at
 * startup and left `scripts/sim.sh` (which runs against Expo Go) with nothing
 * to open. Deferring the require keeps the app bootable there; the Google
 * button then fails on tap instead, which `register.tsx` already handles.
 *
 * `configure` is part of the same lazy step — it needs the native module too,
 * and running it at import time was the second half of the same problem.
 * webClientId is required on both platforms (it's what Firebase verifies the
 * idToken's audience against); iosClientId is required on iOS specifically
 * since this app has no GoogleService-Info.plist for the native module to
 * read its own client id from.
 */
function loadGoogle(): GoogleModule {
  if (!google) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    google = require('@react-native-google-signin/google-signin') as GoogleModule;
    google.GoogleSignin.configure({
      webClientId: '171027427019-t2lo3pge2dmjs59jtif3sae6urrk44nu.apps.googleusercontent.com',
      iosClientId: '171027427019-1rumv2f5nhlhush6ts0afgfvc54aguj9.apps.googleusercontent.com',
    });
  }
  return google;
}

export async function signInWithGoogle(): Promise<UserCredential> {
  const { GoogleSignin, isSuccessResponse } = loadGoogle();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response) || !response.data.idToken) {
    throw new Error('GOOGLE_SIGN_IN_CANCELLED');
  }
  const credential = GoogleAuthProvider.credential(response.data.idToken);
  return signInWithCredential(auth, credential);
}

export function isAppleSignInAvailable(): boolean {
  return Platform.OS === 'ios';
}

/**
 * Native "Sign in with Apple". Firebase verifies the identity token's `aud`
 * claim against the provider's configured clientId — for the native flow
 * that's the app's own bundle id (com.gymentra.mobile), not a Services ID.
 */
export async function signInWithApple(): Promise<UserCredential> {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  const appleCredential = await AppleAuthentication.signInAsync({
    requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    nonce: hashedNonce,
  });

  if (!appleCredential.identityToken) throw new Error('APPLE_SIGN_IN_NO_TOKEN');

  const provider = new OAuthProvider('apple.com');
  const firebaseCredential = provider.credential({
    idToken: appleCredential.identityToken,
    rawNonce,
  });
  const userCredential = await signInWithCredential(auth, firebaseCredential);

  // Apple only ever sends the name on the FIRST authorization — capture it
  // now or it's gone for good on future sign-ins from the same device.
  const fullName = [appleCredential.fullName?.givenName, appleCredential.fullName?.familyName].filter(Boolean).join(' ').trim();
  if (fullName && !userCredential.user.displayName) {
    await updateProfile(userCredential.user, { displayName: fullName });
  }

  return userCredential;
}
