// The Worker has no object-storage route yet (R2 + signed URL is undecided, docs/KARAR-DEFTERI "bilerek yapılmadı").
// Photo upload/delete therefore stay on the Firebase callables. They only touch Storage (`members/{uid}/avatar.jpg`,
// keyed by the Firebase uid, which stays valid because Firebase Auth stays); the screen then stores the returned URL
// through `updateMemberDetails({ photoUrl })`, which the Worker supports. So this works in BACKEND=api as is.
export { uploadMemberPhoto, deleteMemberPhoto } from '../firebase/memberPhotoRepo';
