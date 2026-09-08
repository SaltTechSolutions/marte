#!/usr/bin/env node
/**
 * Google Play Console istemcisi — `/play` skill'inin elleri.
 *
 * Play'in ASC'den ayrıldığı yer: yazma işlemleri "edit" denen bir işlem
 * kabında yapılıyor. Önce edit açılıyor, değişiklikler ona yazılıyor, sonra
 * commit ediliyor — commit edilmeyen edit hiçbir şeyi değiştirmiyor. Bu
 * dosya bunu şöyle kullanıyor: OKUMA komutları edit açar ve commit ETMEZ
 * (böylece hiçbir okuma mağazayı değiştiremez), yazma komutları açıkça
 * commit eder.
 *
 * Kimlik: `eas.json`'daki servis hesabı (secrets/play-service-account.json).
 * Anahtar hiçbir çıktıya yazılmaz.
 */

import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

function config() {
  const eas = JSON.parse(readFileSync(join(ROOT, 'eas.json'), 'utf8'));
  const android = eas.submit?.production?.android;
  if (!android) throw new Error('eas.json içinde submit.production.android yok');
  const key = JSON.parse(readFileSync(join(ROOT, android.serviceAccountKeyPath), 'utf8'));
  const app = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'));
  const pkg = app.expo?.android?.package;
  if (!pkg) throw new Error('app.json içinde android.package yok');
  return { key, pkg, track: android.track ?? 'internal' };
}

/** Servis hesabı JWT'sini erişim jetonuyla takas eder. */
async function accessToken({ key }) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'RS256', typ: 'JWT' });
  const body = b64({ iss: key.client_email, scope: SCOPE, aud: key.token_uri, iat: now, exp: now + 3600 });
  const signer = createSign('RSA-SHA256');
  signer.update(`${head}.${body}`);
  const jwt = `${head}.${body}.${signer.sign(key.private_key).toString('base64url')}`;
  const res = await fetch(key.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`jeton alınamadı: ${json.error_description || JSON.stringify(json)}`);
  return json.access_token;
}

