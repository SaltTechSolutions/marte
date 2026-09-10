/**
 * Kukla editörünün arayüzü.
 *
 * Motor buraya `/engine/` altından geliyor: uygulamanın çalıştırdığı
 * `src/utils/rig.ts` ve `rigEdit.ts` dosyalarının derlenmiş hâli. Bu dosyada
 * hiçbir kinematik hesap YOK — çizim, sürükleme olayları ve düzenleme
 * durumundan ibaret. Motorun ikinci bir kopyasını buraya yazmak, uygulamada
 * bozuk olan bir şeyin editörde düzgün görünmesine yol açardı.
 */

import {
  BAR_Y, CENTER_X, D, FX, GROUND, add, boundsFor, capsule, facingFlip, fillPose, footDirFor, footDirOf, footPath,
  frontPoints, frontTorsoPath, frontTrunk, handPath, headProfile, lerpP, partTransform, poseAt,
  shoulderWedge, showFarLeg, skeleton, solePoints,
} from '/engine/rig.js';
import { applyPatch, dragHandles, dragJoint } from '/engine/rigEdit.js';
import { auditExercise, auditFrame, auditLoop } from '/engine/rigAudit.js';
import { groupsOf, labelsOf } from '/engine/muscles.js';

const NS = 'http://www.w3.org/2000/svg';
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const el = (n, a, kids) => {
  const e = document.createElementNS(NS, n);
  for (const k in a) if (a[k] != null) e.setAttribute(k, a[k]);
  (kids || []).forEach((c) => e.appendChild(c));
  return e;
};
const $ = (id) => document.getElementById(id);

const ANGLES = [
  ['shinA', 'Baldır', 0, 360], ['thighA', 'Uyluk', 0, 360],
  ['torso', 'Bel', 0, 360], ['thoraxA', 'Göğüs', 0, 360], ['neckA', 'Boyun', 0, 360],
  ['upperA', 'Üst kol', 0, 360], ['foreA', 'Ön kol', 0, 360],
  ['thighF', 'Uzak uyluk', 0, 360], ['shinF', 'Uzak baldır', 0, 360],
  ['upperF', 'Uzak üst kol', 0, 360], ['foreF', 'Uzak ön kol', 0, 360],
  ['hx', 'El yatay', -200, 200], ['hy', 'El dikey', -220, 220],
  ['hxF', 'Önden el açıklığı', 0, 200], ['shLift', 'Omuz yükselmesi', 0, 40],
  ['ankleLift', 'Topuk/basamak', 0, 120],
];

const OPTIONS = {
  mode: [['stand', 'Ayakta'], ['quad', 'Dört ayak'], ['bench', 'Sehpa'], ['supine', 'Sırtüstü'], ['hang', 'Barda asılı']],
  arm: [['angles', 'Açıyla'], ['ik', 'Hedefe (ters kinematik)'], ['floor', 'Yerde']],
  bar: [['', 'Yok'], ['back', 'Sırtta'], ['hands', 'Elde'], ['hips', 'Kalçada']],
  load: [['', 'Yok'], ['barbell', 'Barbell'], ['dumbbell', 'Dambıl']],
  prop: [['', 'Yok'], ['bench', 'Sehpa'], ['box', 'Basamak'], ['bar', 'Barfiks barı'], ['hipbench', 'Omuz sehpası'], ['seatback', 'Koltuk'], ['sled', 'Bacak presi'], ['cable', 'Kablo istasyonu'], ['legpad', 'Bacak makinesi']],
  view: [['side', 'Yandan'], ['front', 'Önden']],
  bend: [['1', 'İleri (+1)'], ['-1', 'Geri (−1)']],
};

let DATA = {};
let NAMES = {};
/** Ham hareket kataloğu: kimlik → { name, archetype }. */
let CATALOG = {};
/** Hareket başına kaslar: kimlik → { status, primary, secondary }. */
let MUSCLEDATA = {};
/** Kas haritası yolları: viewBox, ayna dönüşümü, ön ve arka yollar. */
let ANATOMY = null;
/** Uzuv siluet parçaları; yoksa kapsül çizime düşülüyor. */
let PARTS = null;
/** Çizim kipi: kapsül mü parça mı. */
let useParts = true;
let key = null;
let kfIndex = 0;
let plane = 'side';
let playing = false;
let playT = 0;
/** Çubuk bir karenin üstünde değilse ara kareye bakılıyor demektir. */
let scrubT = null;
let dragging = null;
let dirty = false;
let filter = '';
/** Mobil önizleme: hangi cihaz ve açık mı. */
let phoneOn = true;
let phoneSize = 0;
/** 'phases' = iki evre yan yana (onaylanan tasarım), 'live' = canlı figür. */
let phoneMode = 'phases';
/**
 * Düzen. Varsayılan `full`: kullanıcı ekranı kaydırabildiği için katlama sert
 * bir kısıt değil ve okunurluğu ona feda etmenin anlamı yok. `compact` SE'ye
 * sığan sıkı hâl, ölçüm için duruyor.
 */
let phoneLayout = 'full';
/** Önizleme kendi başına oynuyor: uygulamadaki figür de öyle. */
let phonePlayT = 0;
/** Sekme düzeninde hangi görünüm açık. */
let phoneView = 'front';
// Geri alma yığını: sürükleme yıkıcı ve anında; kaçan bir hamlenin
// dönüşü olmazsa araç kullanılamaz.
const undoStack = [];
const redoStack = [];

const ex = () => DATA[key];
const frame = () => ex().kf[kfIndex];
/** Sürükleme yalnızca kare üstünde; ara karede poz kimseye ait değil. */
const editable = () => !playing && scrubT === null;
const currentT = () => (playing ? playT : scrubT !== null ? scrubT : frame().t);
const currentPose = () => (editable() ? fillPose(frame().p) : poseAt(ex(), currentT()).p);

/**
 * Zaman çubuğunu bir ana götürür.
 *
 * Bir karenin üstüne denk gelirse o kareye KİLİTLENİR: düzenleme yalnızca
 * kare üstünde açık, ve uyarıya tıklayıp kareye gelen biri "ara kare, salt
 * okunur" duvarına toslamamalı.
 */
const goToTime = (t) => {
  playing = false;
  $('play').textContent = 'Oynat';
  const near = ex().kf.findIndex((k) => Math.abs(k.t - t) < 0.02);
  if (near >= 0) { kfIndex = near; scrubT = null; } else { scrubT = t; }
};

const snapshot = () => {
  undoStack.push(JSON.stringify(DATA));
  if (undoStack.length > 60) undoStack.shift();
  redoStack.length = 0;
};

const restore = (json) => {
  DATA = JSON.parse(json);
  if (!DATA[key]) key = Object.keys(DATA)[0];
  kfIndex = Math.min(kfIndex, ex().kf.length - 1);
  renderAll();
};

// --- çizim ---------------------------------------------------------------

/**
 * Uzuv çizici üreticisi.
 *
 * Parça kipinde `data/bodyParts.json`'daki siluet kemiğe oturtuluyor, kapsül
 * kipinde bugünkü iki kapsüllü çizim. İkisi de aynı çağrıyı kullanıyor, yani
 * gerçek anatomik parçalar geldiğinde çizim kodunda hiçbir şey değişmiyor —
 * yalnızca veri dosyası değişiyor.
 *
 * Ana sahne ve önizleme aynı üreticiyi kullanıyor; iki yere ayrı yazmak bu
 * dosyada bir kez denendi ve `draw()` ile `drawPose()` ayrıştı.
 */
const mkLimb = (seg) => (a, b, wa, wm, wb, at, far, name) => {
  const q = useParts && name && PARTS && PARTS[name];
  if (q) {
    return [el('path', {
      d: q.d,
      transform: partTransform(a, b),
      fill: far ? css('--skinFar') : css('--skin'),
      stroke: css('--line'),
    })];
  }
  const m = lerpP(a, b, at);
  return [seg(a, m, wa, wm, far), seg(m, b, wm, wb, far)];
};

/**
 * Eklem topu üreticisi.
 *
 * Kapsül kipinde eklemler açık renkli, dış çizgili dairelerle işaretleniyor.
 * Parça kipinde bunlar SESSİZLEŞİYOR: kontrastlı bir daire silueti kesiyor ve
 * figürü eklemli bir manken gibi gösteriyor. Gerçek bir uzuvda eklem yerinde
 * kontrastlı bir top yok — top hâlâ çiziliyor (eklem boşluğunu dolduruyor)
 * ama ten rengiyle, dış çizgisiz.
 *
 * Sürükleme tutamakları bundan etkilenmiyor; onlar `drawHandles`'ta ayrı
 * çiziliyor ve editörde görünür kalıyor.
 */
/**
 * Halter tabağı — ana sahne ve önizleme AYNI diski çizsin diye tek yerde.
 *
 * Dış disk saydam: 50px yarıçapla kafanın önüne geldiğinde onu tamamen
 * örterdi. Kenar çizgisi tam opak kalıyor ki sınırı belirsizleşmesin.
 */
const plateAt = (c) => (c ? [
  el('circle', { cx: c[0], cy: c[1], r: 50, fill: css('--metal'), 'fill-opacity': .62, stroke: css('--p'), 'stroke-width': 2 }),
  el('circle', { cx: c[0], cy: c[1], r: 38, fill: 'none', stroke: css('--line'), opacity: .8 }),
  el('circle', { cx: c[0], cy: c[1], r: 11, fill: css('--joint'), stroke: css('--p'), 'stroke-width': 2 }),
] : []);

const mkBall = () => (c, r, far) =>
  el('circle', {
    cx: c[0], cy: c[1], r,
    fill: far ? css('--skinFar') : useParts ? css('--skin') : css('--joint'),
    stroke: useParts ? null : css('--line'),
  });

/** Gövde parçası; parça kipi kapalıysa null döner ve çağıran kapsüle düşer. */
const trunkPart = (name, a, b) => {
  const q = useParts && PARTS && PARTS[name];
  return q ? el('path', { d: q.d, transform: partTransform(a, b), fill: css('--skin'), stroke: css('--line') }) : null;
};


/* --- karşılaştırma ekranı ------------------------------------------------ */

