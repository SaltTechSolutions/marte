import * as FileSystem from 'expo-file-system';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { app } from '@/services/firebase';

const functions = getFunctions(app, 'europe-west1');

/** An avatar is never drawn larger than this; the picker hands back a 3–5 MB frame. */
const PHOTO_SIZE = 512;

/**
 * Crop (done in the picker), downscale to 512 JPEG, send through the
 * callable, delete the resized temp file. The full-resolution frame the
 * person picked must not linger in the app's cache after the upload.
 */
export async function uploadMemberPhoto(localUri: string): Promise<string> {
  // Required lazily: a client without the native module loses only photo
  // upload, not the whole app at startup (same discipline as the logo).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ImageManipulator = require('expo-image-manipulator') as typeof import('expo-image-manipulator');
  const resized = await ImageManipulator.manipulateAsync(
    localUri,
    [{ resize: { width: PHOTO_SIZE, height: PHOTO_SIZE } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  try {
    if (!resized.base64) throw new Error('Görsel dönüştürülemedi.');
    const call = httpsCallable<{ base64: string }, { url: string }>(functions, 'uploadMemberPhoto');
    const res = await call({ base64: resized.base64 });
    return res.data.url;
  } finally {
    await FileSystem.deleteAsync(resized.uri, { idempotent: true }).catch(() => {});
  }
}

export async function deleteMemberPhoto(): Promise<void> {
  const call = httpsCallable<Record<string, never>, { ok: boolean }>(functions, 'deleteMemberPhoto');
  await call({});
}
