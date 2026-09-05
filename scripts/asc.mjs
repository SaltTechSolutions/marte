#!/usr/bin/env node
/**
 * App Store Connect istemcisi — `/appstore` skill'inin elleri.
 *
 * Neden ayrı bir dosya: mağaza işlerinin çoğu "önce oku, sonra tek bir alanı
 * değiştir" biçiminde. Bunu her seferinde curl ile yazmak hem hataya açık hem
 * de anahtarı komut satırına taşıma riski taşıyor. Buradaki her komut tek bir
 * iş yapıyor ve çıktısı okunabilir.
 *
 * Kimlik: `eas.json`'daki ASC anahtarı (secrets/AuthKey_*.p8). Anahtarın
 * KENDİSİ hiçbir çıktıya yazılmaz; yalnızca ondan üretilen kısa ömürlü JWT
 * isteğe gider.
 *
 * Yazma komutları `--yes` istemez; onayı çağıran verir. Yayına dönük tek
 * komut `submit` ve o, kendi içinde ne göndereceğini yazdırıp onay bekler.
 */

import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.appstoreconnect.apple.com/v1';

function config() {
  const eas = JSON.parse(readFileSync(join(ROOT, 'eas.json'), 'utf8'));
  const ios = eas.submit?.production?.ios;
  if (!ios) throw new Error('eas.json içinde submit.production.ios yok');
  return {
    keyId: ios.ascApiKeyId,
    issuerId: ios.ascApiKeyIssuerId,
    appId: ios.ascAppId,
    keyPath: join(ROOT, ios.ascApiKeyPath),
  };
}