/** Karşılaştırma hücresi için figür SVG'si. */
function cmpFigure(e, p, mode) {
  const skin = css('--skin'), skinFar = css('--skinFar'), line = css('--line');
  const S = skeleton(e, p);
  const pc = (n, a, b, f) => (PARTS && PARTS[n] ? `<path d="${PARTS[n].d}" transform="${partTransform(a, b)}" fill="${f}" stroke="${line}"/>` : '');
  const cap = (a, b, wa, wb, f) => `<path d="${capsule(a, b, wa, wb)}" fill="${f}" stroke="${line}"/>`;
  const limbOf = (n, a, b, w1, w2, w3, at, f) =>
    mode === 'capsule' ? (() => { const m = lerpP(a, b, at); return cap(a, m, w1, w2, f) + cap(m, b, w2, w3, f); })() : pc(n, a, b, f);
  const groups = [
    { d: limbOf('thigh', S.hipF, S.kneeF, 38, 30, 24, .42, skinFar) + limbOf('shin', S.kneeF, S.ankleF, 24, 25, 12, .34, skinFar) },
    { d: limbOf('upper', S.shF, S.elbowF, 23, 21, 16, .5, skinFar) + limbOf('fore', S.elbowF, S.handF, 17, 17, 11, .3, skinFar) },
    { d: (mode === 'capsule'
        ? cap(S.pelvis, S.lumbar, 40, 33, skin) + cap(S.lumbar, S.thorax, 54, 46, skin) + cap(S.thorax, S.neck, 21, 19, skin)
        : pc('lumbar', S.pelvis, S.lumbar, skin) + pc('thorax', S.lumbar, S.thorax, skin) + pc('neck', S.thorax, S.neck, skin))
      + `<circle cx="${S.sh[0]}" cy="${S.sh[1]}" r="20" fill="${skin}" stroke="${line}"/>` },
    { d: `<path d="${footPath(S.ankle, footDirOf(e), e.prop !== 'box' && p.ankleLift > 0, facingFlip(e.mode))}" fill="${skin}" stroke="${line}"/>`
        + limbOf('thigh', S.pelvis, S.knee, 42, 33, 26, .42, skin) + limbOf('shin', S.knee, S.ankle, 26, 28, 13, .34, skin) },
    { d: limbOf('upper', S.sh, S.elbow, 25, 22, 17, .5, skin) + limbOf('fore', S.elbow, S.hand, 18, 18, 12, .3, skin) },
  ];
  let g = groups.map((x) => x.d).join('');
  const dx = S.hand[0] - S.elbow[0], dy = S.hand[1] - S.elbow[1], hl = Math.hypot(dx, dy) || 1;
  g += `<path d="${handPath()}" transform="${partTransform(S.hand, [S.hand[0] + (dx / hl) * 18, S.hand[1] + (dy / hl) * 18])}" fill="${skin}" stroke="${line}"/>`;
  g += mode === 'capsule'
    ? `<circle cx="${S.head[0]}" cy="${S.head[1] - 3}" r="24" fill="${skin}" stroke="${line}"/>`
    : `<g transform="translate(${S.head[0]} ${S.head[1]}) rotate(${p.neckA}) scale(${facingFlip(e.mode)} 1)"><path d="${headProfile()}" fill="${skin}" stroke="${line}"/></g>`;
  if (S.bar) {
    const metal = css('--metal'), accent = css('--p');
    const end = (sgn) => [S.bar[0] + sgn * 58, S.bar[1] - sgn * 17];
    const A = end(-1), Bp = end(1);
    g += `<line x1="${A[0]}" y1="${A[1]}" x2="${Bp[0]}" y2="${Bp[1]}" stroke="${metal}" stroke-width="7" stroke-linecap="round"/>`;
    [A, Bp].forEach((q) => { g += `<ellipse cx="${q[0]}" cy="${q[1]}" rx="15" ry="34" fill="${metal}" fill-opacity=".62" stroke="${accent}" stroke-width="2"/>`; });
  }
  return `<svg viewBox="${boundsFor(e, 'side')}" preserveAspectRatio="xMidYMid meet">${g}</svg>`;
}

let cmpOn = false;

function renderCompare() {
  if (!cmpOn) return;
  const e = ex();
  const p = poseAt(e, phonePlayT).p;
  const mid = Object.keys(CATALOG).find((k) => CATALOG[k].archetype === key);
  const mus = MUSCLEDATA[mid];
  $('cmpTitle').textContent = (CATALOG[mid] && CATALOG[mid].name) || key;
  const cell = (h3, note, inner) => `<div class="cell"><h3>${h3}</h3><p>${note}</p><div class="box">${inner}</div></div>`;
  $('cmpGrid').innerHTML =
    cell('Kapsül', 'Bugünkü eski çizim. Uzuvlar iki kapsülden, eklemler kontrastlı toplarla.', cmpFigure(e, p, 'capsule')) +
    cell('Parça · 2B', 'Bugünkü varsayılan. Uzuv siluetleri veriden, eklemler sessiz, yan görünüm.', cmpFigure(e, p, 'flat')) +
    cell(
      'Kas haritası',
      mus && mus.status === 'authored' ? `Birincil: ${labelsOf(mus.primary).join(', ')}` : 'Bu hareket için kas verisi yok.',
      mus && mus.status === 'authored' && ANATOMY
        ? `<div class="two">${muscleMapSvg('front', mus)}${muscleMapSvg('back', mus)}</div>`
        : '',
    );
}

/* --- mobil önizleme ------------------------------------------------------ */

/**
 * Önizlenecek cihazlar.
 *
 * 375×667 (SE) tasarım incelemesinin ölçtüğü katlama riskinin yaşandığı yer:
 * kas paneli orada kaydırmadan görünmüyordu. Listede ilk sırada duruyor ki
 * en dar durum varsayılan olsun.
 */
const PHONES = [
  { label: 'iPhone SE — 375×667', w: 375, h: 667 },
  { label: 'iPhone 14 — 390×844', w: 390, h: 844 },
  { label: 'Pro Max — 440×956', w: 440, h: 956 },
];

/** Sağ sütuna sığacak ölçek. */
const phoneScale = (w) => Math.min(1, 268 / w);

/**
 * Mobil önizleme.
 *
 * Bu bir KOMPOZİSYON ve ÖLÇEK önizlemesi, piksel birebir render değil:
 * burada tarayıcı SVG'si çiziyor, uygulamada `react-native-svg`. İkisi ayrı
 * yazılmak zorunda (bkz. README). Cevapladığı sorular: figür 375pt'de okunuyor
 * mu, kas paneli katlamanın altında mı kalıyor, hiyerarşi doğru mu.
 */
