import { collection, deleteField, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { app, db } from '@/services/firebase';

import { OpeningHours, Tenant, TenantBranding, TenantContact } from '../types';
import { tenantFromDoc } from './convert';
import { membershipId } from './membershipRepo';
import { seedDefaultPackages } from './packageRepo';

const functions = getFunctions(app, 'europe-west1');

/** Anything larger is bytes nobody renders — a logo is a list avatar. */
const LOGO_SIZE = 512;

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
 * The gym's public identity: the name members see and the address they walk to.
 *
 * `name` is denormalised onto every `tenant_memberships` doc, so it is NOT
 * enough to write it here — the `syncTenantNameToMemberships` function fans the
 * new name out. Without that the roster keeps showing the old name forever.
 */
export async function updateTenantIdentity(
  tenantId: string,
  identity: { name: string; address?: string },
): Promise<void> {
  await updateDoc(doc(db, 'tenants', tenantId), {
    name: identity.name,
    // Clearing the field is a real intent, so an empty address deletes it
    // rather than being skipped and leaving the old one in place.
    address: identity.address?.trim() || deleteField(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * The gym's own refund window (PKG-11). Lives on the tenant doc rather than
 * in `private/` because the member has to be told the rule before they book —
 * a cancellation policy the member cannot read is not a policy.
 */
export async function updateTenantCancellationHours(tenantId: string, hours: number): Promise<void> {
  await updateDoc(doc(db, 'tenants', tenantId), {
    cancellationHours: hours,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Opening hours live on the tenant doc, not in `private/`: a member deciding
 * whether to walk over needs them, and so does someone still choosing a gym.
 */
export async function updateTenantOpeningHours(tenantId: string, hours: OpeningHours): Promise<void> {
  await updateDoc(doc(db, 'tenants', tenantId), { openingHours: hours, updatedAt: serverTimestamp() });
}

/** Contact details, from the members-only private subdocument. */
export async function getTenantContact(tenantId: string): Promise<TenantContact> {
  const snap = await getDoc(doc(db, 'tenants', tenantId, 'private', 'contact'));
  return snap.exists() ? (snap.data() as TenantContact) : {};
}

export async function updateTenantContact(tenantId: string, contact: TenantContact): Promise<void> {
  await setDoc(
    doc(db, 'tenants', tenantId, 'private', 'contact'),
    {
      phone: contact.phone?.trim() || deleteField(),
      email: contact.email?.trim() || deleteField(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * Uploads a picked logo.
 *
 * Downscaled to 512×512 JPEG before it leaves the phone: the picker hands
 * back the full camera frame (3–5 MB), and nothing in the app ever renders a
 * logo larger than a list avatar. That also keeps the payload well inside
 * what a callable will carry.
 *
 * The bytes go through the `uploadTenantLogo` callable rather than straight
 * to Storage — see that function for why the direct-write rule was the wrong
 * foundation. The temporary file the resize produces is deleted afterwards;
 * the picker's own cached copy is left to the OS, which owns that cache.
 */
export async function uploadTenantLogo(tenantId: string, localUri: string): Promise<string> {
  const resized = await ImageManipulator.manipulateAsync(
    localUri,
    [{ resize: { width: LOGO_SIZE, height: LOGO_SIZE } }],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  try {
    if (!resized.base64) throw new Error('Görsel dönüştürülemedi.');
    const call = httpsCallable<
      { tenantId: string; base64: string; contentType: string },
      { url: string }
    >(functions, 'uploadTenantLogo');
    const res = await call({ tenantId, base64: resized.base64, contentType: 'image/jpeg' });
    return res.data.url;
  } finally {
    // Küçültülmüş kopya yüklendikten sonra cihazda durmasın.
    await FileSystem.deleteAsync(resized.uri, { idempotent: true }).catch(() => {});
  }
}