/** ES256 JWT. Apple 20 dakikadan uzun ömür kabul etmiyor; 10 dakika yeter. */
function token({ keyId, issuerId, keyPath }) {
  const key = readFileSync(keyPath, 'utf8');
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b64({ alg: 'ES256', kid: keyId, typ: 'JWT' });
  const now = Math.floor(Date.now() / 1000);
  const body = b64({ iss: issuerId, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' });
  const signer = createSign('SHA256');
  signer.update(`${head}.${body}`);
  // JWT ham r||s imza ister; Node varsayılanı DER veriyor.
  const sig = signer.sign({ key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${head}.${body}.${sig}`;
}

async function call(path, { method = 'GET', body } = {}) {
  const cfg = config();
  const res = await fetch(path.startsWith('http') ? path : API + path, {
    method,
    headers: {
      authorization: `Bearer ${token(cfg)}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const detail = (json.errors || []).map((e) => `${e.title}: ${e.detail}`).join('\n  ') || text;
    const err = new Error(`${method} ${path} → ${res.status}\n  ${detail}`);
    // Apple engelleri ana hatanın içinde, `associatedErrors` altında veriyor.
    err.associated = json.errors?.[0]?.meta?.associatedErrors;
    throw err;
  }
  return json;
}

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('tr-TR') : '—');

/** Build durumu: TestFlight'ta ne var, hangisi işleniyor. */
async function status() {
  const cfg = config();
  const builds = await call(
    `/builds?filter[app]=${cfg.appId}&limit=8&sort=-uploadedDate` +
      `&fields[builds]=version,uploadedDate,processingState,expired,usesNonExemptEncryption`,
  );
  console.log('\nSON BUILD\'LER');
  builds.data.forEach((b) => {
    const a = b.attributes;
    console.log(
      `  ${String(a.version).padStart(4)}  ${a.processingState.padEnd(10)} ` +
        `${fmtDate(a.uploadedDate)}${a.expired ? '  (süresi doldu)' : ''}` +
        `${a.usesNonExemptEncryption === null ? '  ⚠ şifreleme sorusu yanıtsız' : ''}`,
    );
  });

  const versions = await call(
    `/apps/${cfg.appId}/appStoreVersions?limit=3&fields[appStoreVersions]=versionString,appStoreState,createdDate,releaseType`,
  );
  console.log('\nMAĞAZA SÜRÜMLERİ');
  versions.data.forEach((v) => {
    const a = v.attributes;
    console.log(`  ${a.versionString.padEnd(8)} ${a.appStoreState.padEnd(24)} ${a.releaseType ?? ''}`);
  });
  console.log('');
}

/** Bir build'in "Neyi test edin" notu. */
async function notes(buildVersion, text) {
  const cfg = config();
  const builds = await call(`/builds?filter[app]=${cfg.appId}&filter[version]=${buildVersion}&limit=1`);
  const build = builds.data[0];
  if (!build) throw new Error(`build ${buildVersion} bulunamadı`);

  const existing = await call(`/builds/${build.id}/betaBuildLocalizations?limit=20`);
  const tr = existing.data.find((l) => l.attributes.locale === 'tr') ?? existing.data[0];

  if (text === undefined) {
    console.log(`\nbuild ${buildVersion} · ${tr?.attributes.locale ?? 'yok'}\n`);
    console.log(tr?.attributes.whatsNew || '(not yok)');
    console.log('');
    return;
  }

  if (tr) {
    await call(`/betaBuildLocalizations/${tr.id}`, {
      method: 'PATCH',
      body: { data: { type: 'betaBuildLocalizations', id: tr.id, attributes: { whatsNew: text } } },
    });
  } else {
    await call('/betaBuildLocalizations', {
      method: 'POST',
      body: {
        data: {
          type: 'betaBuildLocalizations',
          attributes: { locale: 'tr', whatsNew: text },
          relationships: { build: { data: { type: 'builds', id: build.id } } },
        },
      },
    });
  }
  console.log(`✓ build ${buildVersion} test notu yazıldı (${text.length} karakter)`);
}

/** İnceleme için demo hesap ve iletişim bilgisi — eksikse kesin ret sebebi. */
async function reviewDetail(patch) {
  const cfg = config();
  const versions = await call(
    `/apps/${cfg.appId}/appStoreVersions?limit=1&fields[appStoreVersions]=versionString,appStoreState`,
  );
  const version = versions.data[0];
  if (!version) throw new Error('mağaza sürümü yok');
  const detail = await call(`/appStoreVersions/${version.id}/appStoreReviewDetail`).catch(() => null);

  if (!patch) {
    const a = detail?.data?.attributes ?? {};
    console.log(`\nSÜRÜM ${version.attributes.versionString} · ${version.attributes.appStoreState}`);
    console.log(`  demo hesap gerekli : ${a.demoAccountRequired ?? '—'}`);
    console.log(`  demo kullanıcı     : ${a.demoAccountName || '(boş)'}`);
    console.log(`  demo parola        : ${a.demoAccountPassword ? '(dolu)' : '(boş)'}`);
    console.log(`  inceleme notu      : ${a.notes ? a.notes.slice(0, 200) : '(boş)'}`);
    console.log(`  iletişim           : ${[a.contactFirstName, a.contactLastName, a.contactEmail].filter(Boolean).join(' ') || '(boş)'}\n`);
    return;
  }

  if (detail?.data) {
    await call(`/appStoreReviewDetails/${detail.data.id}`, {
      method: 'PATCH',
      body: { data: { type: 'appStoreReviewDetails', id: detail.data.id, attributes: patch } },
    });
  } else {
    await call('/appStoreReviewDetails', {
      method: 'POST',
      body: {
        data: {
          type: 'appStoreReviewDetails',
          attributes: patch,
          relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } },
        },
      },
    });
  }
  console.log('✓ inceleme bilgileri yazıldı:', Object.keys(patch).join(', '));
}

/** Yaş sınırı anketi. Boş bırakılırsa sürüm incelemeye gönderilemiyor. */
async function ageRating(patch) {
  const cfg = config();
  const infos = await call(`/apps/${cfg.appId}/appInfos?limit=5`);
  const info = infos.data[0];
  const rel = await call(`/appInfos/${info.id}/ageRatingDeclaration`).catch(() => null);
  if (!patch) {
    console.log('\nYAŞ SINIRI ANKETİ');
    const a = rel?.data?.attributes ?? {};
    const bos = Object.entries(a).filter(([, v]) => v === null).map(([k]) => k);
    Object.entries(a).forEach(([k, v]) => console.log(`  ${k.padEnd(40)} ${v === null ? '— YANITSIZ' : v}`));
    console.log(`\n  ${bos.length} yanıtsız alan\n`);
    return;
  }
  await call(`/ageRatingDeclarations/${rel.data.id}`, {
    method: 'PATCH',
    body: { data: { type: 'ageRatingDeclarations', id: rel.data.id, attributes: patch } },
  });
  console.log('✓ yaş sınırı yanıtları yazıldı:', Object.keys(patch).join(', '));
}