function renderPhone() {
  const host = $('phone');
  const wrap = host.parentElement;
  if (!phoneOn) { wrap.style.display = 'none'; $('phoneNote').textContent = ''; return; }
  wrap.style.display = 'flex';

  const dev = PHONES[phoneSize];
  const sc = phoneScale(dev.w);
  host.className = 'phone' + (phoneLayout === 'stack' ? '' : ' ' + phoneLayout);
  host.style.width = dev.w + 'px';
  host.style.height = dev.h + 'px';
  host.style.transform = `scale(${sc})`;
  wrap.style.height = dev.h * sc + 'px';

  const e = ex();
  // Bir arketip birden çok harekete hizmet edebiliyor (30 arketip, 34 hareket).
  // Önizleme hepsini gösteriyor: hangi hareketin bu çizimi paylaştığı görünür olsun.
  const uses = Object.values(CATALOG).filter((c) => c.archetype === key);
  const title = uses[0]?.name || key;
  const others = uses.slice(1).map((c) => c.name);
  const phase = editable() ? frame().tr : poseAt(e, currentT()).phase.tr;

  host.innerHTML = '';
  const add = (html) => host.insertAdjacentHTML('beforeend', html);
  add(`<div class="status"><span>9:41</span><span>▪▪▪ ▪ ▮</span></div>`);
  add('<div class="body" id="phoneBody"></div>');
  const body = $('phoneBody');
  const push = (html) => body.insertAdjacentHTML('beforeend', html);

  // Bu arketibi kullanan hareketler farklı kas profilleri taşıyabiliyor
  // (30 arketip, 34 hareket). Önizleme birincisini gösteriyor; diğerleri
  // aşağıda ayrıca yazılı.
  const mid = Object.keys(CATALOG).find((k) => CATALOG[k].archetype === key);
  const mus = MUSCLEDATA[mid];
  const authored = mus && mus.status === 'authored';

  push(`<h3>${title}</h3>`);
  if (authored) push(`<span class="chip">${groupsOf(mus.primary).slice(0, 3).join(' · ')}</span>`);
  const [pi0, pi1] = keyPhases(e);
  const plab = (i) => e.kf[i].tr || `%${(e.kf[i].t * 100).toFixed(0)}`;
  if (phoneLayout === 'full') {
    // Canlı figür üstte, iki evre altta referans olarak: hareketin kendisi
    // uygulamada oynuyor, ama başlangıç ve tepe noktasını yan yana görmek
    // onaylanan tasarımın taşıdığı bilgi. İkisi birbirinin yerine geçmiyor.
    push(`<div class="card"><h4>Hareket</h4>
        <div class="figWrap"><svg id="phoneFig" preserveAspectRatio="xMidYMid meet"></svg></div>
        <div class="thumbs">
          <div><svg id="phA" preserveAspectRatio="xMidYMid meet"></svg><div class="lab">1. ${plab(pi0)}</div></div>
          <div class="arrow">›</div>
          <div><svg id="phB" preserveAspectRatio="xMidYMid meet"></svg><div class="lab">2. ${plab(pi1)}</div></div>
        </div>
      </div>`);
  } else if (phoneMode === 'phases') {
    const [i0, i1] = [pi0, pi1];
    const lab = plab;
    push(`<div class="card"><h4>Hareket</h4><div class="phases">
        <div class="ph${kfIndex === i0 ? ' sel' : ''}"><svg id="phA" preserveAspectRatio="xMidYMid meet"></svg><div class="lab">1. ${lab(i0)}</div></div>
        <div class="arrow">›</div>
        <div class="ph${kfIndex === i1 ? ' sel' : ''}"><svg id="phB" preserveAspectRatio="xMidYMid meet"></svg><div class="lab">2. ${lab(i1)}</div></div>
      </div></div>`);
  } else {
    push(`<div class="card"><h4>Hareket</h4><div class="figWrap"><svg id="phoneFig" preserveAspectRatio="xMidYMid meet"></svg></div><div class="phase" id="phonePhase"></div></div>`);
  }

  // Kas verisi yoksa panel HİÇ açılmıyor — tasarım incelemesinin kararı.
  // Boş siluet "hiçbir kas çalışmıyor" olarak okunur, bu yanlış bilgi.
  if (authored) {
    // Harita bloğu önce değişkene kuruluyor: iç içe üç şablon dizisi okunmaz
    // ve bir kez bozuldu.
    // Kas paneli her zaman SEKMELİ: ön ve arka ayrı. Yan yana iki gövde daha
    // az yer kaplıyor (ölçüldü) ama her biri yarı genişlikte kalıyor ve
    // anatomi çizimi kaba olduğu için o boyutta okunmuyor. Kaydırma kabul
    // edilebilir olduğuna göre okunurluk kazanıyor.
    const maps = ANATOMY
      ? `<div class="tabbar">
          <button data-view="front" aria-pressed="${phoneView === 'front'}">ÖN</button>
          <button data-view="back" aria-pressed="${phoneView === 'back'}">ARKA</button>
        </div>
        <div class="maps"><figure>${muscleMapSvg(phoneView, mus)}</figure></div>`
      : '';
    const key = ANATOMY
      ? `<div class="key">
          <span><i style="background:${MUSCLE_FILL.primary}"></i>Birincil</span>
          <span><i style="background:${MUSCLE_FILL.secondary}"></i>İkincil (taramalı)</span>
          <span><i style="background:${MUSCLE_FILL.rest}"></i>Pasif</span>
        </div>`
      : '';
    // Metin listesi A varyantından ve üç işi birden görüyor: ekran okuyucunun
    // tek yolu, renk körü kullanıcının yedek kanalı, ve haritanın okunmadığı
    // her durumda yedek gösterim.
    const list = `<div class="mus"><span>Birincil</span><b>${labelsOf(mus.primary).join(', ')}</b></div>` +
      (mus.secondary.length ? `<div class="mus"><span>İkincil</span><b>${labelsOf(mus.secondary).join(', ')}</b></div>` : '');
    push(`<div class="card"><h4>Çalışan kaslar</h4>${maps}${key}${list}</div>`);
  } else {
    push(`<div class="card"><h4>Çalışan kaslar</h4><p class="none">Bu hareket için kas verisi yok.<br>Panel veri geldiğinde açılacak; boş siluet gösterilmiyor.</p></div>`);
  }

  push(`<div class="card stats">
      <div>Tip<b>${e.bar || e.load ? 'Kuvvet' : 'Vücut ağırlığı'}</b></div>
      <div>Ekipman<b>${e.load === 'dumbbell' ? 'Dambıl' : e.bar ? 'Halter' : 'Yok'}</b></div>
      <div>Süre<b>${(e.dur / 1000).toFixed(1)} sn</b></div>
    </div>`);

  host.querySelectorAll('.tabbar button').forEach((b) => {
    b.onclick = () => { phoneView = b.dataset.view; renderPhone(); };
  });

  drawPhoneFigure();
  if ($('phonePhase')) $('phonePhase').textContent = phase || '';

  // Katlama: dekoratif bir çizgi değil, ÖLÇÜM. `.phone` taşanı kırpıyor, yani
  // ekranın altına düşen içerik gerçekten görünmüyor — tasarım incelemesinin
  // "kas paneli SE'de kaydırmadan görünmüyor" bulgusunun sınandığı yer burası.
  const need = body.scrollHeight + $('phone').querySelector('.status').offsetHeight;
  const over = need - dev.h;
  // "Aynı çizim" bilgisi telefonun DIŞINDA: editör bilgisi, uygulamada
  // olmayacak. İçeride tutmak katlama ölçümünü şişiriyordu.
  const shared = others.length
    ? `<br><span style="color:var(--sub)">Aynı çizimi paylaşan: ${others.join(' · ')} — kas verileri farklı olabilir.</span>`
    : '';
  // Kaydırma bir HATA değil, bir ÖLÇÜ: kullanıcı ekranı kaydırabiliyor, o
  // yüzden okunurluğu katlamaya feda etmiyoruz. Sayı yine de duruyor —
  // ilk bakışta neyin görünmediğini bilmek düzen kararını besliyor.
  $('phoneNote').innerHTML =
    (over > 0
      ? `İlk bakışta görünen: <b>${dev.h}px</b> · altta kalan <b>${over}px</b> (içerik ${need}px).`
      : `<b style="color:var(--p)">Hepsi tek ekranda</b> — içerik ${need}px, ekran ${dev.h}px.`) +
    shared +
    `<br>Kompozisyon ve ölçek önizlemesi: çizim burada tarayıcı SVG'si, uygulamada react-native-svg. İkisi ayrı yazılıyor, bu yüzden piksel birebir değil.`;
}

/**
 * Kas yoğunluğunun ÜÇ KANALLI kodlaması.
 *
 * Renk körlüğü hue ayrımını bozar, LUMINANSI bozmaz. Bu yüzden birincil ve
 * ikincil iki ton yeşille değil, bir parlaklık merdiveniyle ayrılıyor; üstüne
 * ikincil kaslara tarama deseni (renkten bağımsız şekil kanalı) ve altına
 * metin listesi geliyor. Hiçbiri tek başına taşımıyor.
 *
 * Ölçüldü (Machado 2009 matrisleri, linearRGB): merdivenin komşu adımları üç
 * renk körlüğü türünde de en kötü 2.27:1 kontrast veriyor. Uygulamanın bugünkü
 * paleti tek hue'nun üç tonu ve bu ayrımı taşımıyor.
 */
const MUSCLE_FILL = { primary: '#10B981', secondary: '#0E6B4C', rest: '#1D2536' };

/** Bir görünümün (ön/arka) kas haritasını çizer. */
function muscleMapSvg(view, mus) {
  if (!ANATOMY) return '';
  const level = {};
  (mus.primary || []).forEach((m) => (level[m] = 'primary'));
  (mus.secondary || []).forEach((m) => (level[m] = 'secondary'));
  const paths = ANATOMY[view] || [];
  const half = paths
    .map((p) => {
      const lv = p.muscle ? level[p.muscle] : undefined;
      // İkincil kaslar tarama desenli: renk körü kullanıcı için parlaklık
      // farkının yanında ikinci bir kanal.
      const fill = lv === 'secondary' ? 'url(#hatch)' : MUSCLE_FILL[lv] || MUSCLE_FILL.rest;
      return `<path d="${p.d}" fill="${fill}" stroke="#39445A" stroke-width="0.7"/>`;
    })
    .join('');
  return `<svg viewBox="${ANATOMY.viewBox}" preserveAspectRatio="xMidYMid meet">
      <defs><pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="7" height="7" fill="${MUSCLE_FILL.secondary}"/>
        <rect width="2.4" height="7" fill="${MUSCLE_FILL.primary}" opacity=".55"/>
      </pattern></defs>
      <g>${half}</g><g transform="${ANATOMY.mirror}">${half}</g>
    </svg>`;
}

/**
 * Hareketi iki karede anlatan evre çifti.
 *
 * İlk kare ve ondan EN ÇOK AYRILAN kare. Elle "başlangıç ve tepe" işaretlemek
 * yerine veriden çıkıyor: kareler değişince seçim de kendiliğinden değişir,
 * unutulmuş bir bayrak yüzünden yanlış evre gösterilmez. Ayrılma iskelet
 * üstünden ölçülüyor, poz alanları üstünden değil — hepsi piksel, birim
 * karışması olmuyor.
 */
function keyPhases(e) {
  const S0 = skeleton(e, fillPose(e.kf[0].p));
  const joints = Object.keys(S0).filter((k) => k !== 'bar');
  let best = Math.min(1, e.kf.length - 1);
  let bestD = -1;
  e.kf.forEach((k, i) => {
    if (i === 0) return;
    const S = skeleton(e, fillPose(k.p));
    const d = joints.reduce((sum, j) => sum + Math.hypot(S[j][0] - S0[j][0], S[j][1] - S0[j][1]), 0);
    if (d > bestD) { bestD = d; best = i; }
  });
  return [0, best];
}

/** Tek bir pozu verilen SVG'ye çizer. */
function drawPose(svg, e, p) {
  const S = skeleton(e, p);
  svg.setAttribute('viewBox', boundsFor(e, 'side'));
  svg.innerHTML = '';
  const skin = css('--skin'), skinFar = css('--skinFar'), joint = css('--joint'), line = css('--line');
  const seg = (a, b, wa, wb, far) => el('path', { d: capsule(a, b, wa, wb), fill: far ? skinFar : skin, stroke: line });
  const ball = mkBall();
  const limb = mkLimb(seg);
  const push = (arr) => arr.forEach((n) => svg.appendChild(n));
  push([el('line', { x1: S.pelvis[0] - 200, y1: GROUND, x2: S.pelvis[0] + 260, y2: GROUND, stroke: css('--floor'), 'stroke-width': 2 })]);
  // Ekipman figürün ARKASINDA: sahne önce kurulur. Konumlar 0. karenin
  // iskeletinden okunuyor, yoksa bar figürle birlikte kayardı.
  drawProps(e, skeleton(e, poseAt(e, 0).p), S, push);
  // Uzuv adları GEÇİLİYOR: `mkLimb` parça siluetini ancak adı görünce
  // çiziyor, ad verilmeyince kapsüle düşüyor. Önizleme bu yüzden uygulamanın
  // çizmediği bir figürü gösteriyordu — oysa işi tam olarak uygulamayı
  // göstermek.
  if (showFarLeg(e)) {
    push(limb(S.hipF, S.kneeF, 38, 30, 24, .42, true, 'thigh'));
    push(limb(S.kneeF, S.ankleF, 24, 25, 12, .34, true, 'shin'));
  }
  if (!e.hideFarArm) {
    push(limb(S.shF, S.elbowF, 23, 21, 16, .5, true, 'upper'));
    push(limb(S.elbowF, S.handF, 17, 17, 11, .3, true, 'fore'));
  }
  const trunk = [trunkPart('lumbar', S.pelvis, S.lumbar), trunkPart('thorax', S.lumbar, S.thorax), trunkPart('neck', S.thorax, S.neck)].filter(Boolean);
  push(trunk.length === 3
    ? [...trunk, el('circle', { cx: S.sh[0], cy: S.sh[1], r: 20, fill: skin, stroke: line })]
    : [seg(S.pelvis, S.lumbar, 40, 33), seg(S.lumbar, S.thorax, 54, 46), seg(S.thorax, S.neck, 21, 19)]);
  push([el('path', { d: footPath(S.ankle, footDirOf(e), e.prop !== 'box' && p.ankleLift > 0, facingFlip(e.mode)), fill: skin, stroke: line })]);
  push(limb(S.pelvis, S.knee, 42, 33, 26, .42, false, 'thigh'));
  push(limb(S.knee, S.ankle, 26, 28, 13, .34, false, 'shin'));
  push(limb(S.sh, S.elbow, 25, 22, 17, .5, false, 'upper'));
  push(limb(S.elbow, S.hand, 18, 18, 12, .3, false, 'fore'));
  push([ball(S.knee, 13), ball(S.ankle, 9), ball(S.sh, 17), ball(S.elbow, 10)]);
  push([el('g', { transform: `translate(${S.head[0]} ${S.head[1]}) rotate(${p.neckA}) scale(${facingFlip(e.mode)} 1)` },
    [el('path', { d: headProfile(), fill: skin, stroke: line })])]);

  // Elde tutulan halter kafadan SONRA ve ana sahnenin diskiyle aynı.
  // Burada bir zamanlar perspektif halter vardı — çubuk derinliğe uzanıyor,
  // uçlardaki tabaklar elips. Terk edilen 3/4 yönünün son kalıntısıydı ve
  // uygulama onu hiç çizmiyordu, yani önizleme yalan söylüyordu.
  if (e.bar === 'hands') push(plateAt(S.bar));
}

