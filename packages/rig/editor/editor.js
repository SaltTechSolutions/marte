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
  BAR_Y, CENTER_X, D, FX, GROUND, add, boundsFor, capsule, facingFlip, fillPose, footDirFor, footDirFarOf, footDirOf, footPath,
  propShift,
  frontPoints, frontTorsoPath, frontTrunk, handPath, headProfile, lerpP, partTransform, pelvisMass, poseAt,
  shoulderWedge, showFarLeg, skeleton, solePoints,
} from '/engine/rig.js';
import { applyPatch, dragFootDir, dragHandles, dragJoint } from '/engine/rigEdit.js';
import { dragFootDirFar } from '/engine/rig.js';
import { auditExercise, auditFrame, auditLoop } from '/engine/rigAudit.js';
import { groupsOf, labelsOf } from '/engine/muscles.js';

const NS = 'http://www.w3.org/2000/svg';
/** Elips → yol. Zincire giren her şey `d` taşımak zorunda. */
const ellipsePath = (c, rx, ry) =>
  `M ${c[0] - rx} ${c[1]} a ${rx} ${ry} 0 1 0 ${rx * 2} 0 a ${rx} ${ry} 0 1 0 ${-rx * 2} 0 Z`;
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
/** Metinler AYRI dosyaya gidiyor; ayrı kirli bayrağı taşıyorlar. */
let textsDirty = false;
/** Metin panelinde seçili hareketin kimliği (arketip değil — hareket). */
let txtId = null;
let txtOn = false;
let txtFilter = '';
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

// Poz ve metin TEK yığında: kullanıcı ⌘Z'yi "az önce ne yaptıysam onu geri al"
// diye biliyor, hangi dosyaya yazdığını değil. İki ayrı yığın, metni düzeltip
// sonra eklem sürükleyen birinde yanlış hamleyi geri alırdı.
const takeSnapshot = () => JSON.stringify({ DATA, CATALOG });

const snapshot = (json = takeSnapshot()) => {
  undoStack.push(json);
  if (undoStack.length > 60) undoStack.shift();
  redoStack.length = 0;
};

const restore = (json) => {
  const snap = JSON.parse(json);
  DATA = snap.DATA;
  CATALOG = snap.CATALOG;
  rebuildNames();
  if (!DATA[key]) key = Object.keys(DATA)[0];
  if (!CATALOG[txtId]) txtId = null;
  kfIndex = Math.min(kfIndex, ex().kf.length - 1);
  renderAll();
  // Panel açıksa geri alınan metin EKRANDA da dönmeli: `renderAll` sahneyi
  // çiziyor, metin panelini değil.
  if (txtOn) renderTexts();
};

/**
 * Katalog kimlik başına (`walking-lunge` → ad + arketip); sol liste ise arketip
 * başına çiziliyor. Bir arketip birden çok harekete hizmet edebildiği için
 * (unilateral_lunge üç hareket) ters çeviriyoruz.
 */
function rebuildNames() {
  NAMES = {};
  for (const e of Object.values(CATALOG)) {
    (NAMES[e.archetype] ||= []).push(e.name);
  }
}

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
/** Görünen kenar çizgisi kalınlığı. `RigFigure.tsx`'teki `EDGE_W` ile aynı. */
const EDGE_W = 1.6;

/**
 * Bir uzuv zincirini TEK siluet gibi çizer.
 *
 * Uzuvlar kemik başına ayrı yollardan kuruluyor (uyluk + baldır + diz topu).
 * Her parçayı ayrı ayrı konturlamak uzvun ORTASINDAN geçen enine dikiş
 * çizgileri bırakıyordu; düz kolda dirsek, düz bacakta diz hizasında bir
 * çizgi olarak görünüyordu. Eklem topu da dolgu rengindeydi ve siluetin
 * dışına taştığında yumru yapıyordu.
 *
 * İki geçiş: altta hat renginde ŞİŞİRİLMİŞ kopya (kontur `EDGE_W`'nin iki
 * katı, yani her yandan `EDGE_W` dışarı), üstte konturu olmayan dolgu.
 * Dışarıda kalan şerit zincirin DIŞ hattı oluyor; parçalar arasındaki bütün
 * ekler dolgunun altında kalıyor.
 *
 * Zincir sınırları çizim sırasını taşıyor: gövde ile yakın kol ayrı
 * zincirler, çünkü kolun gövdenin önünden geçtiği yerde hat İSTENİYOR.
 *
 * Aynısı `RigFigure.tsx`'te `Chain` olarak yazılı — çizim iki yerde ayrı
 * yazılıyor ama görünüm ayrışamaz (bkz. AGENTS.md).
 */
const chain = (specs, fill, edge) => {
  const paint = (q, alt) => {
    const a = alt
      ? { fill: edge, stroke: edge, 'stroke-width': EDGE_W * 2, 'stroke-linejoin': 'round' }
      : { fill, stroke: null };
    return q.d != null
      ? el('path', { d: q.d, transform: q.tf, ...a })
      : el('circle', { cx: q.c[0], cy: q.c[1], r: q.r, ...a });
  };
  const list = specs.filter(Boolean);
  return [
    el('g', {}, list.map((q) => paint(q, true))),
    el('g', {}, list.map((q) => paint(q, false))),
  ];
};

