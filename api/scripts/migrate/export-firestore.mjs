#!/usr/bin/env node
// READ-ONLY Firestore exporter for the GymEntra -> D1 migration.
//
//   npm i --no-save firebase-admin        # NOT a dependency of api/: install it for this run only
//   node export-firestore.mjs --project tarabyamarte --out ./export-2026-10-18 [--credentials sa.json] [--with-auth]
//
// It only ever calls .get(), .listCollections(), .listDocuments() and Auth getUsers(). It never writes to
// Firestore (test/migrate.test.ts greps this file for write methods). Credentials: Application Default
// Credentials (gcloud auth application-default login), or a service-account JSON via --credentials.
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync, createWriteStream } from 'node:fs';
import { resolve, join } from 'node:path';
import { once } from 'node:events';
import { parseArgs } from 'node:util';

import { EPHEMERAL_ROOTS, EXPORT_COLLECTIONS, LEGACY_ROOTS, serializeDoc } from './lib/serialize.mjs';

const PAGE = 300;

function usage(code) {
  console.log('usage: node export-firestore.mjs --project <firebase-project-id> --out <dir> [--credentials <service-account.json>] [--with-auth] [--overwrite]');
  process.exit(code);
}

async function loadAdmin() {
  try {
    const [app, fs, auth] = await Promise.all([import('firebase-admin/app'), import('firebase-admin/firestore'), import('firebase-admin/auth')]);
    return { app, fs, auth };
  } catch (e) {
    console.error(`firebase-admin is not installed (${e.code ?? e.message}).\nInstall it for this run only, without touching package.json:\n  cd api && npm i --no-save firebase-admin`);
    process.exit(2);
  }
}

async function writeCollection(query, file, extra = () => ({})) {
  const tmp = file + '.tmp';
  const out = createWriteStream(tmp, { encoding: 'utf8' });
  let n = 0; let last = null;
  for (;;) {
    let q = query.orderBy('__name__').limit(PAGE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const d of snap.docs) {
      if (!out.write(serializeDoc(d, extra(d)) + '\n')) await once(out, 'drain');
      n++;
    }
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE) break;
  }
  out.end(); await once(out, 'finish');
  renameSync(tmp, file);
  return n;
}

async function main() {
  const { values } = parseArgs({
    options: { project: { type: 'string' }, out: { type: 'string' }, credentials: { type: 'string' }, 'with-auth': { type: 'boolean', default: false }, overwrite: { type: 'boolean', default: false }, help: { type: 'boolean' } },
  });
  if (values.help) usage(0);
  if (!values.project) { console.error('refusing to run: --project is required (no default project, on purpose)'); usage(2); }
  if (!values.out) { console.error('--out is required'); usage(2); }
  if (process.env.FIRESTORE_EMULATOR_HOST) { console.error('refusing to run: FIRESTORE_EMULATOR_HOST is set, this would export from an emulator, not from the project'); process.exit(2); }

  const out = resolve(values.out);
  mkdirSync(out, { recursive: true });
  if (!values.overwrite && readdirSync(out).some((f) => f.endsWith('.jsonl') || f === 'manifest.json')) {
    console.error(`refusing to run: ${out} already holds an export (use a fresh directory, or --overwrite)`); process.exit(2);
  }

  const { app, fs, auth } = await loadAdmin();
  const credential = values.credentials ? app.cert(JSON.parse(readFileSync(resolve(values.credentials), 'utf8'))) : app.applicationDefault();
  app.initializeApp({ credential, projectId: values.project });
  const db = fs.getFirestore();

  console.log(`READ-ONLY export of Firestore project "${values.project}" (${values.credentials ? 'service account file' : 'Application Default Credentials'})`);
  console.log(`output: ${out}`);

  const manifest = { project: values.project, startedAt: new Date().toISOString(), tool: 'export-firestore.mjs', collections: {}, notes: [] };

  // Anything at the root we do not know about is reported, never silently skipped.
  const roots = (await db.listCollections()).map((c) => c.id);
  const unknown = roots.filter((r) => !EXPORT_COLLECTIONS.includes(r) && !LEGACY_ROOTS.includes(r) && !EPHEMERAL_ROOTS.includes(r));
  manifest.rootCollections = roots;
  if (unknown.length) { manifest.notes.push(`unknown root collections not exported: ${unknown.join(', ')}`); console.warn(`WARNING unknown root collections (not exported): ${unknown.join(', ')}`); }

  for (const name of EXPORT_COLLECTIONS) {
    const n = await writeCollection(db.collection(name), join(out, `${name}.jsonl`));
    manifest.collections[name] = n;
    console.log(`  ${name.padEnd(28)} ${n}`);
  }

  // tenants/{id}/private/*  ->  tenants__private.jsonl  (each line carries __tenantId)
  const tmp = join(out, 'tenants__private.jsonl');
  const stream = createWriteStream(tmp + '.tmp', { encoding: 'utf8' });
  let priv = 0;
  for (const tRef of await db.collection('tenants').listDocuments()) {
    const snap = await tRef.collection('private').get();
    for (const d of snap.docs) { stream.write(serializeDoc(d, { __tenantId: tRef.id }) + '\n'); priv++; }
  }
  stream.end(); await once(stream, 'finish'); renameSync(tmp + '.tmp', tmp);
  manifest.collections['tenants__private'] = priv;
  console.log(`  ${'tenants__private'.padEnd(28)} ${priv}`);

  if (values['with-auth']) {
    // Only the accounts that hold a membership are looked up (never a full user listing: the project is shared
    // with the marte06 web app). Password hashes are not requested, copied or written.
    const memberships = readFileSync(join(out, 'tenant_memberships.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const guardians = memberships.map((m) => m.guardianId).filter(Boolean);
    const uids = [...new Set([...memberships.map((m) => m.userId), ...guardians].filter((u) => typeof u === 'string' && !/^mm[0-9a-f]{20}$/.test(u)))].sort();
    const lines = [];
    for (let i = 0; i < uids.length; i += 100) {
      const res = await auth.getAuth().getUsers(uids.slice(i, i + 100).map((uid) => ({ uid })));
      for (const u of res.users) {
        lines.push(JSON.stringify({ __id: u.uid, email: u.email ?? null, displayName: u.displayName ?? null, createdAtMs: Date.parse(u.metadata.creationTime), disabled: u.disabled }));
      }
    }
    writeFileSync(join(out, 'auth_users.jsonl'), lines.map((l) => l + '\n').join(''));
    manifest.collections['auth_users'] = lines.length;
    console.log(`  ${'auth_users'.padEnd(28)} ${lines.length} of ${uids.length} looked up`);
  }

  manifest.finishedAt = new Date().toISOString();
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`done. manifest.json written. This directory contains personal data: keep it out of git and delete it when the migration is verified.`);
}

main().catch((e) => { console.error(e.stack ?? e.message); process.exit(1); });