/** Önizlemedeki figür(ler)i tazeler; oynatmada her karede bu çalışıyor. */
function drawPhoneFigure() {
  const e = ex();
  // Canlı figür KENDİ zamanında: editörün oynatma durumundan bağımsız, çünkü
  // uygulamadaki figür de düzenleme diye bir şey bilmeden oynuyor.
  if ($('phoneFig')) drawPose($('phoneFig'), e, poseAt(e, phonePlayT).p);
  if (phoneLayout === 'full' || phoneMode === 'phases') {
    if (!$('phA')) return;
    const [i0, i1] = keyPhases(e);
    drawPose($('phA'), e, fillPose(e.kf[i0].p));
    drawPose($('phB'), e, fillPose(e.kf[i1].p));
    // Seçili kare işareti burada tazeleniyor: paneli baştan kurmak zaman
    // çubuğunda gezerken gereksiz iş olurdu.
    const boxes = $('phone').querySelectorAll('.ph');
    if (boxes[0]) boxes[0].classList.toggle('sel', editable() && kfIndex === i0);
    if (boxes[1]) boxes[1].classList.toggle('sel', editable() && kfIndex === i1);
  }
}

/**
 * Kadrajı tazeler.
 *
 * `draw()` içinde DEĞİL. `boundsFor` 25 örnek karenin birleşimini alıyor ve
 * sonuç yalnızca kare verisi, mod, kol türü ya da düzlem değişince değişiyor —
 * oynatma sırasında hiçbiri değişmiyor ama `draw()` saniyede 30 kez
 * çağrılıyordu. Ölçüm: `boundsFor` 0.11 ms, bir karenin poz + iskelet + 20 path
 * işinin tamamı 16.1 mikrosaniye; yani kadraj hesabı çizdiği figürün yedi
 * katına mal oluyordu.
 *
 * Bedeli: veriyi değiştiren her yol burayı çağırmak ZORUNDA, yoksa kadraj
 * bayatlar ve sürüklenen eklem çerçevenin dışına taşar. Bugün çağıran yollar:
 * `renderAll` (bütün veri değişiklikleri), sürükleme, kaydırıcı ve düzlem
 * düğmeleri. Oynatma ile zaman çubuğu veriyi değiştirmediği için çağırmıyor.
 */
const syncViewBox = () => $('stage').setAttribute('viewBox', boundsFor(ex(), plane));


function draw() {
  const svg = $('stage');
  const e = ex();
  const p = currentPose();
  const S = skeleton(e, p);
  const S0 = skeleton(e, poseAt(e, 0).p);
  const view = plane;
  svg.innerHTML = '';

  const skin = css('--skin'), skinFar = css('--skinFar'), joint = css('--joint');
  const line = css('--line'), metal = css('--metal'), floor = css('--floor'), surf2 = css('--surf2'), accent = css('--p');
  const push = (arr) => arr.forEach((n) => svg.appendChild(n));
  const seg = (a, b, wa, wb, far) => el('path', { d: capsule(a, b, wa, wb), fill: far ? skinFar : skin, stroke: line });
  const ball = mkBall();
  const limb = mkLimb(seg);
  const db = (c, from, far) => {
    const deg = (Math.atan2(c[1] - from[1], c[0] - from[0]) * 180) / Math.PI + 90;
    const fill = far ? skinFar : metal;
    return [el('g', { transform: `rotate(${deg} ${c[0]} ${c[1]})` }, [
      el('rect', { x: c[0] - 17, y: c[1] - 4, width: 34, height: 8, rx: 4, fill, stroke: line }),
      el('rect', { x: c[0] - 25, y: c[1] - 13, width: 13, height: 26, rx: 4, fill, stroke: accent }),
      el('rect', { x: c[0] + 12, y: c[1] - 13, width: 13, height: 26, rx: 4, fill, stroke: accent }),
    ])];
  };
  // El, ön kolun yönünde uzanıyor: bileği (0,0) kabul edip aynı dönüşümü
  // kullanıyoruz, böylece elin yönü kemikten geliyor. Tanım burada, çizim
  // sırasının başında: uzak el gövdeden ÖNCE çizilmek zorunda.
  const hand = (wrist, elbow, far) => {
    const dx = wrist[0] - elbow[0];
    const dy = wrist[1] - elbow[1];
    const l = Math.hypot(dx, dy) || 1;
    return el('path', {
      d: handPath(),
      transform: partTransform(wrist, [wrist[0] + (dx / l) * 18, wrist[1] + (dy / l) * 18]),
      fill: far ? skinFar : skin,
      stroke: line,
    });
  };
  // Halter figürün ÖNÜNDE duruyor (elde tutuluyor), o yüzden en üste çiziliyor.
  // Ama tabak 50px yarıçapında ve kafanın önüne geldiğinde onu tamamen
  // örtüyordu; saydamlık kafanın konumunu görünür bırakıyor. Kenar çizgisi tam
  // opak kalıyor ki tabağın sınırı belirsizleşmesin.
  const plate = plateAt;

  push([
    el('ellipse', { cx: S.pelvis[0], cy: GROUND + 4, rx: 96, ry: 12, fill: floor, opacity: .25 }),
    el('line', { x1: S0.pelvis[0] - 220, y1: GROUND, x2: S0.pelvis[0] + 280, y2: GROUND, stroke: floor, 'stroke-width': 2 }),
  ]);

  if (view === 'front') {
    const F = frontPoints(e, p, S);
    const trunk = frontTrunk(F);
    const cx = F.cx;
    const bar = () => (F.barY === null ? [] : [
      el('rect', { x: cx - 152, y: F.barY - 5, width: 304, height: 10, rx: 5, fill: metal, stroke: line }),
      el('rect', { x: cx - 152, y: F.barY - 48, width: 15, height: 96, rx: 6, fill: metal, stroke: line }),
      el('rect', { x: cx + 137, y: F.barY - 48, width: 15, height: 96, rx: 6, fill: metal, stroke: line }),
    ]);
    if (e.bar === 'back') push(bar());
    [F.L, F.R].forEach((s) => {
      push([el('rect', { x: s.ankle[0] - 15, y: GROUND - 13, width: 30, height: 13, rx: 5, fill: skin, stroke: line })]);
      push(limb(s.hip, s.knee, 40, 32, 27, .42)); push(limb(s.knee, s.ankle, 27, 29, 15, .34));
      push([ball(s.knee, 13), ball(s.ankle, 9)]);
      push(limb(s.sh, s.elbow, 24, 21, 17, .5)); push(limb(s.elbow, s.hand, 18, 18, 12, .3));
      push([ball(s.elbow, 10), el('circle', { cx: s.hand[0], cy: s.hand[1], r: 10, fill: skin, stroke: line })]);
      if (e.load === 'dumbbell') push(db(s.hand, s.elbow, false));
    });
    push([
      el('ellipse', { cx, cy: F.pelvis[1] + 8, rx: 38, ry: 25, fill: skin, stroke: line }),
      // Gövde kalçadan omuza TEK parça: omuz kuşağı silueti içinde, o yüzden
      // omuz silkerken omuz gövdeden kopamıyor.
      el('path', { d: frontTorsoPath(F), fill: skin, stroke: line }),
      seg(F.thorax, F.neck, 27, 24),
      el('ellipse', { cx: F.head[0], cy: F.head[1] - 3, rx: 23, ry: 27, fill: skin, stroke: line }),
    ]);
    [F.L, F.R].forEach((s2) => push([ball(s2.sh, 16)]));
    if (e.bar === 'hands') push(bar());
    return drawHandles(svg, e, S, view);
  }

  drawProps(e, S0, S, push);
  const pin = e.prop !== 'box' && p.ankleLift > 0;
  // Gizlemek yalnızca çizimi etkiler; iskelet ve kadraj aynı kalır.
  if (showFarLeg(e)) {
    push([el('path', { d: footPath(S.ankleF, footDirOf(e), pin, facingFlip(e.mode)), fill: skinFar, stroke: line })]);
    push(limb(S.hipF, S.kneeF, 38, 30, 24, .42, true, 'thigh')); push(limb(S.kneeF, S.ankleF, 24, 25, 12, .34, true, 'shin'));
    push([ball(S.kneeF, 12, true)]);
  }
  if (!e.hideFarArm) {
    push(limb(S.shF, S.elbowF, 23, 21, 16, .5, true, 'upper')); push(limb(S.elbowF, S.handF, 17, 17, 11, .3, true, 'fore'));
    push([ball(S.elbowF, 9, true), ball(S.handF, 9, true)]);
    // Uzak el ve onun taşıdığı ağırlık GÖVDEDEN ÖNCE: ikisi de figürün
    // arkasında kalıyor. Önceden ikisi de en sona, gövdenin üstüne
    // çiziliyordu; uzak dambıl gövdenin önünde belirdiği için yakın el iki
    // ağırlık tutuyormuş gibi görünüyordu.
    push(useParts ? [hand(S.handF, S.elbowF, true)] : [el('circle', { cx: S.handF[0], cy: S.handF[1], r: 9, fill: skinFar, stroke: line })]);
    if (e.load === 'dumbbell') push(db(S.handF, S.elbowF, true));
  }
  if (e.bar === 'back' || e.bar === 'hips') push(plate(S.bar));

  const pelvisMid = add(S.pelvis, D(p.torso), 12), thoraxMid = lerpP(S.lumbar, S.thorax, .55);
  push([
    // Kapsül kipinin kalça ve göğüs elipsleri parça kipinde ÇİZİLMİYOR: iki
    // ayrı şeklin kenarları birbirini kesiyor ve belde dikiş, göğüste çift
    // kontur bırakıyordu. Parça kipinde hacmi parçaların kendisi taşıyor.
    ...(useParts ? [] : [el('ellipse', { cx: pelvisMid[0], cy: pelvisMid[1], rx: 25, ry: 21, fill: skin, stroke: line, transform: `rotate(${p.torso} ${pelvisMid[0]} ${pelvisMid[1]})` })]),
    ...[trunkPart('lumbar', S.pelvis, S.lumbar), trunkPart('thorax', S.lumbar, S.thorax)].filter(Boolean),
    ...(useParts && PARTS ? [] : [seg(S.pelvis, S.lumbar, 40, 33)]),
    ...(useParts ? [] : [el('ellipse', { cx: thoraxMid[0], cy: thoraxMid[1], rx: 27, ry: 47, fill: skin, stroke: line, transform: `rotate(${p.thoraxA} ${thoraxMid[0]} ${thoraxMid[1]})` })]),
    ...(useParts ? [trunkPart('neck', S.thorax, S.neck)].filter(Boolean) : [seg(S.thorax, S.neck, 21, 19)]),
    // Omuz gövdeden yan görünümde HEP 14px uzakta (ölçüldü, 30 arketip × 21
    // kare). Bu mesafede yarıçapı 20 olan yuvarlak bir deltoid kapağı gövdeyi
    // zaten örtüyor; kama gereksiz ve düz kenarları gövdenin üstünde görünür
    // bir çentik bırakıyordu. Kapsül kipinde kama duruyor, orada uzuvlar zaten
    // ayrı ayrı okunuyor.
    ...(useParts
      ? [el('circle', { cx: S.sh[0], cy: S.sh[1], r: 20, fill: skin, stroke: line })]
      : [el('path', { d: shoulderWedge(S.thorax, S.sh, 20), fill: skin, stroke: line }), ball(S.sh, 17)]),
  ]);
  push([el('path', { d: footPath(S.ankle, footDirOf(e), pin, facingFlip(e.mode)), fill: skin, stroke: line })]);
  push(limb(S.pelvis, S.knee, 42, 33, 26, .42, false, 'thigh')); push(limb(S.knee, S.ankle, 26, 28, 13, .34, false, 'shin'));
  push([ball(S.knee, 13), ball(S.ankle, 9)]);
  push(limb(S.sh, S.elbow, 25, 22, 17, .5, false, 'upper')); push(limb(S.elbow, S.hand, 18, 18, 12, .3, false, 'fore'));
  push([ball(S.elbow, 10)]);
  push(useParts ? [hand(S.hand, S.elbow, false)] : [el('circle', { cx: S.hand[0], cy: S.hand[1], r: 10, fill: skin, stroke: line })]);
  if (e.load === 'dumbbell') push(db(S.hand, S.elbow, false));
  // Sırt üstü kiplerde profil aynalanıyor: kemik açısı başı doğru yere
  // koyuyor ama yüzün hangi yöne baktığını söyleyemiyor (bkz. facingFlip).
  const headT = `translate(${S.head[0]} ${S.head[1]}) rotate(${p.neckA}) scale(${facingFlip(e.mode)} 1)`;
  svg.appendChild(
    useParts
      ? el('g', { transform: headT }, [el('path', { d: headProfile(), fill: skin, stroke: line })])
        // Kapsül kipinin çene kaması da YEREL koordinatta: eskiden mutlak
        // noktalarla çizilip `rotate(a cx cy)` ile döndürülüyordu, o hâlde
        // aynalanamıyordu. Sayılar birebir aynı, yalnızca kafa merkezine göre.
      : el('g', { transform: headT }, [
          el('ellipse', { cx: 0, cy: -3, rx: 23, ry: 26, fill: skin, stroke: line }),
          el('path', { d: 'M -4 4 L 21 6 L 14 23 L -8 22 Z', fill: skin, stroke: line }),
        ]),
  );

  // Elde tutulan halter KAFADAN SONRA çiziliyor: figürün önünde duruyor, o
  // yüzden en üstte — `plate`'in başındaki not zaten bunu söylüyor. Sıra
  // ilk sürümden beri kafadan ÖNCEYDİ, yani not ile kod ayrışmıştı: tabak
  // bilerek saydamken kafa onu opak örtüyordu ve saydamlık tam da bu durum
  // için konmuştu. Önden görünüm barı zaten en üste çiziyor; aynı hareketin
  // iki görünümü ters katmanlanıyordu.
  //
  // Ölçüldü (41 arketip × 41 kare): tabak kafa merkezinin içine giren üç
  // hareket var — `seated_overhead_press` 24px, `face_pull_standing` 4px,
  // `lat_pulldown_seated` 2px. İlki bu turdan önce de vardı.
  if (e.bar === 'hands') push(plate(S.bar));

  drawHandles(svg, e, S, view);
}

