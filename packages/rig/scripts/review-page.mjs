#!/usr/bin/env node
/**
 * Editörü tek bir HTML sayfasına paketler — `node scripts/review-page.mjs`.
 *
 * Neden var: `npm run editor` yalnızca 127.0.0.1'i dinliyor. Pozları gözden
 * geçirecek kişi başka bir makinedeyse (ya da oturum bulutta çalışıyorsa)
 * editöre hiç ulaşamıyor, ve ekran görüntüsü yetmiyor — deponun kendi notu
 * "geçiş hataları ara karelerde yaşar" diyor, yani kaydırılamayan bir tabaka
 * asıl hataları gizler.
 *
 * Ne yapıyor: motoru derliyor, `editor/editor.js`'i esbuild ile paketliyor,
 * sunucunun servis ettiği beş JSON'u sayfaya gömüyor ve `fetch`'in üstüne
 * bir vekil koyuyor. `editor/editor.js` ve `editor/index.html` HİÇ
 * DEĞİŞMİYOR — sayfa neyi gösteriyorsa editörün gösterdiği o.
 *
 * Ne yapmıyor: kaydetmiyor. Sunucu yok, `PUT /data` gidecek bir yer yok;
 * kaydet ve diske dön düğmeleri gizleniyor. Sürükleme AÇIK kalıyor, çünkü
 * "bu açı 46 değil 52 olmalı" demenin yolu açıyı deneyip panelden okumak.
 */
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT, OUT, buildEngine } from './engine-build.mjs';

/** Bu turda yazılan arketipler; listede işaretleniyor ve başa alınıyor. */
const NEW_ARCHETYPES = [
  'leg_press_seated', 'leg_extension_seated', 'leg_curl_seated',
  'lat_pulldown_seated', 'seated_row_cable', 'chest_press_seated',
  'pull_up_hang', 'triceps_pushdown_standing', 'face_pull_standing',
  'dead_bug_supine', 'curl_up_supine',
];

const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const readJson = (p) => JSON.parse(read(p));

buildEngine();