/** Zincire girecek uzuv parçaları (çizmez, tarif eder). */
const mkLimb = () => (a, b, wa, wm, wb, at, far, name) => {
  const q = useParts && name && PARTS && PARTS[name];
  if (q) return [{ d: q.d, tf: partTransform(a, b) }];
  const m = lerpP(a, b, at);
  return [{ d: capsule(a, m, wa, wm) }, { d: capsule(m, b, wm, wb) }];
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
/**
 * Baş profili — gövdeyle AYNI kalınlıkta hatla.
 *
 * Baş, zincirden geçmeyen tek parçaydı ve düz bir konturla çiziliyordu. Düz
 * kontur yola ORTALANIR, yani yarısı şeklin içinde kalır; zincirin hattı ise
 * tamamen dışarıda durur. Sonuç: gövdenin hattı belirgin, kafanınki yarı
 * kalınlıkta. Ana sahnede daha da kötüydü — orada kafa sahne eşyasının soluk
 * `--line` rengiyle konturlanıyordu, yani neredeyse hiç hattı yoktu.
 *
 * Aynı iki geçiş: altta hat renginde şişirilmiş kopya, üstte konturu olmayan
 * dolgu. Dönüşüm ikisini birden sarıyor.
 */
const headNodes = (e, S, p, fill, edge) => [
  el('g', { transform: `translate(${S.head[0]} ${S.head[1]}) rotate(${p.neckA}) scale(${facingFlip(e.mode)} 1)` }, [
    el('path', { d: headProfile(), fill: edge, stroke: edge, 'stroke-width': EDGE_W * 2, 'stroke-linejoin': 'round' }),
    el('path', { d: headProfile(), fill }),
  ]),
];

/**
 * El, ön kolun yönünde uzanıyor: bileği (0,0) kabul edip aynı kemik dönüşümünü
 * kullanıyoruz, böylece elin yönü koldan geliyor — daire bunu söyleyemiyordu.
 *
 * MODÜL seviyesinde, `dumbbellAt` ile aynı gerekçe: iki çizim yolu da
 * çağırıyor. `draw()` içine gömülüyken telefon önizlemesi elleri hiç
 * çizmiyordu.
 */
const handAt = (wrist, elbow) => {
  const dx = wrist[0] - elbow[0];
  const dy = wrist[1] - elbow[1];
  const l = Math.hypot(dx, dy) || 1;
  return { d: handPath(), tf: partTransform(wrist, [wrist[0] + (dx / l) * 18, wrist[1] + (dy / l) * 18]) };
};

/**
 * Dambıl: kısa sap, iki ucunda ağırlık. Ön kola DİK duruyor — elin kavradığı
 * yön bu. Barbell tabağını küçültmek dambıl yapmıyor; iki ayrı ağırlık olduğu
 * görünmeli.
 *
 * MODÜL seviyesinde, çünkü iki çizim yolu da çağırıyor: ana sahne ve telefon
 * önizlemesi. `draw()` içine gömülüyken önizleme ona erişemiyordu ve dokuz
 * dambıllı arketipte ağırlık hiç çizilmiyordu — önizleme uygulamayı değil
 * eksik bir figürü gösteriyordu.
 */
const dumbbellAt = (c, from, far) => {
  const deg = (Math.atan2(c[1] - from[1], c[0] - from[0]) * 180) / Math.PI + 90;
  const fill = far ? css('--skinFar') : css('--metal');
  const line = css('--line');
  const accent = css('--p');
  return [el('g', { transform: `rotate(${deg} ${c[0]} ${c[1]})` }, [
    el('rect', { x: c[0] - 17, y: c[1] - 4, width: 34, height: 8, rx: 4, fill, stroke: line }),
    el('rect', { x: c[0] - 25, y: c[1] - 13, width: 13, height: 26, rx: 4, fill, stroke: accent }),
    el('rect', { x: c[0] + 12, y: c[1] - 13, width: 13, height: 26, rx: 4, fill, stroke: accent }),
  ])];
};

const plateAt = (c) => (c ? [
  el('circle', { cx: c[0], cy: c[1], r: 50, fill: css('--metal'), 'fill-opacity': .62, stroke: css('--p'), 'stroke-width': 2 }),
  el('circle', { cx: c[0], cy: c[1], r: 38, fill: 'none', stroke: css('--line'), opacity: .8 }),
  el('circle', { cx: c[0], cy: c[1], r: 11, fill: css('--joint'), stroke: css('--p'), 'stroke-width': 2 }),
] : []);

/**
 * Eklem topu — iki katı parçanın uç uca eklendiği yerdeki kamayı doldurur.
 *
 * Yarıçaplar siluetin o uçtaki yarı genişliğine göre seçili (diz 13 ↔ uyluk
 * ucu 12 / baldır başı 15, dirsek 10 ↔ üst kol ucu 9 / ön kol başı 10):
 * büyüğü silueti dışarı taşırıp yumru yapıyor, küçüğü kamayı kapatmıyor.
 */
const mkBall = () => (c, r) => ({ c, r });

/** Gövde parçası; parça kipi kapalıysa null döner ve çağıran kapsüle düşer. */
const trunkPart = (name, a, b) => {
  const q = useParts && PARTS && PARTS[name];
  return q ? { d: q.d, tf: partTransform(a, b) } : null;
};


/* --- karşılaştırma ekranı ------------------------------------------------ */

/** Karşılaştırma hücresi için figür SVG'si. */
function cmpFigure(e, p, mode) {
  const skin = css('--skin'), skinFar = css('--skinFar'), line = css('--line');
  const edge = css('--edge'), edgeFar = css('--edgeFar');
  const S = skeleton(e, p);
  // `chain`'in metin karşılığı: aynı iki geçiş, aynı gerekçe.
  const chainStr = (ds, fill, ed) => {
    const pass = (a) => ds.filter(Boolean).map((d) => `<path d="${d.d}" transform="${d.tf || ''}" ${a}/>`).join('');
    return pass(`fill="${ed}" stroke="${ed}" stroke-width="${EDGE_W * 2}" stroke-linejoin="round"`) + pass(`fill="${fill}"`);
  };
  const circ = (c, r) => ({ d: `M ${c[0] - r} ${c[1]} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0 Z` });
  const pc = (n, a, b) => (PARTS && PARTS[n] ? { d: PARTS[n].d, tf: partTransform(a, b) } : null);
  const limbOf = (n, a, b, w1, w2, w3, at) =>
    mode === 'capsule'
      ? (() => { const m = lerpP(a, b, at); return [{ d: capsule(a, m, w1, w2) }, { d: capsule(m, b, w2, w3) }]; })()
      : [pc(n, a, b)];
  const dx = S.hand[0] - S.elbow[0], dy = S.hand[1] - S.elbow[1], hl = Math.hypot(dx, dy) || 1;
  let g = '';
  g += chainStr([...limbOf('thigh', S.hipF, S.kneeF, 38, 30, 24, .42), ...limbOf('shin', S.kneeF, S.ankleF, 24, 25, 12, .34), circ(S.kneeF, 12)], skinFar, edgeFar);
  g += chainStr([...limbOf('upper', S.shF, S.elbowF, 23, 21, 16, .5), ...limbOf('fore', S.elbowF, S.handF, 17, 17, 11, .3), circ(S.elbowF, 9)], skinFar, edgeFar);
  g += chainStr([
    ...(mode === 'capsule'
      ? [{ d: capsule(S.pelvis, S.lumbar, 40, 33) }, { d: capsule(S.lumbar, S.thorax, 54, 46) }, { d: capsule(S.thorax, S.neck, 21, 19) }]
      : [pc('lumbar', S.pelvis, S.lumbar), pc('thorax', S.lumbar, S.thorax), pc('neck', S.thorax, S.neck)]),
    circ(S.sh, 16),
  ], skin, edge);
  g += chainStr([
    { d: footPath(S.ankle, footDirOf(e), e.prop !== 'box' && p.ankleLift > 0, facingFlip(e.mode)) },
    ...limbOf('thigh', S.pelvis, S.knee, 42, 33, 26, .42), ...limbOf('shin', S.knee, S.ankle, 26, 28, 13, .34),
    circ(S.knee, 13), circ(S.ankle, 9),
  ], skin, edge);
  g += chainStr([
    ...limbOf('upper', S.sh, S.elbow, 25, 22, 17, .5), ...limbOf('fore', S.elbow, S.hand, 18, 18, 12, .3),
    circ(S.elbow, 10),
    { d: handPath(), tf: partTransform(S.hand, [S.hand[0] + (dx / hl) * 18, S.hand[1] + (dy / hl) * 18]) },
  ], skin, edge);
  // Dambıl da çiziliyor: karşılaştırma ekranı çizim seçeneklerini yan yana
  // koyuyor ve ağırlığı olmayan bir figür ana sahnedekiyle aynı şey değil.
  if (e.load === 'dumbbell') {
    [[S.handF, S.elbowF, skinFar], [S.hand, S.elbow, css('--metal')]].forEach(([c, from, fill]) => {
      const deg = (Math.atan2(c[1] - from[1], c[0] - from[0]) * 180) / Math.PI + 90;
      g += `<g transform="rotate(${deg} ${c[0]} ${c[1]})">`
        + `<rect x="${c[0] - 17}" y="${c[1] - 4}" width="34" height="8" rx="4" fill="${fill}" stroke="${line}"/>`
        + `<rect x="${c[0] - 25}" y="${c[1] - 13}" width="13" height="26" rx="4" fill="${fill}" stroke="${css('--p')}"/>`
        + `<rect x="${c[0] + 12}" y="${c[1] - 13}" width="13" height="26" rx="4" fill="${fill}" stroke="${css('--p')}"/></g>`;
    });
  }
  g += mode === 'capsule'
    ? `<circle cx="${S.head[0]}" cy="${S.head[1] - 3}" r="24" fill="${skin}" stroke="${edge}" stroke-width="${EDGE_W}"/>`
    : `<g transform="translate(${S.head[0]} ${S.head[1]}) rotate(${p.neckA}) scale(${facingFlip(e.mode)} 1)">`
      + `<path d="${headProfile()}" fill="${edge}" stroke="${edge}" stroke-width="${EDGE_W * 2}" stroke-linejoin="round"/>`
      + `<path d="${headProfile()}" fill="${skin}"/></g>`;
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
  const edge = css('--edge'), edgeFar = css('--edgeFar');
  const ball = mkBall();
  const limb = mkLimb();
  const push = (arr) => arr.forEach((n) => svg.appendChild(n));
  const near = (specs) => push(chain(specs, skin, edge));
  const far = (specs) => push(chain(specs, skinFar, edgeFar));
  push([el('line', { x1: S.pelvis[0] - 200, y1: GROUND, x2: S.pelvis[0] + 260, y2: GROUND, stroke: css('--floor'), 'stroke-width': 2 })]);
  // Uzuv adları GEÇİLİYOR: `mkLimb` parça siluetini ancak adı görünce
  // çiziyor, ad verilmeyince kapsüle düşüyor. Önizleme bu yüzden uygulamanın
  // çizmediği bir figürü gösteriyordu — oysa işi tam olarak uygulamayı
  // göstermek.
  if (showFarLeg(e)) {
    // Uzak AYAK da çiziliyor: uygulama çiziyordu, önizleme çizmiyordu — yani
    // önizleme uygulamayı değil eksik bir figürü gösteriyordu.
    far([{ d: footPath(S.ankleF, footDirFarOf(e, p), e.prop !== 'box' && p.ankleLift > 0, facingFlip(e.mode)) },
         ...limb(S.hipF, S.kneeF, 38, 30, 24, .42, true, 'thigh'),
         ...limb(S.kneeF, S.ankleF, 24, 25, 12, .34, true, 'shin'), ball(S.kneeF, 12)]);
  }
  if (!e.hideFarArm) {
    far([...limb(S.shF, S.elbowF, 23, 21, 16, .5, true, 'upper'),
         ...limb(S.elbowF, S.handF, 17, 17, 11, .3, true, 'fore'), ball(S.elbowF, 9),
         handAt(S.handF, S.elbowF)]);
    // Uzak ağırlık uzak kolun ardında, gövdeden ÖNCE: ikisi de figürün
    // arkasında. Uygulamadaki sıranın aynısı.
    if (e.load === 'dumbbell') push(dumbbellAt(S.handF, S.elbowF, true));
  }
  // Sahne eşyası UZAK UZUVLARDAN SONRA, gövdeden ÖNCE: uzak taraf figürün
  // arkasında, eşya onunla izleyici arasında. Konumlar 0. karenin
  // iskeletinden okunuyor, yoksa bar figürle birlikte kayardı.
  drawProps(e, skeleton(e, poseAt(e, 0).p), S, push);
  const trunk = [trunkPart('lumbar', S.pelvis, S.lumbar), trunkPart('thorax', S.lumbar, S.thorax), trunkPart('neck', S.thorax, S.neck)].filter(Boolean);
  near(trunk.length === 3
    ? [{ d: pelvisMass(S.pelvis, S.lumbar) }, ...trunk, ball(S.sh, 16)]
    : [{ d: capsule(S.pelvis, S.lumbar, 40, 33) }, { d: capsule(S.lumbar, S.thorax, 54, 46) },
       { d: capsule(S.thorax, S.neck, 21, 19) }, ball(S.sh, 17)]);
  near([
    { d: footPath(S.ankle, footDirOf(e), e.prop !== 'box' && p.ankleLift > 0, facingFlip(e.mode)) },
    ...limb(S.pelvis, S.knee, 42, 33, 26, .42, false, 'thigh'),
    ...limb(S.knee, S.ankle, 26, 28, 13, .34, false, 'shin'),
    ball(S.knee, 13), ball(S.ankle, 9),
  ]);
  push(headNodes(e, S, p, skin, edge));
  // YAKIN KOL KAFADAN SONRA. Yan görünümde yakın kol izleyiciyle kafa
  // arasında duruyor, yani kafayı ÖRTMELİ. Önce çizildiğinde tersi oluyordu:
  // kol kafanın önünden geçen altı harekette (hip_thrust, glute_bridge,
  // bird_dog, dead_bug, hanging_knee_raise, pull_up) kafa kolun üstüne
  // biniyor ve kol arkadan geçiyormuş gibi görünüyordu.
  near([
    ...limb(S.sh, S.elbow, 25, 22, 17, .5, false, 'upper'),
    ...limb(S.elbow, S.hand, 18, 18, 12, .3, false, 'fore'),
    ball(S.elbow, 10),
    handAt(S.hand, S.elbow),
  ]);
  if (e.load === 'dumbbell') push(dumbbellAt(S.hand, S.elbow, false));

  // Elde tutulan halter kafadan SONRA ve ana sahnenin diskiyle aynı.
  // Burada bir zamanlar perspektif halter vardı — çubuk derinliğe uzanıyor,
  // uçlardaki tabaklar elips. Terk edilen 3/4 yönünün son kalıntısıydı ve
  // uygulama onu hiç çizmiyordu, yani önizleme yalan söylüyordu.
  // Sırt ve kalça halteri de dahil: önizleme back squat'ta HİÇ tabak
  // çizmiyordu, uygulama çiziyordu.
  if (e.bar) push(plateAt(S.bar));
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
  // Figürün hattı `--edge`; `--line` SAHNE eşyasının (sehpa, basamak, kablo,
  // makine) ince hattı olarak kalıyor. Aynı vurguyu alsalardı mobilya figürle
  // yarışırdı.
  const edge = css('--edge'), edgeFar = css('--edgeFar');
  const line = css('--line'), metal = css('--metal'), floor = css('--floor'), surf2 = css('--surf2'), accent = css('--p');
  const push = (arr) => arr.forEach((n) => svg.appendChild(n));
  const ball = mkBall();
  const limb = mkLimb();
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
    const nearF = (specs) => push(chain(specs, skin, edge));
    [F.L, F.R].forEach((s) => {
      nearF([
        { d: `M ${s.ankle[0] - 15} ${GROUND - 13} h 30 v 13 h -30 Z` },
        ...limb(s.hip, s.knee, 40, 32, 27, .42), ...limb(s.knee, s.ankle, 27, 29, 15, .34),
        ball(s.knee, 13), ball(s.ankle, 9),
      ]);
      nearF([
        ...limb(s.sh, s.elbow, 24, 21, 17, .5), ...limb(s.elbow, s.hand, 18, 18, 12, .3),
        ball(s.elbow, 10), ball(s.hand, 10),
      ]);
      if (e.load === 'dumbbell') push(dumbbellAt(s.hand, s.elbow, false));
    });
    // Gövde kalçadan omuza TEK parça: omuz kuşağı silueti içinde, o yüzden
    // omuz silkerken omuz gövdeden kopamıyor. Leğen, gövde, boyun ve iki
    // omuz kapağı tek zincir — ayrı konturlanınca ekleri dikiş bırakıyordu.
    nearF([
      { d: ellipsePath([cx, F.pelvis[1] + 8], 38, 25) },
      { d: frontTorsoPath(F) },
      { d: capsule(F.thorax, F.neck, 27, 24) },
      ball(F.L.sh, 16), ball(F.R.sh, 16),
    ]);
    // Kafa ve çene TEK zincir; çene uygulamada vardı, önizlemede yoktu.
    nearF([
      { d: ellipsePath([F.head[0], F.head[1] - 3], 23, 27) },
      { d: `M ${F.head[0] - 17} ${F.head[1] + 6} L ${F.head[0] + 17} ${F.head[1] + 6} L ${F.head[0] + 10} ${F.head[1] + 25} L ${F.head[0] - 10} ${F.head[1] + 25} Z` },
    ]);
    if (e.bar === 'hands') push(bar());
    return drawHandles(svg, e, S, view, p);
  }

  const pin = e.prop !== 'box' && p.ankleLift > 0;
  const near = (specs) => push(chain(specs, skin, edge));
  const far = (specs) => push(chain(specs, skinFar, edgeFar));
  // Gizlemek yalnızca çizimi etkiler; iskelet ve kadraj aynı kalır.
  if (showFarLeg(e)) {
    far([
      { d: footPath(S.ankleF, footDirFarOf(e, p), pin, facingFlip(e.mode)) },
      ...limb(S.hipF, S.kneeF, 38, 30, 24, .42, true, 'thigh'),
      ...limb(S.kneeF, S.ankleF, 24, 25, 12, .34, true, 'shin'),
      ball(S.kneeF, 12),
    ]);
  }
  if (!e.hideFarArm) {
    // Uzak el ve onun taşıdığı ağırlık GÖVDEDEN ÖNCE: ikisi de figürün
    // arkasında kalıyor. Önceden ikisi de en sona, gövdenin üstüne
    // çiziliyordu; uzak dambıl gövdenin önünde belirdiği için yakın el iki
    // ağırlık tutuyormuş gibi görünüyordu.
    far([
      ...limb(S.shF, S.elbowF, 23, 21, 16, .5, true, 'upper'),
      ...limb(S.elbowF, S.handF, 17, 17, 11, .3, true, 'fore'),
      ball(S.elbowF, 9), ball(S.handF, 9),
      useParts ? handAt(S.handF, S.elbowF) : null,
    ]);
    if (e.load === 'dumbbell') push(dumbbellAt(S.handF, S.elbowF, true));
  }
  // Sahne eşyası UZAK UZUVLARDAN SONRA: uzak taraf figürün arkasında, eşya da
  // onunla izleyici arasında duruyor. Basamağa çıkmada arka bacak kutunun
  // ARKASINDA kalmalı, Bulgar squat'ta arka ayak sehpanın arkasında. Eskiden
  // eşya en önce çiziliyordu ve uzak bacak onun üstüne biniyordu.
  drawProps(e, S0, S, push);

  const pelvisMid = add(S.pelvis, D(p.torso), 12), thoraxMid = lerpP(S.lumbar, S.thorax, .55);
  // Gövde tek zincir: bel, göğüs, boyun ve omuz kapağı. Ayrı ayrı
  // konturlanınca aralarındaki ekler gövdeyi enine kesen çizgiler bırakıyor.
  //
  // Kapsül kipinin kalça ve göğüs elipsleri parça kipinde ÇİZİLMİYOR: iki
  // ayrı şeklin kenarları birbirini kesiyor ve belde dikiş, göğüste çift
  // kontur bırakıyordu. Parça kipinde hacmi parçaların kendisi taşıyor.
  //
  // Omuz gövdeden yan görünümde HEP 14px uzakta (ölçüldü, 30 arketip × 21
  // kare). Bu mesafede yarıçapı 20 olan yuvarlak bir deltoid kapağı gövdeyi
  // zaten örtüyor; kama gereksiz ve düz kenarları gövdenin üstünde görünür
  // bir çentik bırakıyordu. Kapsül kipinde kama duruyor, orada uzuvlar zaten
  // ayrı ayrı okunuyor.
  near([
    // Leğen kütlesi: Bridgman'ın üç değişmez gövde kütlesinden biri. Kalça
    // ekleminin ALTINA taşıyor ki uyluk onun üstüne binsin — kütleler uç uca
    // gelmez, geçer. Blok yokken bel ve uyluk parçaları tek noktada değiyor,
    // kalça gövdeden kopuk görünüyordu.
    { d: pelvisMass(S.pelvis, S.lumbar) },
    trunkPart('lumbar', S.pelvis, S.lumbar), trunkPart('thorax', S.lumbar, S.thorax),
    ...(useParts && PARTS ? [] : [{ d: capsule(S.pelvis, S.lumbar, 40, 33) }]),
    ...(useParts ? [] : [{ d: ellipsePath(thoraxMid, 27, 47), tf: `rotate(${p.thoraxA} ${thoraxMid[0]} ${thoraxMid[1]})` }]),
    ...(useParts ? [trunkPart('neck', S.thorax, S.neck)] : [{ d: capsule(S.thorax, S.neck, 21, 19) }]),
    ...(useParts ? [ball(S.sh, 16)] : [{ d: shoulderWedge(S.thorax, S.sh, 20) }, ball(S.sh, 17)]),
  ]);
  // Bacak ve kol AYRI zincirler: ikisinin de gövdenin önünden geçtiği yerde
  // hat isteniyor, yoksa uzuv gövdeye yapışık okunuyor.
  near([
    { d: footPath(S.ankle, footDirOf(e), pin, facingFlip(e.mode)) },
    ...limb(S.pelvis, S.knee, 42, 33, 26, .42, false, 'thigh'),
    ...limb(S.knee, S.ankle, 26, 28, 13, .34, false, 'shin'),
    ball(S.knee, 13), ball(S.ankle, 9),
  ]);
  // Sırt üstü kiplerde profil aynalanıyor: kemik açısı başı doğru yere
  // koyuyor ama yüzün hangi yöne baktığını söyleyemiyor (bkz. facingFlip).
  const headT = `translate(${S.head[0]} ${S.head[1]}) rotate(${p.neckA}) scale(${facingFlip(e.mode)} 1)`;
  svg.appendChild(
    useParts
      ? headNodes(e, S, p, skin, edge)[0]
        // Kapsül kipinin çene kaması da YEREL koordinatta: eskiden mutlak
        // noktalarla çizilip `rotate(a cx cy)` ile döndürülüyordu, o hâlde
        // aynalanamıyordu. Sayılar birebir aynı, yalnızca kafa merkezine göre.
      : el('g', { transform: headT }, [
          el('ellipse', { cx: 0, cy: -3, rx: 23, ry: 26, fill: skin, stroke: line }),
          el('path', { d: 'M -4 4 L 21 6 L 14 23 L -8 22 Z', fill: skin, stroke: line }),
        ]),
  );

  // YAKIN KOL KAFADAN SONRA. Yan görünümde yakın kol izleyiciyle kafa
  // arasında duruyor, yani kafayı ÖRTMELİ. Önce çizildiğinde tersi oluyordu:
  // kol kafanın önünden geçen altı harekette (hip_thrust, glute_bridge,
  // bird_dog, dead_bug, hanging_knee_raise, pull_up) kafa kolun üstüne
  // biniyor ve kol arkadan geçiyormuş gibi görünüyordu.
  near([
    ...limb(S.sh, S.elbow, 25, 22, 17, .5, false, 'upper'),
    ...limb(S.elbow, S.hand, 18, 18, 12, .3, false, 'fore'),
    ball(S.elbow, 10),
    useParts ? handAt(S.hand, S.elbow) : ball(S.hand, 10),
  ]);
  if (e.load === 'dumbbell') push(dumbbellAt(S.hand, S.elbow, false));

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
  //
  // Sırt ve kalça halteri de aynı sıraya girdi. Onlar gövdenin ARKASINA
  // çiziliyordu, oysa yakın taraftaki tabak izleyiciye en yakın şeydir:
  // back squat'ta figürün önünde durur. Kural tek: halter nerede tutulursa
  // tutulsun, YAKIN TABAK en üstte ve saydam.
  if (e.bar) push(plate(S.bar));

  drawHandles(svg, e, S, view, p);
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
/**
 * Sahne eşyası. Hepsi TEK bir gruba çiziliyor ki `propShift` bir kere
 * uygulansın: eşya konumları iskeletten türetildiği için figür kayınca eşya da
 * kayıyor, `propDx/propDy` aradaki bağı gevşetiyor.
 */
function drawProps(e, S0, S, pushOut) {
  const holder = el('g', { transform: propShift(e) });
  const push = (arr) => arr.forEach((n) => holder.appendChild(n));
  pushOut([holder]);
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
      // Kablo küreğinde SANDALYE yok: alçak bir sehpaya oturulur, bacaklar öne
      // uzanır ve ayaklar plakaya basar. Sırt dayamalı koltuk çizmek hareketi
      // göğüs destekli kürek gibi gösteriyordu.
      if (e.mode === 'seat' && e.cableFrom === 'low') {
        push([
          el('rect', { x: S0.pelvis[0] - 54, y: S0.pelvis[1] + 22, width: 128, height: 16, rx: 7, fill: surf2, stroke: line }),
          el('rect', { x: S0.pelvis[0] - 24, y: S0.pelvis[1] + 38, width: 16, height: Math.max(0, GROUND - S0.pelvis[1] - 38), fill: surf2, stroke: line }),
        ]);
        // Ayak plakası ayağın TABAN DÜZLEMİNE oturuyor — bacak presi
        // levhasıyla aynı kural. Dik bir levha çizmek ayağı plakanın içinden
        // geçiriyordu; basılan yüzeyin açısı ayağın açısıdır.
        const [heelP, toeP] = solePoints(S0.ankle, footDirOf(e), false, facingFlip(e.mode));
        const ux = toeP[0] - heelP[0], uy = toeP[1] - heelP[1];
        const uL = Math.hypot(ux, uy) || 1;
        // Levha tabandan iki yana taşıyor: ayak ondan KISA, yüzey ondan uzun.
        const a = [heelP[0] - (ux / uL) * 26, heelP[1] - (uy / uL) * 26];
        const b = [toeP[0] + (ux / uL) * 26, toeP[1] + (uy / uL) * 26];
        push([
          el('path', { d: capsule(a, b, 8, 8), fill: surf2, stroke: line }),
          // Levhayı zemine bağlayan ayak: yüzey havada durmuyor.
          el('path', { d: capsule([a[0], a[1]], [a[0], GROUND], 7, 7), fill: surf2, stroke: line }),
        ]);
      } else if (e.mode === 'seat') push(seat());
      const from = e.cableFrom || 'front';
      const ahead = Math.max(S.hand[0], S0.hand[0]);
      // Makaranın YERİ direncin yönü demek. Yanlış yer hareketi başka bir
      // hareket gibi gösteriyor: göğüs presine ÖNDEN kablo koymak onu kürek
      // yapıyordu, çünkü kablo eli öne çekiyordu.
      const anchor = {
        // Pulldown'da makaranın ALTINA oturulur, pushdown'da kolonun ÖNÜNDE
        // durulur: ayakta makarayı tepeye koymak direği figürün içinden
        // geçiriyordu.
        high:  [e.mode === 'stand' ? ahead + 90 : S0.hand[0], BAR_Y + 24],
        front: [ahead + 100, S0.hand[1]],                   // önde, el hizası
        low:   [ahead + 110, GROUND - 34],                  // önde, zemine yakın
        back:  [S0.pelvis[0] - 132, S0.sh[1]],              // arkada, omuz hizası
      }[from];
      const px = anchor[0], py = anchor[1];
      const postTop = from === 'high' ? BAR_Y : py;
      push([
        el('rect', { x: px - 9, y: postTop, width: 18, height: Math.max(0, GROUND - postTop), rx: 4, fill: surf2, stroke: line }),
        ...(from === 'high' ? [el('rect', { x: Math.min(px, S0.pelvis[0]) - 30, y: BAR_Y, width: Math.abs(px - S0.pelvis[0]) + 60, height: 16, rx: 6, fill: surf2, stroke: line })] : []),
        el('circle', { cx: px, cy: py, r: 13, fill: metal, stroke: line }),
        // `back` bir KOL, kablo değil: makine göğüs presinde direnci taşıyan
        // şey kaldıraç kolu. Kalın çiziliyor ve gövdenin arkasında kalıyor.
        from === 'back'
          ? el('path', { d: capsule([px, py], [S.hand[0], S.hand[1]], 11, 9), fill: surf2, stroke: line })
          // Kablo makaradan ELE: figür oynarken uzayıp kısalıyor, çeken şey o.
          : el('line', { x1: px, y1: py, x2: S.hand[0], y2: S.hand[1], stroke: metal, 'stroke-width': 4, 'stroke-linecap': 'round' }),
        // Tutamak UÇTAN görünüyor, yandan değil.
        //
        // Önce kabloya dik uzun bir kapsül çiziliyordu; çubuk sagittal düzlemde
        // YATIYOR gibi oluyordu ve elde eğik bir sopa — küreğinde direksiyon —
        // tutuluyormuş gibi okunuyordu. Oysa çeken şey gövdeye DİK duran bir
        // çubuk: yandan bakınca kesiti görünür. Halter tabağı zaten aynı
        // sözleşmeyi kullanıyor, tutamak da ona uyuyor; yalnızca daha küçük.
        el('circle', { cx: S.hand[0], cy: S.hand[1], r: 14, fill: metal, 'fill-opacity': .62, stroke: line, 'stroke-width': 2 }),
        el('circle', { cx: S.hand[0], cy: S.hand[1], r: 6, fill: surf2, stroke: line }),
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
function drawHandles(svg, e, S, view, p) {
  if (!editable() || view === 'front') return;
  const accent = css('--p');
  const hiddenJoints = new Set([
    ...(showFarLeg(e) ? [] : ['kneeF', 'ankleF', 'toeF']),
    ...(e.hideFarArm ? ['elbowF', 'handF'] : []),
  ]);
  dragHandles(e, S, p).filter((h) => !hiddenJoints.has(h.joint)).forEach((h) => {
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
  // Ayak ucu POZU değil hareketi değiştiriyor: `footDir` tek bir sayı ve
  // bütün karelerde geçerli. Modelde ayak bileği açısı yok (TODOS.md).
  if (dragging === 'toeF') {
    // Uzak ayak: mutlak yön değil, türetmenin üstündeki PAY yazılıyor.
    e.footDirFarAdj = dragFootDirFar(e, S, fillPose(frame().p), toWorld(evt));
    markDirty();
    renderAll();
    return;
  }
  if (dragging === 'toe') {
    e.footDir = dragFootDir(e, S, toWorld(evt));
  } else {
    const patch = dragJoint(e, S, dragging, toWorld(evt));
    if (Object.keys(patch).length === 0) return;
    frame().p = applyPatch(frame().p, patch);
  }
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

function markTextsDirty() {
  textsDirty = true;
  $('savedMsg').textContent = 'kaydedilmedi';
  $('savedMsg').style.color = css('--warn');
  syncHistoryButtons();
}

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

/**
 * Kaydırma kontrolü — gövde ya da sahne eşyası.
 *
 * POZUN değil HAREKETİN ayarı: tek kareyi değil hepsini birden kaydırıyor,
 * ayak ucu tutamakları gibi. O yüzden zaman çubuğundan bağımsız.
 */
function renderNudge(host, e, xKey, yKey, aktif, dikeyKapali) {
  host.innerHTML = '';
  const adim = 4;
  const oku = (k) => e[k] ?? 0;
  const yaz = (k, v) => {
    snapshot();
    // 0 yazmak alanı SİLİYOR: varsayılanı taşıyan bir arketip veride sıfır
    // biriktirmesin, diff de sessiz kalsın.
    if (v === 0) delete e[k]; else e[k] = Math.round(v * 10) / 10;
    markDirty();
    renderAll();
  };
  const dugme = (label, title, fn, dikey) => {
    const b = el2('button', label);
    b.title = dikey && dikeyKapali ? dikeyKapali : title;
    b.disabled = !aktif || (dikey && !!dikeyKapali);
    b.onclick = fn;
    host.appendChild(b);
    return b;
  };
  dugme('↖', '', () => {}).style.visibility = 'hidden';
  dugme('↑', 'Yukarı', () => yaz(yKey, oku(yKey) - adim), true);
  dugme('↻', 'Sıfırla', () => { snapshot(); delete e[xKey]; delete e[yKey]; markDirty(); renderAll(); });
  dugme('←', 'Sola', () => yaz(xKey, oku(xKey) - adim));
  dugme('↓', 'Aşağı', () => yaz(yKey, oku(yKey) + adim), true);
  dugme('→', 'Sağa', () => yaz(xKey, oku(xKey) + adim));
  const val = el2('div', '');
  val.className = 'val';
  const mk = (k, etiket, dikey) => {
    const lab = el2('span', etiket);
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.step = '1';
    inp.value = String(oku(k));
    inp.disabled = !aktif || (dikey && !!dikeyKapali);
    if (dikey && dikeyKapali) inp.title = dikeyKapali;
    inp.onchange = () => yaz(k, Number(inp.value) || 0);
    val.appendChild(lab);
    val.appendChild(inp);
  };
  mk(xKey, 'x');
  mk(yKey, 'y', true);
  host.appendChild(val);
  if (dikeyKapali) {
    const not = el2('p', dikeyKapali);
    not.className = 'hint';
    not.style.gridColumn = '1 / -1';
    host.appendChild(not);
  }
}

/** Küçük yardımcı: metinli eleman. */
const el2 = (tag, text) => {
  const n = document.createElement(tag);
  n.textContent = text;
  return n;
};

function renderEquipment() {
  const e = ex();
  // Dikey kaydırma yalnızca dikey dayanağı ZEMİN OLMAYAN kiplerde: ayakta,
  // dört ayak ve sırtüstü figür yere oturuyor, orada yukarı çekmek figürü
  // havada bırakmaktan başka bir şey yapmıyor. Şema da aynı kuralı koyuyor;
  // buton en baştan kapalı olsun ki kullanıcı düzeltemediği bir hata üretmesin.
  const zemine = ['stand', 'quad', 'supine'].includes(e.mode);
  renderNudge($('nudgeBody'), e, 'bodyDx', 'bodyDy', true,
    zemine ? 'Bu harekette figür yere basıyor: dikey kaydırma yok. Sahne eşyasını kaydır.' : '');
  // Eşya kaydırması yalnızca eşya varken anlamlı; şema da bunu zorluyor.
  renderNudge($('nudgeProp'), e, 'propDx', 'propDy', !!e.prop, '');
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

// --- metin paneli --------------------------------------------------------
//
// Kullanıcının okuduğu her metin — iki ad, İngilizce ad, ekipman, zorluk,
// set/dinlenme ipucu ve nasıl yapılır adımları — 11 Eylül 2026'ya kadar
// `backend/scripts/build_exercise_library.py` içinde SABİTTİ: antrenörden
// gelen bir düzeltme ancak Python düzenlenerek girilebiliyordu. Artık
// `data/exercises.json`'da ve burada düzenleniyor.
//
// Çizim notu (`note`) bilerek YOK: o iç not, uygulamaya gitmiyor.

const ZORLUKLAR = ['BAŞLANGIÇ', 'ORTA', 'ORTA-İLERİ', 'İLERİ'];

/** Panelde düzenlenen alanlar; sıra ekranda göründüğü sıra. */
const TXT_FIELDS = [
  { k: 'name', label: 'Türkçe ad', not: 'Listede ve başlıkta görünen ad.' },
  { k: 'alt', label: 'Alt ad', ops: true,
    not: 'Salonda söylenen ÖTEKİ ad. Karşılığı yoksa boş bırak — kimsenin söylemediği bir ad yoktan kötüdür.' },
  { k: 'en', label: 'İngilizce ad', not: 'Alt ad boşsa uygulamada onun yerine bu görünüyor.' },
  { k: 'difficulty', label: 'Zorluk', secim: ZORLUKLAR },
  { k: 'equipTr', label: 'Ekipman (TR)' },
  { k: 'equipEn', label: 'Ekipman (EN)' },
  { k: 'setsHint', label: 'Set ipucu', ops: true, not: 'Boş bırakılırsa uygulama "Antrenörün belirler" yazıyor.' },
  { k: 'restHint', label: 'Dinlenme ipucu', ops: true },
];

const entry = () => CATALOG[txtId];

/** Kayıtta sunucunun reddedeceği şeyi kullanıcı ÖNCE burada görsün. */
function txtProblem(e) {
  if (!e) return null;
  for (const f of TXT_FIELDS) {
    const v = e[f.k];
    if (f.ops) continue;
    if (typeof v !== 'string' || v.trim() === '') return `${f.label} boş`;
  }
  if (typeof e.alt === 'string' && e.alt.trim() === String(e.name).trim()) return 'Alt ad ile Türkçe ad aynı';
  if (!ZORLUKLAR.includes(e.difficulty)) return `Zorluk "${e.difficulty}" tanınmıyor`;
  if (!Array.isArray(e.steps) || e.steps.length === 0) return 'Adım yok';
  const bos = e.steps.findIndex((a) => !a[0] || !a[0].trim() || !a[1] || !a[1].trim());
  if (bos >= 0) return `${bos + 1}. adımın bir dili boş`;
  return null;
}

function renderTxtList() {
  const host = $('txtList');
  host.innerHTML = '';
  Object.keys(CATALOG).forEach((id) => {
    const e = CATALOG[id];
    const hay = `${e.name} ${e.alt || ''} ${e.en || ''} ${id}`.toLowerCase();
    if (txtFilter && !hay.includes(txtFilter)) return;
    const b = document.createElement('button');
    b.setAttribute('aria-pressed', String(id === txtId));
    const sorun = txtProblem(e);
    b.innerHTML =
      (sorun ? '<span class="edited">!</span>' : '') +
      `<b>${esc(e.name)}</b><small>${esc(id)}</small>`;
    if (sorun) b.title = sorun;
    b.onclick = () => { txtId = id; renderTexts(); };
    host.appendChild(b);
  });
  if (!host.children.length) host.innerHTML = '<p class="hint">Eşleşen hareket yok.</p>';
}

const esc = (v) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function renderTxtForm() {
  const host = $('txtForm');
  const e = entry();
  if (!e) {
    host.innerHTML = '<p class="empty">Soldan bir hareket seç.</p>';
    return;
  }
  host.innerHTML = '';

  const grp = (baslik, ic) => {
    const d = document.createElement('div');
    d.className = 'grp';
    d.innerHTML = `<h3>${baslik}</h3>${ic}`;
    host.appendChild(d);
    return d;
  };

  // --- adlar ve sınıflama ---
  const fieldHtml = (f) => {
    const v = e[f.k] ?? '';
    const giris = f.secim
      ? `<select data-fld="${f.k}">${f.secim.map((o) => `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`
      : `<input type="text" data-fld="${f.k}" value="${esc(v)}">`;
    return `<div class="fld"><label>${f.label}</label>${giris}${f.not ? `<p class="note">${f.not}</p>` : ''}</div>`;
  };
  grp('Adlar', TXT_FIELDS.slice(0, 3).map(fieldHtml).join(''));
  grp('Sınıflama', TXT_FIELDS.slice(3).map(fieldHtml).join(''));

  // --- adımlar ---
  const steps = Array.isArray(e.steps) ? e.steps : (e.steps = []);
  const adimlar = grp(
    'Nasıl yapılır',
    steps.map((a, i) => `
      <div class="step">
        <span class="no">${i + 1}.</span>
        <div class="pair">
          <textarea rows="2" data-step="${i}" data-lang="0" placeholder="Türkçe">${esc(a[0])}</textarea>
          <textarea rows="2" data-step="${i}" data-lang="1" placeholder="English">${esc(a[1])}</textarea>
        </div>
        <div class="ops">
          <button data-move="${i}" data-dir="-1" title="Yukarı"${i === 0 ? ' disabled' : ''}>↑</button>
          <button data-move="${i}" data-dir="1" title="Aşağı"${i === steps.length - 1 ? ' disabled' : ''}>↓</button>
          <button data-del="${i}" title="Adımı sil">✕</button>
        </div>
      </div>`).join('') +
    // Adımlar TR+EN kalıyor: uygulama her adımın altında İngilizcesini
    // basıyor (`exercise-detail.tsx`), tek dile düşmek ekranda görünür bir
    // kayıp olurdu.
    (steps.length ? '' : '<p class="empty">Adım yok — hareketin nasıl yapıldığı yazılmalı.</p>') +
    '<p class="note" style="grid-column:1">Her adım iki dilli: uygulama Türkçesinin altında İngilizcesini gösteriyor.</p>' +
    '<button id="addStep">+ Adım ekle</button>',
  );

  // --- bağlama ---
  host.querySelectorAll('[data-fld]').forEach((el) => {
    el.oninput = () => {
      beginTextEdit();
      const f = el.dataset.fld;
      const v = el.value;
      // `alt` YAZILDIYSA boş olamaz: boşaltmak "karşılığı yok" demek, o da
      // alanın hiç bulunmaması demek.
      if (f === 'alt' && v.trim() === '') delete e.alt;
      else e[f] = v;
      afterTextEdit(f === 'name');
    };
  });
  host.querySelectorAll('[data-step]').forEach((el) => {
    el.oninput = () => {
      beginTextEdit();
      steps[Number(el.dataset.step)][Number(el.dataset.lang)] = el.value;
      afterTextEdit(false);
    };
  });
  host.querySelectorAll('[data-move]').forEach((el) => {
    el.onclick = () => {
      commitTextEdit();
      snapshot();
      const i = Number(el.dataset.move);
      const j = i + Number(el.dataset.dir);
      [steps[i], steps[j]] = [steps[j], steps[i]];
      markTextsDirty();
      renderTexts();
    };
  });
  host.querySelectorAll('[data-del]').forEach((el) => {
    el.onclick = () => {
      commitTextEdit();
      snapshot();
      steps.splice(Number(el.dataset.del), 1);
      markTextsDirty();
      renderTexts();
    };
  });
  adimlar.querySelector('#addStep').onclick = () => {
    commitTextEdit();
    snapshot();
    steps.push(['', '']);
    markTextsDirty();
    renderTexts();
    const son = host.querySelector(`[data-step="${steps.length - 1}"]`);
    if (son) son.focus();
  };
}

/**
 * Tuş başına geri alma kaydı almıyoruz: her harf bir yığın girdisi olurdu ve
 * ⌘Z bir kelimeyi geri almak için otuz kez basılırdı. Kayıt alana GİRİLDİĞİNDE
 * alınıp, değer gerçekten değiştiyse yığına düşüyor — kaydı `change` anında
 * almak yazılmış hâli saklardı ve ⌘Z hiçbir şeyi geri almazdı.
 */
/** Alana ilk dokunuşta, veriyi DEĞİŞTİRMEDEN önce alınan kayıt. */
let txtBefore = null;
const beginTextEdit = () => { if (txtBefore === null) txtBefore = takeSnapshot(); };
/** Bekleyen kaydı yığına indirir; bekleyen yoksa hiçbir şey yapmaz. */
const commitTextEdit = () => {
  if (txtBefore === null) return;
  snapshot(txtBefore);
  txtBefore = null;
  syncHistoryButtons();
};

function afterTextEdit(adDegisti) {
  markTextsDirty();
  renderTxtList();
  if (adDegisti) {
    rebuildNames();
    renderExList();
    renderPhone();
  }
}

function renderTexts() {
  renderTxtList();
  renderTxtForm();
}

$('texts').onclick = () => {
  // Panel açılırken sahnedeki arketibi kullanan ilk harekete düşüyor: iki
  // seçim birbirinden kopuk kalırsa kullanıcı aradığı hareketi elle bulur.
  if (!txtId || CATALOG[txtId].archetype !== key) {
    txtId = Object.keys(CATALOG).find((id) => CATALOG[id].archetype === key) || Object.keys(CATALOG)[0] || null;
  }
  txtOn = true;
  $('txt').classList.add('on');
  renderTexts();
};

const closeTxt = () => {
  // Alandan çıkılmadan kapatılırsa `change` düşmüyor; bekleyen kaydı burada
  // indiriyoruz ki yazılan metin geri alınabilir kalsın.
  commitTextEdit();
  txtOn = false;
  $('txt').classList.remove('on');
};
$('txtClose').onclick = closeTxt;
$('txtSearch').oninput = () => { txtFilter = $('txtSearch').value.trim().toLowerCase(); renderTxtList(); };
// Metin alanında Esc yazmayı kesmesin diye panel kapanışı #cmp ile aynı
// kuralda: yalnızca panel açıkken ve odak bir girdide değilken.
window.addEventListener('keydown', (evt) => {
  if (evt.key === 'Escape' && txtOn && !/^(INPUT|TEXTAREA|SELECT)$/.test(evt.target.tagName)) closeTxt();
});
const isField = (el) => /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
// Kayıt ODAKA değil, İLK DEĞİŞİKLİĞE bağlı. Odak olaylarına bağlamak
// kırılgandı: odak `focusin` doğurmadan da alana düşebiliyor (pencere arkada
// olduğunda `el.focus()` böyle davranıyor), o zaman kayıt hiç alınmıyor ve
// kullanıcı metin düzeltmesini geri alamıyordu — sessizce.
$('txt').addEventListener('change', (evt) => {
  if (isField(evt.target)) commitTextEdit();
}, true);

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

// Karşı yığına giden kayıt da POZ + METİN: yalnızca pozu saklamak, ileri
// alındığında kataloğu tanımsız bırakırdı.
//
// Geri alınan hamlenin hangi dosyaya ait olduğunu bilmiyoruz, o yüzden ikisi de
// kirli işaretleniyor. Değişmemiş dosya kaydedildiğinde birebir aynı baytlarla
// yazılıyor — git'te görünmüyor, yani fazladan kayıt zararsız.
$('undo').onclick = () => {
  if (!undoStack.length) return;
  redoStack.push(takeSnapshot());
  restore(undoStack.pop());
  markDirty();
  markTextsDirty();
};

$('redo').onclick = () => {
  if (!redoStack.length) return;
  undoStack.push(takeSnapshot());
  restore(redoStack.pop());
  markDirty();
  markTextsDirty();
};

$('revert').onclick = async () => {
  if ((dirty || textsDirty) && !confirm('Kaydedilmemiş değişiklikler atılacak. Diskteki hâline dönülsün mü?')) return;
  snapshot();
  // Metinler de diskten geri geliyor: yalnızca pozları tazelemek, panelde
  // yazılmış ama atılmış bir metni ekranda bırakırdı.
  [DATA, CATALOG] = await Promise.all([
    fetch('/data').then((r) => r.json()),
    fetch('/exercises').then((r) => r.json()),
  ]);
  rebuildNames();
  if (!DATA[key]) key = Object.keys(DATA)[0];
  if (!CATALOG[txtId]) txtId = null;
  kfIndex = 0;
  dirty = false;
  textsDirty = false;
  $('savedMsg').textContent = 'diskten yüklendi';
  $('savedMsg').style.color = css('--sub');
  renderAll();
  if (txtOn) renderTexts();
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

const put = async (path, payload) => {
  const res = await fetch(path, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload, null, 2),
  });
  const out = await res.json();
  if (!out.ok) throw new Error(out.error);
  return out;
};

/**
 * İki dosya, iki kayıt: pozlar `rigArchetypes.json`'a, metinler
 * `exercises.json`'a. Biri kuralı geçmezse ÖTEKİ yazılıyor ve kirli bayrağı
 * yalnızca tutan tarafta siliniyor — ikisini birden geri çevirmek, kabul
 * edilebilir yarıyı da kullanıcının elinden alırdı.
 */
$('save').onclick = async () => {
  // Alandan çıkmadan ⌘S'e basılabiliyor: bekleyen metin kaydı önce yığına.
  commitTextEdit();
  $('save').disabled = true;
  const yazildi = [];
  const hata = [];
  if (dirty) {
    try {
      const out = await put('/data', DATA);
      dirty = false;
      yazildi.push(`${out.count} arketip`);
    } catch (e) {
      hata.push('pozlar: ' + e.message);
    }
  }
  if (textsDirty) {
    try {
      const out = await put('/exercises', CATALOG);
      textsDirty = false;
      yazildi.push(`${out.count} hareket metni`);
    } catch (e) {
      hata.push('metinler: ' + e.message);
    }
  }
  if (hata.length) {
    $('savedMsg').textContent = 'kaydedilemedi — ' + hata.join(' · ');
    $('savedMsg').style.color = css('--danger');
  } else {
    $('savedMsg').textContent = yazildi.length ? `kaydedildi (${yazildi.join(', ')})` : 'değişiklik yok';
    $('savedMsg').style.color = yazildi.length ? css('--p') : css('--sub');
  }
  $('save').disabled = false;
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
    fetch('/exercises').then((r) => r.json()).catch(() => ({})),
    fetch('/muscles').then((r) => r.json()).catch(() => ({})),
    fetch('/anatomy').then((r) => r.json()).catch(() => null),
    fetch('/parts').then((r) => r.json()).catch(() => null),
  ]);
  MUSCLEDATA = muscles;
  ANATOMY = anatomy && anatomy.front ? anatomy : null;
  PARTS = parts && parts.parts ? parts.parts : null;
  DATA = data;
  CATALOG = names;
  rebuildNames();
  key = Object.keys(DATA)[0];
  renderAll();
  requestAnimationFrame(tick);
};
boot();