/**
 * Sahnedeki ekipman — sehpa, basamak, barfiks barı, koltuk, bacak presi.
 *
 * Ana sahne ve telefon önizlemesi AYNI ekipmanı çizmek zorunda: önizleme
 * bunları hiç çizmiyordu ve figür sehpasız, barsız, koltuksuz görünüyordu —
 * bacak presinde adam zeminin 110px üstünde havada oturuyordu. Uygulamanın
 * `RigFigure.tsx`'i hepsini çiziyor; önizlemenin işi onu göstermek.
 *
 * Kareler arası değişmeyen şey sahne: konumlar 0. karenin iskeletinden
 * (`S0`) okunuyor, yoksa bar figürle birlikte kayardı.
 */
function drawProps(e, S0, S, push) {
  const surf2 = css('--surf2'), metal = css('--metal'), line = css('--line');
    if (e.prop === 'bar') push([
      el('rect', { x: S0.hand[0] - 150, y: BAR_Y - 6, width: 300, height: 12, rx: 6, fill: metal, stroke: line }),
      el('rect', { x: S0.hand[0] - 150, y: BAR_Y - 6, width: 12, height: 54, fill: metal, stroke: line }),
      el('rect', { x: S0.hand[0] + 138, y: BAR_Y - 6, width: 12, height: 54, fill: metal, stroke: line }),
    ]);
    if (e.prop === 'box') push([el('rect', { x: S0.ankle[0] - 62, y: S0.ankle[1] + 12, width: 150, height: Math.max(0, GROUND - S0.ankle[1] - 12), rx: 6, fill: surf2, stroke: line })]);
    if (e.prop === 'hipbench') push([
      el('rect', { x: S0.thorax[0] - 96, y: S0.thorax[1] + 26, width: 210, height: 18, rx: 8, fill: surf2, stroke: line }),
      el('rect', { x: S0.thorax[0] - 82, y: S0.thorax[1] + 44, width: 16, height: Math.max(0, GROUND - S0.thorax[1] - 44), fill: surf2, stroke: line }),
      el('rect', { x: S0.thorax[0] + 82, y: S0.thorax[1] + 44, width: 16, height: Math.max(0, GROUND - S0.thorax[1] - 44), fill: surf2, stroke: line }),
    ]);
    // Koltuk: kalçanın altında oturma yastığı, arkasında sırt dayaması.
    // Ayrı bir yardımcı, çünkü kablo ve bacak yastığı istasyonları da aynı
    // koltuğun üstüne kuruluyor — `prop` tek değer aldığı için her istasyon
    // kendi koltuğunu çizmek zorunda.
    const seat = () => [
      el('rect', { x: S0.pelvis[0] - 46, y: S0.pelvis[1] + 22, width: 150, height: 18, rx: 8, fill: surf2, stroke: line }),
      el('rect', { x: S0.pelvis[0] - 64, y: S0.pelvis[1] - 96, width: 20, height: 122, rx: 8, fill: surf2, stroke: line }),
      el('rect', { x: S0.pelvis[0] - 32, y: S0.pelvis[1] + 40, width: 16, height: Math.max(0, GROUND - S0.pelvis[1] - 40), fill: surf2, stroke: line }),
    ];
    if (e.prop === 'seatback') push(seat());

    // Kablo istasyonu: makara, kablo ve tutamak.
    //
    // Bu hareketler önce `bar: 'hands'` taşıyordu ve elde TABAKLI HALTER
    // çiziliyordu — lat pulldown'da kafanın üstünde kocaman bir disk. Direncin
    // nereden geldiği görünmüyordu. Kablo onu söylüyor: makara nerede, kuvvet
    // o yönden geliyor.
    if (e.prop === 'cable') {
      if (e.mode === 'seat') push(seat());
      const high = e.cableFrom === 'high';
      // Makara: baş üstünde (pulldown) ya da önde (kürek, pres, yüz çekişi).
      // Direği zemine iniyor, yani istasyon havada asılı değil.
      const px = high ? S0.hand[0] : Math.max(S.hand[0], S0.hand[0]) + 120;
      const py = high ? BAR_Y + 24 : S0.hand[1];
      push([
        el('rect', { x: px - 9, y: high ? BAR_Y : py, width: 18, height: Math.max(0, GROUND - (high ? BAR_Y : py)), rx: 4, fill: surf2, stroke: line }),
        ...(high ? [el('rect', { x: Math.min(px, S0.pelvis[0]) - 30, y: BAR_Y, width: Math.abs(px - S0.pelvis[0]) + 60, height: 16, rx: 6, fill: surf2, stroke: line })] : []),
        el('circle', { cx: px, cy: py, r: 13, fill: metal, stroke: line }),
        // Kablo makaradan ELE: figür oynarken uzayıp kısalıyor, çünkü çeken şey o.
        el('line', { x1: px, y1: py, x2: S.hand[0], y2: S.hand[1], stroke: metal, 'stroke-width': 4, 'stroke-linecap': 'round' }),
        // Tutamak: kabloya dik kısa bir çubuk. Pulldown'da geniş bar, ötekinde kol tutamağı.
        (() => {
          const dx = S.hand[0] - px, dy = S.hand[1] - py, L = Math.hypot(dx, dy) || 1;
          const w = high ? 74 : 26;
          return el('path', { d: capsule([S.hand[0] - (-dy / L) * w, S.hand[1] - (dx / L) * w], [S.hand[0] + (-dy / L) * w, S.hand[1] + (dx / L) * w], 8, 8), fill: metal, stroke: line });
        })(),
      ]);
    }

    // Bacak makinesi yastığı: baldır rulosu ve onu koltuğun eksenine bağlayan
    // kol. Yastıksız çizimde bacağın hangi yöne KUVVET UYGULADIĞI görünmüyor;
    // hareket oturup boşluğa tekme atmak gibi okunuyordu.
    //
    // Yastık, ayağın gittiği YÖNDE duruyor: direnç harekete karşı koyar, yani
    // ekstansiyonda baldırın önünde, curl'de arkasında. Yön veriden değil
    // hareketin kendisinden çıkıyor (0. kare → orta kare).
    if (e.prop === 'legpad') {
      push(seat());
      const mid = skeleton(e, poseAt(e, 0.45).p);
      let vx = mid.ankle[0] - S0.ankle[0], vy = mid.ankle[1] - S0.ankle[1];
      const vL = Math.hypot(vx, vy) || 1;
      vx /= vL; vy /= vL;
      const cx = S.ankle[0] + vx * 22, cy = S.ankle[1] + vy * 22;
      // Kol: rulodan diz ekseninin altındaki mile. Ruloyu makineye bağlıyor.
      push([
        el('path', { d: capsule([cx, cy], [S0.knee[0], S0.knee[1] + 34], 8, 8), fill: surf2, stroke: line }),
        el('circle', { cx, cy, r: 21, fill: metal, stroke: line }),
        el('circle', { cx, cy, r: 8, fill: surf2, stroke: line }),
      ]);
    }
    // Bacak presi makinesi: koltuk + sırt dayaması + zemine inen ayak + itilen
    // platform. Yalnızca platform çizildiğinde figür zeminin 110px üstünde
    // HİÇBİR ŞEYİN üstünde oturuyordu — `prop` tek değer aldığı için `sled`
    // seçmek `seatback`'i düşürüyor. Bir kızak yalnızca bacak presinde
    // bulunduğuna göre, tek prop bütün makineyi çizer.
    if (e.prop === 'sled') {
      const dx = S0.thorax[0] - S0.pelvis[0], dy = S0.thorax[1] - S0.pelvis[1];
      const L = Math.hypot(dx, dy) || 1;
      let nx = dy / L, ny = -dx / L;
      // Bacaklar önde; sırt dayaması onların ters yönünde.
      if ((S0.knee[0] - S0.pelvis[0]) * nx + (S0.knee[1] - S0.pelvis[1]) * ny > 0) { nx = -nx; ny = -ny; }
      const o = 30;
      const seatA = [S0.pelvis[0] + nx * o, S0.pelvis[1] + ny * o];
      const seatB = [S0.thorax[0] + nx * o + (dx / L) * 26, S0.thorax[1] + ny * o + (dy / L) * 26];
      const padX = S0.pelvis[0] + nx * 16, padY = S0.pelvis[1] + ny * 16;
      push([
        el('path', { d: capsule(seatA, seatB, 22, 19), fill: surf2, stroke: line }),
        el('path', { d: capsule([padX, padY], [padX + 78, padY + 10], 18, 15), fill: surf2, stroke: line }),
        el('rect', { x: padX + 4, y: padY + 14, width: 16, height: Math.max(0, GROUND - padY - 14), fill: surf2, stroke: line }),
      ]);
      // Kızak SABİT DEĞİL ve havada durmuyor.
      //
      // Sehpa, basamak ve barfiks barı sahnenin durağan parçaları, o yüzden
      // 0. kareden çiziliyorlar. Bacak presinde kızak sahnenin HAREKET EDEN
      // parçası: ayak ona basılı kalır, ikisi birlikte gider ve levha bacağa
      // kuvvet uygular. Sabit çizilince bacak tekrar boyunca içinden geçiyordu.
      //
      // Levha ayağın TABAN DÜZLEMİNE oturuyor (`solePoints`), itiş eksenine
      // değil: ayak bileğinden sabit mesafe ölçmek parmak ucunu levhanın
      // içinde bırakıyordu. Ray levhayı koltuğun direğine bağlıyor — makine
      // tek parça, plaka havada asılı değil.
      const [heelP, toeP] = solePoints(S.ankle, footDirOf(e), false, facingFlip(e.mode));
      const sx = toeP[0] - heelP[0], sy = toeP[1] - heelP[1];
      const sL = Math.hypot(sx, sy) || 1;
      const tx = sx / sL, ty = sy / sL;              // taban ekseni
      const ox = -ty * facingFlip(e.mode), oy = tx * facingFlip(e.mode);  // tabandan dışa
      const A = [heelP[0] - tx * 34 + ox * 8, heelP[1] - ty * 34 + oy * 8];
      const B = [toeP[0] + tx * 34 + ox * 8, toeP[1] + ty * 34 + oy * 8];
      const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
      push([
        el('path', { d: capsule(mid, [padX + 12, padY + 6], 7, 7), fill: surf2, stroke: line }),
        el('path', { d: capsule(A, B, 15, 15), fill: metal, stroke: line }),
      ]);
    }
    if (e.prop === 'bench' && e.mode === 'bench') {
      const t0 = poseAt(e, 0).p.torso;
      const deg = (Math.atan2(-Math.cos((t0 * Math.PI) / 180), Math.sin((t0 * Math.PI) / 180)) * 180) / Math.PI;
      push([el('g', { transform: `rotate(${deg} ${S0.pelvis[0]} ${S0.pelvis[1]})` }, [
        el('rect', { x: S0.pelvis[0] - 70, y: S0.pelvis[1] + 24, width: 330, height: 20, rx: 10, fill: surf2, stroke: line })])]);
      push([el('rect', { x: S0.pelvis[0] - 56, y: S0.pelvis[1] + 44, width: 16, height: Math.max(0, GROUND - S0.pelvis[1] - 44), fill: surf2, stroke: line })]);
    }
    if (e.prop === 'bench' && e.mode !== 'bench') push([
      el('rect', { x: S0.ankleF[0] - 70, y: S0.ankleF[1] + 16, width: 150, height: 16, rx: 8, fill: surf2, stroke: line }),
    ]);

}