/** Ekran görüntüsü setleri: hangi boyut dolu, hangisi eksik. */
async function screenshots() {
  const cfg = config();
  const versions = await call(`/apps/${cfg.appId}/appStoreVersions?limit=1`);
  const version = versions.data[0];
  const locs = await call(`/appStoreVersions/${version.id}/appStoreVersionLocalizations?limit=20`);
  console.log(`\nSÜRÜM ${version.attributes.versionString} EKRAN GÖRÜNTÜLERİ`);
  for (const loc of locs.data) {
    const sets = await call(`/appStoreVersionLocalizations/${loc.id}/appScreenshotSets?limit=20`);
    console.log(`  ${loc.attributes.locale}`);
    if (!sets.data.length) console.log('    (hiç yok)');
    for (const set of sets.data) {
      const shots = await call(`/appScreenshotSets/${set.id}/appScreenshots?limit=20&fields[appScreenshots]=fileName,assetDeliveryState`);
      const ok = shots.data.filter((s) => s.attributes.assetDeliveryState?.state === 'COMPLETE').length;
      console.log(`    ${set.attributes.screenshotDisplayType.padEnd(28)} ${ok}/${shots.data.length} yüklü`);
    }
  }
  console.log('');
}

/** TestFlight test kullanıcıları. */
async function testers() {
  const cfg = config();
  const groups = await call(`/apps/${cfg.appId}/betaGroups?limit=20&fields[betaGroups]=name,isInternalGroup,publicLinkEnabled`);
  console.log('\nTEST GRUPLARI');
  for (const g of groups.data) {
    const list = await call(`/betaGroups/${g.id}/betaTesters?limit=50&fields[betaTesters]=email,state`);
    console.log(`  ${g.attributes.name} (${g.attributes.isInternalGroup ? 'iç' : 'dış'}) — ${list.data.length} kişi`);
    list.data.forEach((t) => console.log(`      ${t.attributes.email ?? '(e-posta yok)'}  ${t.attributes.state ?? ''}`));
  }
  console.log('');
}


/** Sürüme build bağlar — gönderimin ön koşulu. */
async function attachBuild(buildVersion) {
  const cfg = config();
  const builds = await call(`/builds?filter[app]=${cfg.appId}&filter[version]=${buildVersion}&limit=1`);
  const build = builds.data[0];
  if (!build) throw new Error(`build ${buildVersion} bulunamadı`);
  const versions = await call(`/apps/${cfg.appId}/appStoreVersions?limit=1&fields[appStoreVersions]=versionString`);
  const version = versions.data[0];
  await call(`/appStoreVersions/${version.id}/relationships/build`, {
    method: 'PATCH',
    body: { data: { type: 'builds', id: build.id } },
  });
  console.log(`✓ build ${buildVersion} → sürüm ${version.attributes.versionString}`);
}

async function currentVersion() {
  const cfg = config();
  const versions = await call(
    `/apps/${cfg.appId}/appStoreVersions?limit=1&fields[appStoreVersions]=versionString,appStoreState`,
  );
  const v = versions.data[0];
  if (!v) throw new Error('mağaza sürümü yok');
  return v;
}

/**
 * Gönderim engelleri — Apple'ın kendi listesinden.
 *
 * Yerel denetim yeterli değil: fiyatlandırma, gizlilik beyanı, telif ve
 * içerik hakları yalnızca gönderim denendiğinde ortaya çıkıyor. Bu komut
 * gönderimi DENEMİYOR; boş bir gönderim kabına sürümü eklemeyi deniyor ve
 * Apple'ın döndürdüğü `associatedErrors` listesini yazdırıyor. Kap oluşmadan
 * hata alındığı için mağazada hiçbir şey değişmiyor.
 */