let TOKEN = null;
async function call(path, { method = 'GET', body } = {}) {
  const cfg = config();
  TOKEN ??= await accessToken(cfg);
  const res = await fetch(API + path, {
    method,
    headers: { authorization: `Bearer ${TOKEN}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}\n  ${json.error?.message || text}`);
  return json;
}

const cfgPkg = () => config().pkg;

/** Okuma için edit: açılır, kullanılır, COMMIT EDİLMEZ. */
async function withEdit(fn, { commit = false } = {}) {
  const pkg = cfgPkg();
  const edit = await call(`/applications/${pkg}/edits`, { method: 'POST' });
  try {
    const out = await fn(edit.id, pkg);
    if (commit) {
      await call(`/applications/${pkg}/edits/${edit.id}:commit`, { method: 'POST' });
      console.log('✓ değişiklik Play\'e işlendi');
    }
    return out;
  } catch (e) {
    // Commit edilmeyen edit kendiliğinden düşüyor; yine de açık bırakmayalım.
    await call(`/applications/${pkg}/edits/${edit.id}`, { method: 'DELETE' }).catch(() => {});
    throw e;
  }
}

async function status() {
  await withEdit(async (editId, pkg) => {
    const tracks = await call(`/applications/${pkg}/edits/${editId}/tracks`);
    console.log(`\n${pkg}\n\nKANALLAR`);
    (tracks.tracks ?? []).forEach((t) => {
      console.log(`  ${t.track}`);
      (t.releases ?? []).forEach((r) => {
        const pct = r.userFraction ? ` · %${Math.round(r.userFraction * 100)}` : '';
        console.log(`      ${(r.name ?? '').padEnd(14)} ${r.status}${pct}  sürüm kodu: ${(r.versionCodes ?? []).join(', ') || '—'}`);
        // Sürüm notu, TestFlight'taki "neyi test edin"in Play karşılığı.
        const notes = r.releaseNotes ?? [];
        if (!notes.length) console.log('        sürüm notu: (yok)');
        notes.forEach((n) => console.log(`        sürüm notu (${n.language}): ${n.text.replace(/\n/g, ' ').slice(0, 90)}`));
      });
      if (!t.releases?.length) console.log('      (sürüm yok)');
    });

    const bundles = await call(`/applications/${pkg}/edits/${editId}/bundles`).catch(() => ({ bundles: [] }));
    console.log('\nYÜKLENEN PAKETLER');
    (bundles.bundles ?? []).slice(-6).forEach((b) => console.log(`  sürüm kodu ${b.versionCode}`));
    if (!bundles.bundles?.length) console.log('  (yok)');
    console.log('');
  });
}

/** Mağaza girişi: başlık, kısa ve uzun açıklama. */
async function listing(patchJson) {
  await withEdit(
    async (editId, pkg) => {
      const list = await call(`/applications/${pkg}/edits/${editId}/listings`);
      if (!patchJson) {
        console.log('\nMAĞAZA GİRİŞİ');
        (list.listings ?? []).forEach((l) => {
          console.log(`\n  ${l.language}`);
          console.log(`    başlık        : ${l.title || '(boş)'} (${(l.title || '').length}/30)`);
          console.log(`    kısa açıklama : ${l.shortDescription || '(boş)'} (${(l.shortDescription || '').length}/80)`);
          console.log(`    uzun açıklama : ${(l.fullDescription || '(boş)').slice(0, 120)}… (${(l.fullDescription || '').length}/4000)`);
        });
        if (!list.listings?.length) console.log('  (hiç giriş yok)');
        console.log('');
        return;
      }
      const patch = JSON.parse(patchJson);
      const lang = patch.language ?? 'tr-TR';
      delete patch.language;
      await call(`/applications/${pkg}/edits/${editId}/listings/${lang}`, { method: 'PUT', body: { language: lang, ...patch } });
      console.log(`✓ ${lang} girişi yazıldı: ${Object.keys(patch).join(', ')}`);
    },
    { commit: !!patchJson },
  );
}

/** Grafikler: hangi tür yüklü, hangisi eksik. */
async function images(language = 'tr-TR') {
  const TYPES = ['icon', 'featureGraphic', 'phoneScreenshots', 'sevenInchScreenshots', 'tenInchScreenshots'];
  await withEdit(async (editId, pkg) => {
    console.log(`\nGRAFİKLER · ${language}`);
    for (const type of TYPES) {
      const res = await call(`/applications/${pkg}/edits/${editId}/listings/${language}/${type}`).catch(() => ({ images: [] }));
      const n = (res.images ?? []).length;
      console.log(`  ${type.padEnd(22)} ${n ? `${n} adet` : '— EKSİK'}`);
    }
    console.log('');
  });
}

/**
 * Sürüm notu — Play'in "neyi test edin" alanı. Metinsiz çağrılınca okur.
 *
 * Not, sürümün kendisinde durur; ayrı bir uç nokta yok. Bu yüzden yazma
 * işlemi kanalı okuyup **mevcut sürümü olduğu gibi geri gönderiyor**, yalnızca
 * `releaseNotes` alanını değiştirerek: `tracks.patch` gövdedeki `releases`
 * dizisinin tamamını yerine koyar, eksik alan gönderirsek sürüm kodunu ya da
 * durumu düşürürüz.
 */
async function notes(track = 'internal', text, ...rest) {
  const LIMIT = 500; // Play'in dil başına sürüm notu sınırı.
  const lang = 'tr-TR';

  // Kanal metnini serbestçe düzeltmek yalnızca iç testte güvenli. Üretimde
  // notu değiştirmek yayındaki sürümün açıklamasını değiştirmek demek —
  // /play skill'i bunu "önce sorulur" listesine koyuyor.
  if (text && track !== 'internal' && !rest.includes('--onaylandi')) {
    throw new Error(
      `'${track}' kanalı iç test değil; yayındaki sürüm notunu değiştirmek kullanıcı onayı ister.\n` +
        "  Onay alındıysa komutun sonuna --onaylandi ekleyin.",
    );
  }

  if (text && [...text].length > LIMIT) {
    throw new Error(`sürüm notu ${[...text].length} karakter, Play sınırı ${LIMIT}`);
  }

  await withEdit(
    async (editId, pkg) => {
      const t = await call(`/applications/${pkg}/edits/${editId}/tracks/${track}`);
      const releases = t.releases ?? [];
      if (!releases.length) throw new Error(`'${track}' kanalında sürüm yok`);
      if (!text) {
        console.log(`\nSÜRÜM NOTU · ${track}`);
        releases.forEach((r) => {
          console.log(`\n  sürüm kodu ${(r.versionCodes ?? []).join(', ') || '—'} (${r.status})`);
          if (!(r.releaseNotes ?? []).length) console.log('    (boş)');
          (r.releaseNotes ?? []).forEach((n) => console.log(`    [${n.language}]\n${n.text.replace(/^/gm, '      ')}`));
        });
        console.log('');
        return;
      }
      // Birden çok sürüm ancak kademeli yayında olur; iç testte tek sürüm var.
      if (releases.length > 1) throw new Error(`'${track}' kanalında ${releases.length} sürüm var; hangisi olduğu belirsiz`);
      const [release] = releases;
      await call(`/applications/${pkg}/edits/${editId}/tracks/${track}`, {
        method: 'PATCH',
        body: { track, releases: [{ ...release, releaseNotes: [{ language: lang, text }] }] },
      });
      console.log(`✓ ${track} · sürüm kodu ${(release.versionCodes ?? []).join(', ')} · ${[...text].length}/${LIMIT} karakter`);
    },
    { commit: !!text },
  );
}

/** İnceleme durumu ve uygulama detayları. */
async function details() {
  await withEdit(async (editId, pkg) => {
    const d = await call(`/applications/${pkg}/edits/${editId}/details`);
    console.log('\nUYGULAMA DETAYLARI');
    console.log(`  varsayılan dil : ${d.defaultLanguage}`);
    console.log(`  iletişim       : ${d.contactEmail || '(boş)'} ${d.contactPhone || ''} ${d.contactWebsite || ''}`);
    console.log('');
  });
}

const COMMANDS = { status, listing: (p) => listing(p), images: (l) => images(l), details, notes: (...a) => notes(...a) };

const [cmd, ...args] = process.argv.slice(2);
if (!cmd || !COMMANDS[cmd]) {
  console.log(`Kullanım: node scripts/play.mjs <komut>

  status                     kanallar, sürümler, yüklenen paketler
  listing ['{"...":"..."}']  mağaza girişini oku / yaz (yazınca commit eder)
  notes [kanal] ['metin']    sürüm notunu oku / yaz (yazınca commit eder)
  images [dil]               grafikler, hangisi eksik
  details                    varsayılan dil ve iletişim bilgileri

Okuma komutları Play'de hiçbir şeyi değiştirmez: açılan edit commit edilmez.
`);
  process.exit(cmd ? 1 : 0);
}

COMMANDS[cmd](...args).catch((e) => {
  console.error('HATA:', e.message);
  process.exit(1);
});
