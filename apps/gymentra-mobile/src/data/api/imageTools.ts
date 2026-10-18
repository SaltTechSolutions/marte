/**
 * Device-side image preparation for uploads. The native modules are required lazily so a client without
 * them (an old Expo Go) loses only photo/logo upload, never the whole app at startup. Isolated in its own
 * module so tests can replace it (`vi.mock('./imageTools')`) instead of loading native code.
 */
export async function resizeToJpeg(localUri: string, size: number, quality: number): Promise<{ uri: string; base64: string }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ImageManipulator = require('expo-image-manipulator') as typeof import('expo-image-manipulator');
  const resized = await ImageManipulator.manipulateAsync(
    localUri,
    [{ resize: { width: size, height: size } }],
    { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  if (!resized.base64) throw new Error('Görsel dönüştürülemedi.');
  return { uri: resized.uri, base64: resized.base64 };
}

/** The resized copy must not linger on the device after upload. */
export async function dropTemp(uri: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const FileSystem = require('expo-file-system') as typeof import('expo-file-system');
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}