async function precheck() {
  const cfg = config();
  const version = await currentVersion();
  console.log(`\nSÜRÜM ${version.attributes.versionString} · ${version.attributes.appStoreState}`);

  const build = await call(`/appStoreVersions/${version.id}/build?fields[builds]=version`).catch(() => null);
  console.log(`  build: ${build?.data ? build.data.attributes.version : '— BAĞLANMAMIŞ'}`);

  const sub = await call('/reviewSubmissions', {
    method: 'POST',
    body: {
      data: {
        type: 'reviewSubmissions',
        attributes: { platform: 'IOS' },
        relationships: { app: { data: { type: 'apps', id: cfg.appId } } },
      },
    },
  }).catch(() => null);
  if (!sub) {
    console.log('\n  Açık bir gönderim kabı zaten var — App Store Connect\'ten bak.\n');
    return { version, blockers: ['açık gönderim kabı var'] };
  }

  const blockers = [];
  try {
    await call('/reviewSubmissionItems', {
      method: 'POST',
      body: {
        data: {
          type: 'reviewSubmissionItems',
          relationships: {
            reviewSubmission: { data: { type: 'reviewSubmissions', id: sub.data.id } },
            appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } },
          },
        },
      },
    });
    console.log('\n  Engel yok — gönderilebilir.\n');
    // Kabı temiz bırak: gönderim ayrı bir karar.
    await call(`/reviewSubmissions/${sub.data.id}`, {
      method: 'PATCH',
      body: { data: { type: 'reviewSubmissions', id: sub.data.id, attributes: { canceled: true } } },
    }).catch(() => {});
  } catch (e) {
    const assoc = e.associated ?? {};
    console.log('\nENGELLER');
    Object.entries(assoc).forEach(([where, list]) => {
      list.forEach((x) => {
        blockers.push(x.detail);
        console.log(`  ✗ ${x.detail}`);
        console.log(`     (${where.replace('/v1/', '').replace('/v2/', '')})`);
      });
    });
    if (!blockers.length) console.log(`  ✗ ${e.message}`);
    console.log('');
  }
  return { version, blockers };
}

/**
 * Sürümü incelemeye gönderir. DIŞARIYA AÇILAN İŞ — `--yes` olmadan yalnızca
 * engelleri gösterir.
 */
async function submit(flag) {
  const cfg = config();
  const { version, blockers } = await precheck();
  if (blockers.length) {
    console.log('Engeller kapanmadan gönderilmez.\n');
    process.exit(1);
  }
  if (flag !== '--yes') {
    console.log(`Göndermek için:  node scripts/asc.mjs submit --yes\n`);
    return;
  }
  const sub = await call('/reviewSubmissions', {
    method: 'POST',
    body: {
      data: {
        type: 'reviewSubmissions',
        attributes: { platform: 'IOS' },
        relationships: { app: { data: { type: 'apps', id: cfg.appId } } },
      },
    },
  });
  await call('/reviewSubmissionItems', {
    method: 'POST',
    body: {
      data: {
        type: 'reviewSubmissionItems',
        relationships: {
          reviewSubmission: { data: { type: 'reviewSubmissions', id: sub.data.id } },
          appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } },
        },
      },
    },
  });
  await call(`/reviewSubmissions/${sub.data.id}`, {
    method: 'PATCH',
    body: { data: { type: 'reviewSubmissions', id: sub.data.id, attributes: { submitted: true } } },
  });
  console.log('✓ sürüm incelemeye gönderildi\n');
}


/**
 * Ekran görüntüsü yükler.
 *
 * Apple'ın akışı üç adımlı: önce dosyayı BİLDİR (boyut ve ad), Apple parça
 * parça yükleme talimatı döndürür, parçalar yüklenir, sonra sağlama toplamıyla
 * "bitti" denir. Tek adımda dosya göndermek diye bir şey yok.
 *
 * Sıra korunuyor: dosya adları alfabetik yükleniyor ve sonunda kümenin
 * sırası açıkça yazılıyor — mağazadaki ilk üç görsel listede öne çıktığı için
 * sıra bir tasarım kararı.
 */
