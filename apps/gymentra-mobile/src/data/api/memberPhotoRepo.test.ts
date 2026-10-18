import { expect, it, vi } from 'vitest';

// The Worker has no object-storage route yet: photo upload/delete are the existing Firebase callables.
vi.mock('../firebase/memberPhotoRepo', () => ({ uploadMemberPhoto: vi.fn(), deleteMemberPhoto: vi.fn() }));

import * as fb from '../firebase/memberPhotoRepo';
import * as repo from './memberPhotoRepo';

it('uploadMemberPhoto and deleteMemberPhoto are the Firebase implementations, unchanged', () => {
  expect(repo.uploadMemberPhoto).toBe(fb.uploadMemberPhoto);
  expect(repo.deleteMemberPhoto).toBe(fb.deleteMemberPhoto);
});
