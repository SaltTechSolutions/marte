import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { db, storage } from '@/services/firebase';

import { Tenant, TenantBranding } from '../types';
import { tenantFromDoc } from './convert';
import { membershipId } from './membershipRepo';
import { seedDefaultPackages } from './packageRepo';

/** Look up a gym by its join code (e.g. "TARABYA-01"). Case-insensitive. */
export async function findTenantByCode(code: string): Promise<Tenant | null> {
  const cleanCode = code.trim().toUpperCase();
  const snap = await getDocs(query(collection(db, 'tenants'), where('code', '==', cleanCode)));
  if (snap.empty) return null;
  return tenantFromDoc(snap.docs[0]);
}

export async function getTenant(tenantId: string): Promise<Tenant | null> {
  const snap = await getDoc(doc(db, 'tenants', tenantId));
  if (!snap.exists()) return null;
  return tenantFromDoc(snap);
}

/**
 * Creates a brand-new gym and immediately grants its creator an active
 * admin membership. Two sequential (not batched) writes on purpose: the
 * membership create rule checks `get(tenants/tenantId).data.ownerUid`,
 * which needs the tenant doc to already be committed server-side — a batch
 * doesn't guarantee that read sees the batch's own pending write.
 */
export async function createTenantWithOwner(params: {
  name: string;
  code: string;
  branding: TenantBranding;
  ownerUid: string;
}): Promise<Tenant> {
  const cleanCode = params.code.trim().toUpperCase();
  const existing = await findTenantByCode(cleanCode);
  if (existing) throw new Error('CODE_TAKEN');

  const tenantRef = doc(collection(db, 'tenants'));
  const tenantData = {
    name: params.name.trim(),
    code: cleanCode,
    branding: params.branding,
    ownerUid: params.ownerUid,
    createdAt: serverTimestamp(),
  };
  await setDoc(tenantRef, tenantData);

  await setDoc(doc(db, 'tenant_memberships', membershipId(tenantRef.id, params.ownerUid)), {
    userId: params.ownerUid,
    tenantId: tenantRef.id,
    tenantCode: cleanCode,
    tenantName: tenantData.name,
    status: 'active',
    roles: ['admin'],
    permissions: [],
    requestedAt: serverTimestamp(),
    approvedAt: serverTimestamp(),
  });

  // Best-effort: an admin with an empty catalog can still add packages by
  // hand, so this must not fail gym creation itself.
  await seedDefaultPackages(tenantRef.id).catch((e) => console.warn('[tenantRepo] Varsayılan paketler oluşturulamadı:', e));

  return { id: tenantRef.id, ...tenantData, createdAt: new Date() };
}

/** Admin settings screen "Kaydet" — writes the tenant's live branding. */
export async function updateTenantBranding(tenantId: string, branding: TenantBranding): Promise<void> {
  await updateDoc(doc(db, 'tenants', tenantId), { branding, updatedAt: serverTimestamp() });
}

/**
 * Uploads a picked logo image to Storage and returns its public download URL.
 * Path is deterministic (`tenant-logos/{tenantId}`) so re-uploading replaces
 * the previous logo instead of accumulating orphaned files.
 */
export async function uploadTenantLogo(tenantId: string, localUri: string): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const logoRef = ref(storage, `tenant-logos/${tenantId}`);
  await uploadBytes(logoRef, blob, { contentType: blob.type || 'image/jpeg' });
  return getDownloadURL(logoRef);
}