/** Tutamaklar yalnızca kare düzenlenirken; ara karede poz kimseye ait değil. */
function drawHandles(svg, e, S, view) {
  if (!editable() || view === 'front') return;
  const accent = css('--p');
  const hiddenJoints = new Set([
    ...(showFarLeg(e) ? [] : ['kneeF', 'ankleF']),
    ...(e.hideFarArm ? ['elbowF', 'handF'] : []),
  ]);
  dragHandles(e, S).filter((h) => !hiddenJoints.has(h.joint)).forEach((h) => {
    const g = el('g', { class: 'handle', 'data-joint': h.joint });
    g.appendChild(el('circle', { cx: h.at[0], cy: h.at[1], r: 15, fill: 'transparent' }));
    g.appendChild(el('circle', { cx: h.at[0], cy: h.at[1], r: 7, fill: 'none', stroke: accent, 'stroke-width': 2, opacity: h.far ? .5 : 1 }));
    g.appendChild(el('circle', { cx: h.at[0], cy: h.at[1], r: 2.4, fill: accent, opacity: h.far ? .5 : 1 }));
    const title = el('title', {});
    title.textContent = h.label;
    g.appendChild(title);
    // Etiket sürüklerken görünür: hangi eklemi tuttuğun halkadan anlaşılmıyor.
    if (dragging === h.joint) {
      const t = el('text', { x: h.at[0] + 14, y: h.at[1] - 12, fill: accent, 'font-size': 15, 'font-weight': 700 });
      t.textContent = h.label;
      g.appendChild(t);
    }
    svg.appendChild(g);
  });
}

// --- sürükleme -----------------------------------------------------------

/** Ekran noktasını viewBox koordinatına çevirir. */
function toWorld(evt) {
  const svg = $('stage');
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  const m = svg.getScreenCTM().inverse();
  const q = pt.matrixTransform(m);
  return [q.x, q.y];
}

function startDrag(evt) {
  const g = evt.target.closest && evt.target.closest('.handle');
  if (!g || !editable()) return;
  snapshot();
  dragging = g.dataset.joint;
  if (evt.pointerId != null && $('stage').setPointerCapture) {
    try { $('stage').setPointerCapture(evt.pointerId); } catch { /* yakalama zorunlu değil */ }
  }
  evt.preventDefault();
}

function moveDrag(evt) {
  if (!dragging) return;
  const e = ex();
  const S = skeleton(e, fillPose(frame().p));
  const patch = dragJoint(e, S, dragging, toWorld(evt));
  if (Object.keys(patch).length === 0) return;
  frame().p = applyPatch(frame().p, patch);
  markDirty();
  syncViewBox();
  draw();
  drawPhoneFigure();
  renderSliders();
  renderIssues();
}

const endDrag = () => {
  if (dragging) {
    dragging = null;
    draw();
  }
};

// Hem pointer hem mouse: bazı girdi yolları (dokunmatik sürücüler, uzaktan
// kumanda edilen tarayıcılar) pointer olayı üretmiyor ve tutamak ölü kalıyor.
$('stage').addEventListener('pointerdown', startDrag);
$('stage').addEventListener('pointermove', moveDrag);
$('stage').addEventListener('pointerup', endDrag);
$('stage').addEventListener('pointercancel', endDrag);
$('stage').addEventListener('mousedown', startDrag);
window.addEventListener('mousemove', moveDrag);
window.addEventListener('mouseup', endDrag);

// --- paneller ------------------------------------------------------------

function markDirty() {
  dirty = true;
  $('savedMsg').textContent = 'kaydedilmedi';
  $('savedMsg').style.color = css('--warn');
  // Sürükleme zaman çubuğunu yeniden çizmiyor; geri al düğmesi devre dışı
  // kalırsa ilk sürüklemeden sonra geri alma tıklanamıyor.
  syncHistoryButtons();
}

function syncHistoryButtons() {
  $('undo').disabled = undoStack.length === 0;
  $('redo').disabled = redoStack.length === 0;
}