async function uploadScreenshots(displayType, dir) {
  const { createHash } = await import('node:crypto');
  const { readFileSync, readdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const cfg = config();

  const versions = await call(`/apps/${cfg.appId}/appStoreVersions?limit=1&fields[appStoreVersions]=versionString`);
  const version = versions.data[0];
  const locs = await call(`/appStoreVersions/${version.id}/appStoreVersionLocalizations?limit=10`);
  const loc = locs.data[0];

  const sets = await call(`/appStoreVersionLocalizations/${loc.id}/appScreenshotSets?limit=20`);
  let set = sets.data.find((x) => x.attributes.screenshotDisplayType === displayType);
  if (!set) {
    const created = await call('/appScreenshotSets', {
      method: 'POST',
      body: {
        data: {
          type: 'appScreenshotSets',
          attributes: { screenshotDisplayType: displayType },
          relationships: {
            appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: loc.id } },
          },
        },
      },
    });
    set = created.data;
    console.log(`✓ ${displayType} kümesi oluşturuldu (${loc.attributes.locale})`);
  }

  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.png')).sort();
  const ids = [];
  for (const name of files) {
    const bytes = readFileSync(join(dir, name));
    const reserved = await call('/appScreenshots', {
      method: 'POST',
      body: {
        data: {
          type: 'appScreenshots',
          attributes: { fileSize: bytes.length, fileName: name },
          relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: set.id } } },
        },
      },
    });
    const shot = reserved.data;
    for (const op of shot.attributes.uploadOperations) {
      const headers = {};
      (op.requestHeaders || []).forEach((h) => (headers[h.name] = h.value));
      const res = await fetch(op.url, {
        method: op.method,
        headers,
        body: bytes.subarray(op.offset, op.offset + op.length),
      });
      if (!res.ok) throw new Error(`${name} parçası yüklenemedi: ${res.status}`);
    }
    await call(`/appScreenshots/${shot.id}`, {
      method: 'PATCH',
      body: {
        data: {
          type: 'appScreenshots',
          id: shot.id,
          attributes: { uploaded: true, sourceFileChecksum: createHash('md5').update(bytes).digest('hex') },
        },
      },
    });
    ids.push(shot.id);
    console.log(`  ↑ ${name} (${(bytes.length / 1024).toFixed(0)} KB)`);
  }

  await call(`/appScreenshotSets/${set.id}/relationships/appScreenshots`, {
    method: 'PATCH',
    body: { data: ids.map((id) => ({ type: 'appScreenshots', id })) },
  });
  console.log(`\n✓ ${files.length} görsel yüklendi ve sırası yazıldı. Apple işleyene kadar birkaç dakika sürebilir.\n`);
}

const COMMANDS = {
  status,
  'upload-screenshots': uploadScreenshots,
  'attach-build': attachBuild,
  precheck,
  submit,
  notes: (v, ...rest) => notes(v, rest.length ? rest.join(' ') : undefined),
  'review-detail': (...args) => reviewDetail(args.length ? JSON.parse(args.join(' ')) : undefined),
  'age-rating': (...args) => ageRating(args.length ? JSON.parse(args.join(' ')) : undefined),
  screenshots,
  testers,
};

const [cmd, ...args] = process.argv.slice(2);
if (!cmd || !COMMANDS[cmd]) {
  console.log(`Kullanım: node scripts/asc.mjs <komut>

  status                          build ve mağaza sürümü durumu
  attach-build <build>            sürüme build bağla
  precheck                        Apple'ın gönderim engelleri listesi
  submit [--yes]                  incelemeye gönder (dışarıya açılan iş)
  notes <build> [metin]           TestFlight "Neyi test edin" notunu oku / yaz
  review-detail ['{"...":"..."}'] inceleme bilgileri (demo hesap, not) oku / yaz
  age-rating ['{"...":"..."}']    yaş sınırı anketini oku / yaz
  screenshots                     ekran görüntüsü setleri, hangisi eksik
  upload-screenshots <tip> <dizin>  klasördeki PNG'leri sırayla yükle
  testers                         TestFlight grupları ve kişiler
`);
  process.exit(cmd ? 1 : 0);
}

COMMANDS[cmd](...args).catch((e) => {
  console.error('HATA:', e.message);
  process.exit(1);
});