/** `/engine/x.js` → derlenmiş `.editor-build/x.js`. */
const enginePlugin = {
  name: 'engine',
  setup(b) {
    b.onResolve({ filter: /^\/engine\// }, (a) => ({ path: join(OUT, a.path.replace('/engine/', '')) }));
    // tsc modül tanımlayıcılarını olduğu gibi bırakıyor: derlenen dosyalar
    // birbirini uzantısız çağırıyor (`./rig`), esbuild uzantı bekliyor.
    b.onResolve({ filter: /^\.\/[\w-]+$/ }, (a) =>
      a.importer.startsWith(OUT) ? { path: join(OUT, a.path.slice(2) + '.js') } : undefined);
  },
};

const bundled = await build({
  entryPoints: [join(ROOT, 'editor/editor.js')],
  bundle: true, write: false, format: 'iife', target: 'es2020',
  plugins: [enginePlugin],
});
const editorJs = bundled.outputFiles[0].text;

// --- editörün kendi kabuğu: stil ve gövde olduğu gibi alınıyor ---
const html = read('editor/index.html');
const styles = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '');

// --- sunucunun servis ettiği veri ---
const archetypes = readJson('data/rigArchetypes.json');
// Yeni arketipler başa: sayfa açılır açılmaz incelenecek şeyi gösteriyor,
// `boot()` listenin ilkini seçiyor.
const ordered = Object.fromEntries([
  ...NEW_ARCHETYPES.filter((k) => k in archetypes).map((k) => [k, archetypes[k]]),
  ...Object.entries(archetypes).filter(([k]) => !NEW_ARCHETYPES.includes(k)),
]);
const DATA = {
  '/data': ordered,
  '/names': readJson('data/exercises.json'),
  '/muscles': readJson('data/rigMuscles.json'),
  '/anatomy': readJson('data/anatomy.json'),
  '/parts': readJson('data/bodyParts.json'),
};

const missing = NEW_ARCHETYPES.filter((k) => !(k in archetypes));
if (missing.length) throw new Error('rigArchetypes.json içinde yok: ' + missing.join(', '));

const page = `<title>Kukla Editörü</title>
<style>
${styles}
  /* --- inceleme kabuğu: editörün paletinden, üstüne değil --- */
  .review {
    display:flex; flex-wrap:wrap; align-items:baseline; gap:6px 14px;
    padding:9px 16px; background:var(--surf); border-bottom:1px solid var(--line);
  }
  .review b { color:var(--p); font-weight:700; }
  .review span { color:var(--sub); font-size:12px; }
  .app { height:calc(100dvh - 42px); }
  .list button .new {
    float:right; margin-left:6px; font-size:9px; letter-spacing:.1em; font-weight:700;
    color:#06281F; background:var(--p); border-radius:999px; padding:1px 6px;
  }
  #save, #revert { display:none; }
  /* Dar ekran: üç sütun tek sütuna iner, yükseklik içeriğe bırakılır. */
  @media (max-width: 760px) {
    body { overflow:auto; }
    .app { grid-template-columns:1fr; height:auto; }
    .col { padding:16px; }
    .col + .col { border-left:0; border-top:1px solid var(--line); }
    .mid { overflow:visible; }
    .stage { height:58vh; flex:none; }
    #cmp .grid { grid-template-columns:1fr; grid-template-rows:repeat(3,1fr); }
  }
</style>

<div class="review">
  <b>Salt okunur</b>
  <span>Kaydetme yok — bu sayfa depodaki veriyi taşıyor. Eklemi sürükleyip sağdaki açıyı oku,
  düzeltmeyi "hareket · kare · açı" olarak söyle; değişiklik depoda yapılır.</span>
</div>
${body}

<script>
(() => {
  // Sunucu vekili: editörün beş GET'i sayfaya gömülü veriden karşılanıyor.
  // Kaydetme (PUT /data) gidecek bir yer olmadığı için açıkça reddediliyor —
  // sessizce yutmak, kaydettiğini sanan birine yalan söylemek olurdu.
  const DATA = ${JSON.stringify(DATA)};
  const real = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = (input, init) => {
    const path = typeof input === 'string' ? input : (input && input.url) || '';
    if (init && init.method && init.method !== 'GET') {
      return Promise.reject(new Error('Bu sayfa salt okunur: kaydedecek bir sunucu yok.'));
    }
    const hit = Object.keys(DATA).find((k) => path === k || path.endsWith(k));
    if (hit) return Promise.resolve(new Response(JSON.stringify(DATA[hit]), { headers: { 'content-type': 'application/json' } }));
    return real ? real(input, init) : Promise.reject(new Error('yok: ' + path));
  };

  const NEW = new Set(${JSON.stringify(NEW_ARCHETYPES)});
  // Liste her renderAll()'da yeniden çiziliyor; rozeti gözlemciyle ekliyoruz,
  // böylece editor.js'e tek satır dokunmuyoruz.
  const mark = () => {
    document.querySelectorAll('#exList button').forEach((b) => {
      if (b.querySelector('.new')) return;
      const small = b.querySelector('small');
      const key = small && small.textContent.split('·').pop().trim();
      if (key && NEW.has(key)) {
        const tag = document.createElement('span');
        tag.className = 'new';
        tag.textContent = 'YENİ';
        b.insertBefore(tag, b.firstChild);
      }
    });
  };
  const host = document.getElementById('exList');
  if (host) { new MutationObserver(mark).observe(host, { childList: true }); mark(); }
})();
</script>

<script>
${editorJs}
</script>
`;

mkdirSync(join(ROOT, 'dist'), { recursive: true });
const out = join(ROOT, 'dist/review.html');
writeFileSync(out, page);
console.log(`✓ inceleme sayfası → ${out}  (${(page.length / 1024).toFixed(0)} KB, ${Object.keys(archetypes).length} arketip, ${NEW_ARCHETYPES.length} yeni)`);