/**
 * Listedeki uyarı rozeti.
 *
 * Denetim pahalı: 30 arketip × 21 kare, tek geçiş ~64ms. Zaman çubuğunu
 * sürüklerken bu her `input` olayında yeniden koşuyordu ve çubuk takılıyordu.
 * Sonuç hareketin kendi verisine bağlı, o yüzden veri değişmedikçe duruyor.
 */
const issueCounts = new Map();
function issueCountFor(k) {
  const sig = JSON.stringify(DATA[k]);
  const hit = issueCounts.get(k);
  if (hit && hit.sig === sig) return hit.n;
  const n = auditExercise(DATA[k]).length + auditLoop(DATA[k]).length;
  issueCounts.set(k, { sig, n });
  return n;
}

function renderExList() {
  const host = $('exList');
  host.innerHTML = '';
  Object.keys(DATA).forEach((k) => {
    // Anahtar (`hip_hinge_dumbbell`) kimsenin kafasındaki isim değil;
    // kütüphanedeki Türkçe adlar üstte, anahtar altta.
    const names = NAMES[k] || [];
    const label = names[0] || k;
    const hay = (label + ' ' + names.join(' ') + ' ' + k).toLowerCase();
    if (filter && !hay.includes(filter)) return;
    const issues = issueCountFor(k);
    const b = document.createElement('button');
    b.setAttribute('aria-pressed', String(k === key));
    b.innerHTML =
      `${issues ? `<span class="bad">${issues}</span>` : ''}` +
      `${DATA[k].view === 'front' ? '<span class="front">ÖNDEN</span>' : ''}` +
      `<b>${label}</b><small>${names.length > 1 ? names.slice(1).join(', ') + ' · ' : ''}${k}</small>`;
    b.onclick = () => { key = k; kfIndex = 0; playing = false; scrubT = null; phonePlayT = 0; renderAll(); };
    host.appendChild(b);
  });
  if (!host.children.length) host.innerHTML = '<p class="hint">Eşleşen hareket yok.</p>';
}

function renderKf() {
  const e = ex();
  const ticks = $('ticks');
  ticks.innerHTML = '';
  e.kf.forEach((k, i) => {
    const tick = document.createElement('i');
    tick.style.left = `${k.t * 100}%`;
    if (i === kfIndex && editable()) tick.className = 'on';
    tick.title = k.tr;
    ticks.appendChild(tick);
    // Etiket yalnızca seçili kare için: yan yana iki kare (%42 ve %55 gibi)
    // etiketleri üst üste bindiriyor ve ikisi de okunmuyor.
    if (i === kfIndex && editable()) {
      const lbl = document.createElement('span');
      lbl.style.left = `${Math.min(94, Math.max(6, k.t * 100))}%`;
      lbl.textContent = `${k.tr} · %${(k.t * 100).toFixed(0)}`;
      ticks.appendChild(lbl);
    }
  });
  $('scrub').value = String(Math.round(currentT() * 1000));
  $('kfName').value = frame().tr ?? '';
  $('kfTime').value = String(frame().t);
  // Önden görünüm yan çözümden türeyen şematik bir izdüşüm: orada sürüklenecek
  // bağımsız bir eklem yok. Bunu söylemek, tutamakları arayan birini
  // "bozuk mu?" sorusundan kurtarıyor.
  const planeNote = plane === 'front' ? ' · önden görünümde sürükleme yok, açıları sağdan düzenle' : '';
  $('frameInfo').textContent = playing
    ? `oynuyor · %${(playT * 100).toFixed(0)}`
    : scrubT !== null
      ? `ara kare · %${(scrubT * 100).toFixed(0)} — düzenlemek için bir kareye dön`
      : `kare ${kfIndex + 1}/${e.kf.length} · %${(frame().t * 100).toFixed(0)} ${frame().tr}${planeNote}`;
  $('delKf').disabled = e.kf.length <= 2;
  $('undo').disabled = undoStack.length === 0;
  $('redo').disabled = redoStack.length === 0;
}

/** Bu harekette hangi alanların anlamı var — gerisi gürültü. */
function relevantFields(e) {
  const out = ['shinA', 'thighA', 'torso', 'thoraxA', 'neckA'];
  if (e.arm === 'angles') out.push('upperA', 'foreA');
  else out.push('hx');
  if (e.arm === 'ik') out.push('hy');
  out.push('thighF', 'shinF');
  if (e.arm === 'angles') out.push('upperF', 'foreF');
  if (e.view === 'front') out.push('hxF', 'shLift');
  if (e.mode === 'stand') out.push('ankleLift');
  return out;
}

function renderSliders() {
  const host = $('sliders');
  const e = ex();
  const p = fillPose(frame().p);
  const fields = relevantFields(e);
  $('anglesTitle').textContent = editable() ? 'Açılar' : 'Açılar (ara kare — salt okunur)';
  host.innerHTML = '';
  ANGLES.filter(([f]) => fields.includes(f)).forEach(([field, label, min, max]) => {
    const row = document.createElement('div');
    row.className = 'row';
    const value = Math.round(p[field] * 10) / 10;
    row.innerHTML = `<label for="s_${field}">${label}</label>
      <input id="s_${field}" type="range" min="${min}" max="${max}" step="0.5" value="${value}" ${editable() ? '' : 'disabled'}>
      <input id="n_${field}" type="number" step="0.5" value="${value}" ${editable() ? '' : 'disabled'}>`;
    const range = row.querySelector('input[type=range]');
    const num = row.querySelector('input[type=number]');
    let live = false;
    const set = (v, from) => {
      if (!editable()) return;
      // Sürükleme başına tek anlık görüntü: her pikselde bir tane alınırsa
      // geri alma yığını tek hamleyi yüzlerce adıma bölüyor.
      if (!live) { snapshot(); live = true; }
      frame().p = applyPatch(frame().p, { [field]: Number(v) });
      if (from !== 'range') range.value = String(v);
      if (from !== 'num') num.value = String(v);
      markDirty();
      syncViewBox();
      draw();
      drawPhoneFigure();
      renderIssues();
    };
    range.oninput = () => set(range.value, 'range');
    range.onchange = () => { live = false; };
    num.onchange = () => { set(num.value, 'num'); live = false; };
    // Ok tuşları: kaydırıcı üstünde 1°, Shift ile 5°.
    range.onkeydown = (evt) => {
      const step = evt.shiftKey ? 5 : 1;
      if (evt.key === 'ArrowUp' || evt.key === 'ArrowRight') { set(Number(range.value) + step, null); evt.preventDefault(); }
      if (evt.key === 'ArrowDown' || evt.key === 'ArrowLeft') { set(Number(range.value) - step, null); evt.preventDefault(); }
      live = false;
    };
    host.appendChild(row);
  });
}

function renderIssues() {
  const host = $('issues');
  const e = ex();
  const here = editable() ? auditFrame(e, fillPose(frame().p), frame().t) : auditFrame(e, currentPose(), currentT());
  const whole = [...auditExercise(e), ...auditLoop(e)];
  host.innerHTML = '';
  if (here.length === 0 && whole.length === 0) {
    host.innerHTML = '<div class="ok">✓ bu hareket temiz</div>';
    return;
  }
  const seen = new Set();
  const add = (label, issue, jump) => {
    const text = `${label} · ${issue.message}`;
    if (seen.has(text)) return;
    seen.add(text);
    const b = document.createElement('button');
    b.textContent = text;
    // Sorunun yaşandığı ana gitmek: hatayı görmeden düzeltmek zor.
    b.onclick = () => {
      if (jump !== null) goToTime(jump);
      renderAll();
    };
    host.appendChild(b);
  };
  here.forEach((i) => add('bu kare', i, null));
  whole.forEach((i) => add(`%${(i.t * 100).toFixed(0)}`, i, i.t));
}

function renderEquipment() {
  const e = ex();
  const bind = (id, opts, value, apply) => {
    const sel = $(id);
    sel.innerHTML = '';
    opts.forEach(([v, label]) => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = label;
      sel.appendChild(o);
    });
    sel.value = value;
    sel.onchange = () => { apply(sel.value); markDirty(); renderAll(); };
  };
  bind('mode', OPTIONS.mode, e.mode, (v) => (e.mode = v));
  bind('arm', OPTIONS.arm, e.arm, (v) => (e.arm = v));
  bind('barSel', OPTIONS.bar, e.bar ?? '', (v) => (e.bar = v || null));
  bind('load', OPTIONS.load, e.load ?? '', (v) => (v ? (e.load = v) : delete e.load));
  bind('prop', OPTIONS.prop, e.prop ?? '', (v) => (v ? (e.prop = v) : delete e.prop));
  bind('viewSel', OPTIONS.view, e.view ?? 'side', (v) => (v === 'side' ? delete e.view : (e.view = v)));
  bind('bend', OPTIONS.bend, String(e.bend), (v) => (e.bend = Number(v)));
  // Uzak bacak üç durumlu: kural (varsayılan), elle görünür, elle gizli.
  // Kural, uzak bacağın yakınından ayrı bir hareketi olup olmadığına bakıyor;
  // elle seçim yalnızca kuralın dışına çıkmak için.
  const leg = $('farLeg');
  const auto = showFarLeg({ ...e, hideFarLeg: undefined });
  leg.textContent =
    e.hideFarLeg === undefined ? `Kural: ${auto ? 'görünür' : 'gizli'}` : e.hideFarLeg ? 'Elle: gizli' : 'Elle: görünür';
  leg.setAttribute('aria-pressed', String(showFarLeg(e)));
  leg.onclick = () => {
    snapshot();
    if (e.hideFarLeg === undefined) e.hideFarLeg = auto;       // kuralın tersi
    else if (e.hideFarLeg) e.hideFarLeg = false;
    else delete e.hideFarLeg;                                   // kurala dön
    markDirty();
    renderAll();
  };

  const arm = $('farArm');
  arm.textContent = e.hideFarArm ? 'Gizli' : 'Görünür';
  arm.setAttribute('aria-pressed', String(!e.hideFarArm));
  arm.onclick = () => {
    snapshot();
    if (e.hideFarArm) delete e.hideFarArm;
    else e.hideFarArm = true;
    markDirty();
    renderAll();
  };
  $('dur').value = String(e.dur);
  // Alt sınır şemadan geliyor (`src/rigSchema.ts` MIN_DUR): editörün daha
  // gevşek olması, burada kaydedilip testte düşen veri demekti.
  $('dur').onchange = () => {
    const n = Number($('dur').value);
    if (!(n > 2000)) {
      $('dur').value = String(e.dur);
      $('savedMsg').textContent = 'süre 2000ms üstü olmalı';
      $('savedMsg').style.color = css('--warn');
      return;
    }
    snapshot();
    e.dur = n;
    markDirty();
  };
}

