'use strict';

/**
 * Deletes every member profile photo (decision of 18 Oct 2026: profile photos are removed from GymEntra;
 * members pick one of 12 predefined avatars instead).
 *
 *  1. Storage: every object under `members/` in the project's default bucket (`members/{uid}/avatar.jpg`).
 *     The gym LOGOS live under `tenants/` and are NOT touched.
 *  2. Firestore: the `photoUrl` field of every `tenant_memberships` doc that has one.
 *
 * IRREVERSIBLE. Dry-run by default: it only counts and lists. `--apply` performs the deletions.
 * The project must be named on the command line and must match the service account's project, so this can
 * never run against the wrong project by accident (the CLI alias has pointed at a different project before).
 *
 *   node scripts/delete_member_photos.cjs --project tarabyamarte                # dry run
 *   node scripts/delete_member_photos.cjs --project tarabyamarte --apply        # really delete
 *   optional: --bucket <name>   (default: <project>.firebasestorage.app, falling back to <project>.appspot.com)
 *
 * Safe to re-run: nothing left to delete is a no-op.
 */

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.resolve(__dirname, '../secrets/serviceAccount.json');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function findBucket(storage, project) {
  const candidates = [arg('bucket'), `${project}.firebasestorage.app`, `${project}.appspot.com`].filter(Boolean);
  for (const name of candidates) {
    const [exists] = await storage.bucket(name).exists();
    if (exists) return storage.bucket(name);
  }
  console.error('Storage bucket bulunamadı; denenenler:', candidates.join(', '), '— --bucket ile ver.');
  process.exit(1);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const project = arg('project');
  if (!project) {
    console.error('--project zorunlu (ör. --project tarabyamarte).');
    process.exit(1);
  }
  const sa = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
  if (sa.project_id !== project) {
    console.error(`Service account projesi "${sa.project_id}", istenen "${project}": durduruldu.`);
    process.exit(1);
  }
  if (!getApps().length) initializeApp({ credential: cert(sa) });

  console.log(`Proje: ${project}`);
  console.log(apply ? 'UYGULAMA MODU — silme yapılacak (GERİ ALINAMAZ)' : 'KURU ÇALIŞTIRMA — hiçbir şey silinmeyecek');

  // 1. Storage
  const bucket = await findBucket(getStorage(), project);
  const [files] = await bucket.getFiles({ prefix: 'members/' });
  const bytes = files.reduce((n, f) => n + Number(f.metadata.size || 0), 0);
  console.log(`\nStorage (${bucket.name}): members/ altında ${files.length} nesne, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
  files.slice(0, 10).forEach((f) => console.log('  ', f.name));
  if (files.length > 10) console.log(`   … ve ${files.length - 10} tane daha`);
  if (apply) {
    for (const f of files) await f.delete({ ignoreNotFound: true });
    console.log(`SİLİNDİ: ${files.length} nesne`);
  }

  // 2. Firestore photoUrl fields
  const db = getFirestore();
  const snap = await db.collection('tenant_memberships').get();
  const withPhoto = snap.docs.filter((d) => typeof d.data().photoUrl === 'string' && d.data().photoUrl);
  console.log(`\nFirestore: ${snap.size} üyelik kaydı, ${withPhoto.length} tanesinde photoUrl var`);
  if (apply) {
    for (let i = 0; i < withPhoto.length; i += 400) {
      const batch = db.batch();
      withPhoto.slice(i, i + 400).forEach((d) => batch.update(d.ref, { photoUrl: FieldValue.delete() }));
      await batch.commit();
    }
    console.log(`TEMİZLENDİ: ${withPhoto.length} kayıt`);
  }

  // Verify after applying: re-read, never trust the writes.
  if (apply) {
    const [left] = await bucket.getFiles({ prefix: 'members/' });
    const after = await db.collection('tenant_memberships').get();
    const stillThere = after.docs.filter((d) => d.data().photoUrl).length;
    console.log(`\nDoğrulama: Storage'da kalan ${left.length} nesne, photoUrl'u kalan ${stillThere} kayıt`);
    if (left.length || stillThere) process.exitCode = 1;
  } else {
    console.log('\nKuru çalıştırma bitti. Silmek için aynı komuta --apply ekle.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
