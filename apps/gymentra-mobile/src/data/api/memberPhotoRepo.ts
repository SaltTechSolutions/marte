import { apiDelete, apiPost } from './client';
import { dropTemp, resizeToJpeg } from './imageTools';

/** An avatar is never drawn larger than this; the picker hands back a 3–5 MB frame. */
const PHOTO_SIZE = 512;

/**
 * Crop (done in the picker), downscale to a 512 px JPEG, send it to the Worker (R2), delete the resized temp
 * file. Same contract as the Firebase callable: returns the public URL; the screen then stores it with
 * `updateMemberDetails({ photoUrl })`. The Worker keeps one photo per person (a new upload replaces the old).
 */
export async function uploadMemberPhoto(localUri: string): Promise<string> {
  const resized = await resizeToJpeg(localUri, PHOTO_SIZE, 0.8);
  try {
    return (await apiPost<{ url: string }>('/me/photo', { base64: resized.base64 })).url;
  } finally {
    await dropTemp(resized.uri);
  }
}

export async function deleteMemberPhoto(): Promise<void> {
  await apiDelete('/me/photo');
}