function renderAll() {
  renderExList();
  renderKf();
  renderSliders();
  renderEquipment();
  renderIssues();
  renderPhone();
  syncViewBox();
  draw();
}

// --- kare işlemleri ------------------------------------------------------

$('addKf').onclick = () => {
  snapshot();
  const e = ex();
  const cur = e.kf[kfIndex];
  const next = e.kf[kfIndex + 1];
  const t = next ? (cur.t + next.t) / 2 : Math.min(1, cur.t + 0.1);
  e.kf.splice(kfIndex + 1, 0, { t: Math.round(t * 100) / 100, tr: cur.tr, p: { ...cur.p } });
  kfIndex += 1;
  markDirty();
  renderAll();
};

$('delKf').onclick = () => {
  const e = ex();
  if (e.kf.length <= 2) return;
  snapshot();
  e.kf.splice(kfIndex, 1);
  kfIndex = Math.max(0, kfIndex - 1);
  markDirty();
  renderAll();
};

$('kfName').onchange = () => { snapshot(); frame().tr = $('kfName').value; markDirty(); renderKf(); };

// Hareket sonsuz döner: son kare ilkinden farklıysa her tekrarda zıplıyor.
$('closeLoop').onclick = () => {
  snapshot();
  const e = ex();
  e.kf[e.kf.length - 1].p = { ...e.kf[0].p };
  markDirty();
  renderAll();
};
$('kfTime').onchange = () => {
  const e = ex();
  const t = Number($('kfTime').value);
  const reject = (why) => {
    $('kfTime').value = String(frame().t);
    $('savedMsg').textContent = why;
    $('savedMsg').style.color = css('--warn');
  };
  if (!(t >= 0 && t <= 1)) return reject('kare zamanı 0 ile 1 arasında olmalı');
  // Uçlar döngünün tanımı: ilk kare %0'da, son kare %100'de. Ortadaki bir
  // kareyi uca taşımak, editörde kaydedilip `npm test`'te düşen veri
  // üretiyordu.
  const isFirst = kfIndex === 0;
  const isLast = kfIndex === e.kf.length - 1;
  if (isFirst && t !== 0) return reject('ilk kare %0’da kalmalı — döngü orada kapanıyor');
  if (isLast && t !== 1) return reject('son kare %100’de kalmalı — döngü orada kapanıyor');
  if (!isFirst && !isLast && (t === 0 || t === 1)) return reject('ara kare uçlara oturamaz');

  snapshot();
  const moved = frame();
  moved.t = t;
  e.kf.sort((a, b) => a.t - b.t);
  // Sıralama kareleri yer değiştiriyor; seçim İNDİSE değil KAREYE bağlı
  // kalmalı, yoksa bir sonraki düzenleme sessizce başka bir kareye gidiyor.
  kfIndex = e.kf.indexOf(moved);
  markDirty();
  renderAll();
};

// --- üst çubuk -----------------------------------------------------------

$('viewSide').onclick = () => { plane = 'side'; $('viewSide').setAttribute('aria-pressed', 'true'); $('viewFront').setAttribute('aria-pressed', 'false'); syncViewBox(); draw(); };
$('viewFront').onclick = () => { plane = 'front'; $('viewSide').setAttribute('aria-pressed', 'false'); $('viewFront').setAttribute('aria-pressed', 'true'); syncViewBox(); draw(); };

$('compare').onclick = () => {
  cmpOn = true;
  $('cmp').classList.add('on');
  renderCompare();
};
const closeCmp = () => { cmpOn = false; $('cmp').classList.remove('on'); };
$('cmpClose').onclick = closeCmp;
window.addEventListener('keydown', (evt) => { if (evt.key === 'Escape' && cmpOn) closeCmp(); });

$('parts').onclick = () => {
  useParts = !useParts;
  $('parts').setAttribute('aria-pressed', String(useParts));
  $('parts').textContent = useParts ? 'Parça' : 'Kapsül';
  draw();
};

$('undo').onclick = () => {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify(DATA));
  restore(undoStack.pop());
  markDirty();
};

$('redo').onclick = () => {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify(DATA));
  restore(redoStack.pop());
  markDirty();
};

$('revert').onclick = async () => {
  if (dirty && !confirm('Kaydedilmemiş değişiklikler atılacak. Diskteki hâline dönülsün mü?')) return;
  snapshot();
  DATA = await (await fetch('/data')).json();
  if (!DATA[key]) key = Object.keys(DATA)[0];
  kfIndex = 0;
  dirty = false;
  $('savedMsg').textContent = 'diskten yüklendi';
  $('savedMsg').style.color = css('--sub');
  renderAll();
};

$('scrub').oninput = () => {
  goToTime(Number($('scrub').value) / 1000);
  // Zaman çubuğunda gezinmek ne hareket listesini ne ekipmanı değiştiriyor;
  // `renderAll` burada boşuna iş yapıyordu.
  renderKf();
  renderSliders();
  renderIssues();
  draw();
  drawPhoneFigure();
};

$('play').onclick = () => {
  scrubT = null;
  playing = !playing;
  $('play').textContent = playing ? 'Durdur' : 'Oynat';
  $('play').setAttribute('aria-pressed', String(playing));
  renderAll();
};

$('save').onclick = async () => {
  $('save').disabled = true;
  try {
    const res = await fetch('/data', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(DATA, null, 2) });
    const out = await res.json();
    if (!out.ok) throw new Error(out.error);
    dirty = false;
    $('savedMsg').textContent = `kaydedildi (${out.count} arketip)`;
    $('savedMsg').style.color = css('--p');
  } catch (e) {
    $('savedMsg').textContent = 'kaydedilemedi: ' + e.message;
    $('savedMsg').style.color = css('--danger');
  } finally {
    $('save').disabled = false;
  }
};

// Kısayollar: kaydetme ve geri alma, elin fareden kalkmadan.
window.addEventListener('keydown', (evt) => {
  const meta = evt.metaKey || evt.ctrlKey;
  if (meta && evt.key.toLowerCase() === 's') { evt.preventDefault(); $('save').click(); }
  if (meta && evt.key.toLowerCase() === 'z' && !evt.shiftKey) { evt.preventDefault(); $('undo').click(); }
  if (meta && evt.key.toLowerCase() === 'z' && evt.shiftKey) { evt.preventDefault(); $('redo').click(); }
  if (evt.key === ' ' && evt.target === document.body) { evt.preventDefault(); $('play').click(); }
});

$('phoneMode').onclick = () => {
  phoneMode = phoneMode === 'phases' ? 'live' : 'phases';
  $('phoneMode').textContent = phoneMode === 'phases' ? 'Evre' : 'Canlı';
  renderPhone();
};

$('phoneOn').onclick = () => {
  phoneOn = !phoneOn;
  $('phoneOn').textContent = phoneOn ? '◉' : '○';
  $('phoneOn').setAttribute('aria-pressed', String(phoneOn));
  renderPhone();
};
PHONES.forEach((d, i) => {
  const o = document.createElement('option');
  o.value = String(i);
  o.textContent = d.label;
  $('phoneSize').appendChild(o);
});
const LAYOUTS = [
  ['full', 'Geniş: canlı + evreler'],
  ['stack', 'Yalnız evreler'],
  ['compact', 'Sıkı: animasyon küçük'],
];
LAYOUTS.forEach(([v, label]) => {
  const o = document.createElement('option');
  o.value = v;
  o.textContent = label;
  $('phoneLayout').appendChild(o);
});
$('phoneLayout').value = phoneLayout;
$('phoneLayout').onchange = () => { phoneLayout = $('phoneLayout').value; renderPhone(); };

$('phoneSize').onchange = () => { phoneSize = Number($('phoneSize').value); renderPhone(); };

$('search').oninput = () => { filter = $('search').value.trim().toLowerCase(); renderExList(); };

window.addEventListener('beforeunload', (e) => {
  if (!dirty) return;
  e.preventDefault();
  e.returnValue = '';
});

let last = 0;
/**
 * Faz duvar saatinden DEĞİL, biriken süreden çıkıyor.
 *
 * Eskiden `now / dur` idi: hareket değiştirince `dur` da değiştiği için faz
 * zıplıyordu, yani listeden bir harekete geçtiğinde figür tekrarın rastgele
 * bir yerinden başlıyordu. Birikimli sayaç her harekete tekrarın başından
 * başlatıyor.
 */
function tick(now) {
  const dt = last ? Math.min(100, now - last) : 0;
  last = now;
  if (dt) {
    phonePlayT = (phonePlayT + dt / ex().dur) % 1;
    // Önizleme her zaman oynuyor; ana sahne yalnızca "Oynat" açıkken.
    drawPhoneFigure();
    renderCompare();
    if (playing) {
      playT = phonePlayT;
      draw();
      $('frameInfo').textContent = `oynuyor · ${(playT * 100).toFixed(0)}%`;
    }
  }
  requestAnimationFrame(tick);
}

const boot = async () => {
  const [data, names, muscles, anatomy, parts] = await Promise.all([
    fetch('/data').then((r) => r.json()),
    fetch('/names').then((r) => r.json()).catch(() => ({})),
    fetch('/muscles').then((r) => r.json()).catch(() => ({})),
    fetch('/anatomy').then((r) => r.json()).catch(() => null),
    fetch('/parts').then((r) => r.json()).catch(() => null),
  ]);
  MUSCLEDATA = muscles;
  ANATOMY = anatomy && anatomy.front ? anatomy : null;
  PARTS = parts && parts.parts ? parts.parts : null;
  DATA = data;
  // Katalog kimlik başına (`walking-lunge` → ad + arketip); liste ise arketip
  // başına çiziliyor. Bir arketip birden çok harekete hizmet edebildiği için
  // (unilateral_lunge üç hareket) ters çeviriyoruz.
  CATALOG = names;
  NAMES = {};
  for (const e of Object.values(names)) {
    (NAMES[e.archetype] ||= []).push(e.name);
  }
  key = Object.keys(DATA)[0];
  renderAll();
  requestAnimationFrame(tick);
};
boot();
