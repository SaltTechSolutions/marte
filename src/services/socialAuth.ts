import * as AppleAuthentication from 'expo-apple-authentication';
import { isSuccessResponse, GoogleSignin } from '@react-native-google-signin/google-signin';
import * as Crypto from 'expo-crypto';
import { GoogleAuthProvider, OAuthProvider, signInWithCredential, updateProfile, UserCredential } from 'firebase/auth';
import { Platform } from 'react-native';

import { auth } from './firebase';

// webClientId is required on both platforms (it's what Firebase verifies the
// idToken's audience against); iosClientId is required on iOS specifically
// since this app has no GoogleService-Info.plist for the native module to
// read its own client id from.
GoogleSignin.configure({
  webClientId: '171027427019-t2lo3pge2dmjs59jtif3sae6urrk44nu.apps.googleusercontent.com',
  iosClientId: '171027427019-1rumv2f5nhlhush6ts0afgfvc54aguj9.apps.googleusercontent.com',
});

export async function signInWithGoogle(): Promise<UserCredential> {
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
