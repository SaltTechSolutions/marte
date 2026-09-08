// ÜRETİLMİŞ DOSYA — elle düzenleme.
// Kaynak: antrenman-simulatoru v1.0.0 — hangi üretimden geldiği manifest.json'da
// Değişiklik orada yapılır, buraya kopyalanır. Bu dosyayı düzenlemek iki ayrı
// motor doğurur. Bütünlük kontrolü: manifest.json.

import {
  B,
  MAX_ANKLE_LIFT,
  facingFlip,
  footDirOf,
  footLowestY,
  footPinned,
  footSpan,
  centerOfMass,
  GROUND,
  RigExercise,
  RigPose,
  Skeleton,
  Vec,
  angleOf,
  frontPoints,
  frontTrunk,
  poseAt,
  showFarArm,
  toeOf,
  showFarLeg,
  skeleton,
} from '@/utils/rig';

/**
 * Hareketin mekanik denetimi.
 *
 * Kurallar tek yerde çünkü iki yerden okunuyorlar: testler (her arketip her
 * derlemede taranıyor) ve editör (kare düzenlenirken canlı uyarı). Ayrı
 * yazılsalardı editörde temiz görünen bir poz testte patlardı.
 *
 * Denetlenen şey çizim değil MEKANİK: eklem zeminin altına geçemez, topuk
 * ayak boyundan fazla kalkamaz, önden bakışta kol omuzdan çıkamaz. Eklem
 * açısı sınırları ayrı bir tabloda (`ROM_BANDS`) veri olarak duruyor; eşik
 * koda gömülü değil, tek yerden ayarlanıyor.
 */
export interface RigIssue {
  /** 0..1 arası, sorunun görüldüğü an. */
  t: number;
  rule: string;
  message: string;
}

const len = (a: Vec, b: Vec) => Math.hypot(b[0] - a[0], b[1] - a[1]);

const norm = (deg: number): number => {
  let d = ((deg % 360) + 360) % 360;
  if (d > 180) d -= 360;
  return d;
};

/** Diz bükülme açısı; işaret yalnızca `stand` modunda anlamlı. */
export const kneeFlex = (S: Skeleton): number => norm(angleOf(S.knee, S.ankle) - angleOf(S.pelvis, S.knee));

export const elbowFlex = (S: Skeleton): number => norm(angleOf(S.elbow, S.hand) - angleOf(S.sh, S.elbow));

/**
 * Eklem hareket açıklığı bandı.
 *
 * Her band açıyı NEREDEN okuduğunu kendisi söyler ve eşiğini veri olarak
 * taşır. Poz alanları üstünde dolaşan genel bir kural YOK: `RigPose` derece ve
 * piksel/azimut alanlarını aynı düz nesnede tutuyor (`hx`, `hy`, `shLift`,
 * `ankleLift` piksel) ve alanları gezen bir döngü piksel değerini açı sanar.
 * `auditLoop` bu hatayı bir kez yaptı; tablo o tuzağı yapısal olarak kapatıyor.
 */
interface RomBand {
  rule: string;
  /** Mesajda geçen ad. */
  label: string;
  /** Açıyı çıkarır. `p` yazılı açıları, `S` çözülmüş geometriyi verir. */
  angle: (p: RigPose, S: Skeleton) => number;
  /** Yazılmazsa alt sınır denetlenmez. */
  lo?: number;
  /** Yazılmazsa üst sınır denetlenmez. */
  hi?: number;
  /** Bandın uygulanmadığı hareketler. */
  skip?: (ex: RigExercise) => boolean;
}

/**
 * Eklem sınırları.
 *
 * Bu sayılar AAOS "normal aralık" DEĞİL, anatomik imkânsızlık eşiğidir. AAOS
 * normalleri sağlıklı popülasyonun ortalaması; derin çömelme onları zaten aşar
 * ve sınır olarak kullanmak doğru hareketleri hata sayardı. Buradaki çizgi
 * "insan bunu yapamaz" çizgisi: diz kendi üstüne katlanamaz, ters kırılamaz,
 * dirsek ön kolu pazuya gömemez.
 *
 * Omuz, boyun ve ayak bileği burada YOK. Omuz ve boyun türetmesi yatık pozlarda
 * klinik açıyla aynı referans eksenini kullanmıyor (`hip_thrust` omuzda −150°
 * okunuyor ve bunun sarmalama hatası mı gerçek sorun mu olduğu belirsiz); ayak
 * bileği ise modelde hiç yok, ayak yönü `footDirFor(mode)` sabiti. Üçü de
 * TODOS.md'de kayıtlı.
 */
export const ROM_BANDS: RomBand[] = [
  {
    rule: 'diz',
    label: 'diz',
    angle: (p) => Math.abs(norm(p.shinA - p.thighA)),
    hi: 160,
  },
  {
    rule: 'diz',
    label: 'diz ters yönde',
    // İşaret yalnızca ayakta anlamlı: figür +x yönüne bakarken bükülmenin yönü
    // sabit. Sırtüstü ve dört ayak modlarda gövde yön değiştirdiği için aynı
    // işaret ters anlama gelir, orada yalnızca büyüklük denetleniyor.
    angle: (p) => norm(p.shinA - p.thighA),
    lo: -15,
    skip: (ex) => ex.mode !== 'stand',
  },
  {
    rule: 'diz',
    label: 'uzak diz',
    angle: (p) => Math.abs(norm(p.shinF - p.thighF)),
    hi: 160,
    skip: (ex) => !showFarLeg(ex),
  },
  {
    // Bu bant `Math.abs` KULLANMIYOR, üstteki kullanıyor. Aradaki fark bir
    // hatayı gizliyordu: mutlak değer ters bükülmeyi normal bükülmeden
    // ayıramıyor, −30° geriye kırılan bir diz +30 olarak okunup bandın
    // içinde kalıyordu. `carry` tam bunu yapıyordu — uzak diz salınımın
    // yarısında 30° GERİYE bükülüyor, insan dizinin yapamayacağı şey. Yakın
    // dizin böyle bir alt sınırı vardı, uzak dizinki eksikti.
    rule: 'diz',
    label: 'uzak diz ters yönde',
    angle: (p) => norm(p.shinF - p.thighF),
    lo: -15,
    skip: (ex) => ex.mode !== 'stand' || !showFarLeg(ex),
  },
  {
    // Ayak bileği ROM'u. `lo` = dorsi fleksiyon (parmak yukarı), `hi` = plantar
    // fleksiyon (parmak aşağı, topuk yukarı).
    //
    // Sınırlar AAOS'un istirahat değerleri DEĞİL, işlevsel aralık: derin
    // çömelmede topuk yerdeyken dorsi fleksiyon 30-35°ye çıkıyor (ölçüldü,
    // `squat` dibinde −25°), oysa AAOS 20 diyor. 20 alsaydık doğru çizilmiş
    // çömelmeler uyarı verirdi. Plantar tarafta 50 ayak parmakları üstünde
    // durmayı (plank, topuk kalkışı) kapsıyor.
    //
    // Bu bandın ölçebileceği bir açı MODELDE YOKTU: ayak yönü kip başına
    // sabitti ve baldırı takip etmiyordu. Açı eklendiğinde ilk taramada 160
    // değerin 30'u (%19) aralık dışında çıktı, hepsi uzak tarafta.
    rule: 'bilek',
    label: 'bilek',
    angle: (p) => p.ankle,
    lo: -35,
    hi: 50,
  },
  {
    rule: 'bilek',
    label: 'uzak bilek',
    angle: (p) => p.ankleF,
    lo: -35,
    hi: 50,
    skip: (ex) => !showFarLeg(ex),
  },
  // Parmak eklemi (MTP): ekstansiyon ~70°, fleksiyon ~30°; ötesi kırık parmak.
  { rule: 'parmak', label: 'parmak', angle: (p) => p.toe, lo: -30, hi: 70 },
  { rule: 'parmak', label: 'uzak parmak', angle: (p) => p.toeF, lo: -30, hi: 70, skip: (ex) => !showFarLeg(ex) },
  {
    rule: 'dirsek',
    label: 'dirsek',
    // Poz DEĞİL iskelet. `arm` 'ik' ya da 'floor' iken kareler `upperA`/`foreA`
    // yazmıyor, açı ters kinematik çözücüsünden çıkıyor; pozdan okumak o sekiz
    // harekette sabit 0 verir ve kural sessizce ölür. Eski kuralın
    // `arm === 'angles'` kapısı da tam bu yüzden vardı, kapı değil kaynak
    // yanlıştı.
    angle: (_p, S) => Math.abs(elbowFlex(S)),
    hi: 160,
  },
  {
    rule: 'kalça',
    label: 'kalça',
    // 0 = uyluk gövdenin uzantısı, pozitif = öne bükülme, negatif = geriye açılma.
    angle: (p) => norm(180 - (p.thighA - p.torso)),
    lo: -35,
    hi: 150,
  },
  {
    rule: 'gövde',
    label: 'gövde',
    angle: (p) => norm(p.thoraxA - p.torso),
    lo: -45,
    hi: 90,
  },
];

/** Tek bir karenin denetimi — editör bunu her sürükleme sonrası çağırıyor. */
export function auditFrame(ex: RigExercise, p: RigPose, t = 0): RigIssue[] {
  const S = skeleton(ex, p);
  const issues: RigIssue[] = [];
  const add = (rule: string, message: string) => issues.push({ t, rule, message });

  // Gizli uzuv çizilmiyor: zeminin altında olması görünür bir kusur değil.
  const hidden = new Set<keyof Skeleton>([
    ...(showFarLeg(ex) ? [] : (['hipF', 'kneeF', 'ankleF'] as (keyof Skeleton)[])),
    ...(showFarArm(ex) ? [] : (['shF', 'elbowF', 'handF'] as (keyof Skeleton)[])),
  ]);
  (Object.keys(S) as (keyof Skeleton)[]).forEach((k) => {
    const v = S[k];
    if (!v || k === 'bar' || hidden.has(k)) return;
    if (v[1] > GROUND + 14) add('zemin', `${k} zeminin altında`);
  });

  // Ayakta duran figürde ayağı yerden koparan tek şey `ankleLift`: iskelet
  // ayağı zaten `GROUND - 12 - ankleLift`'e koyuyor, yani konumu ölçmek
  // tanım gereği hep sıfır fark veriyordu. Denetlenecek şey konum değil,
  // kalkışın MİKTARI: topuk ayak boyundan fazla kalkarsa taban zeminden
  // kopar, figür havada yürür. Basamak ayrı hikâye — orada yükselten şey
  // ayak değil, altındaki kutu.
  if (ex.mode === 'stand' && ex.prop !== 'box') {
    if (p.ankleLift < 0) add('ayak', 'basan ayak zeminin altına inmiş');
    // Sınır ayak BOYU değil, parmak ucunun UZANABİLDİĞİ mesafe: topuk kalkarken
    // ayak parmak etrafında döner ve ayak bileği ancak o mesafe kadar
    // yükselebilir. Eski sınır (ayak boyu 46) çizimin yapabildiğinin iki katı
    // gevşekti ve `calf_raise` 38px ile aradan geçiyordu.
    if (p.ankleLift > MAX_ANKLE_LIFT) {
      add('ayak', `topuk ${Math.round(p.ankleLift)}px kalkmış, parmak ucu en fazla ${MAX_ANKLE_LIFT}px'e yetişiyor — parmak yerden kopuyor`);
    }
  }

  // ÇİZİLEN ayak zeminin altına inmemeli.
  //
  // Eklem konumunu ölçen `zemin` kuralı bunu göremiyor: ayak bileği yerin
  // üstünde durup ayak yine de zemine gömülebiliyor, çünkü tabanın kalınlığı
  // var. Eskiden görünmüyordu da — dörtgen ayak kendini `min(GROUND, …)` ile
  // zemine kırpıyordu, yani veri yanlışsa bile çizim doğru görünüyordu. Yeni
  // ayak katı bir şekil; kırpma kalkınca hata ortaya çıktı.
  //
  // Ölçüldü: `bench_press` ve `incline_press` ayağı 6.4px gömüyordu; diğer 28
  // arketip temizdi. Tolerans 2px, yuvarlama payı.
  {
    const flip = facingFlip(ex.mode);
    const feet: [string, Vec, boolean][] = [
      ['ayak', S.ankle, false],
      ...(showFarLeg(ex) ? ([['uzak ayak', S.ankleF, true]] as [string, Vec, boolean][]) : []),
    ];
    feet.forEach(([ad, ankle, far]) => {
      const pen = footLowestY(ankle, footDirOf(ex, p, far), footPinned(ex, p, S, far), flip, toeOf(p, far)) - GROUND;
      if (pen > 2) add('zemin', `${ad} zeminin ${Math.round(pen)}px altına giriyor`);
    });
  }

  if (ex.mode === 'quad' || ex.mode === 'supine') {
    const lowest = Math.max(S.ankle[1], S.ankleF[1], S.knee[1], S.kneeF[1], S.hand[1], S.handF[1], S.pelvis[1], S.head[1]);
    if (lowest < GROUND - 30) add('temas', 'hiçbir yeri yere değmiyor');
  }

  // DENGE: ağırlık merkezi (vücut + yük) destek tabanının içinde olmalı.
  //
  // Ana kriter hareketi doğru anlatmak; ağırlık merkezi tabanın dışındaysa
  // figür gerçekte düşer, yani gösterilen poz yapılamaz. Ölçülüp bulundu:
  // step_up'ta tek destek basamaktaki ayakken merkez 18px geride, goblet
  // squat dibinde 13px topukların gerisinde.
  //
  // Taban: yere ya da sehpaya basan ayakların taban aralığı. Yerden 20px'e
  // kadar yükselmiş ayak da sayılıyor — yürüyüşte (carry) merkez, inmek
  // üzere olan ayağa doğru öne geçer; bu düşme değil adım. Yalnız ayakta
  // kipte; sırt sehpadayken (hip thrust) taban ayak değil.
  // Gövde yerdeyse (glute bridge) taban ayak değil, sırt: atla.
  if (ex.mode === 'stand' && ex.prop !== 'hipbench' && S.thorax[1] < GROUND - 140) {
    const flip = facingFlip(ex.mode);
    const feet: [number, number][] = [];
    const cand: [Vec, boolean][] = [[S.ankle, false], ...(showFarLeg(ex) ? ([[S.ankleF, true]] as [Vec, boolean][]) : [])];
    for (const [ankle, far] of cand) {
      const dir = footDirOf(ex, p, far);
      const pin = footPinned(ex, p, S, far);
      const low = footLowestY(ankle, dir, pin, flip, toeOf(p, far));
      const onProp = (ex.prop === 'box' && !far) || (ex.prop === 'bench' && far);
      if (GROUND - low <= 20 || onProp) feet.push(footSpan(ankle, dir, pin, flip, toeOf(p, far)));
    }
    if (feet.length) {
      const lo = Math.min(...feet.map((f) => f[0]));
      const hi = Math.max(...feet.map((f) => f[1]));
      const cx = centerOfMass(ex, S)[0];
      const out = cx < lo ? cx - lo : cx > hi ? cx - hi : 0;
      if (Math.abs(out) > 8) add('denge', `ağırlık merkezi tabanın ${Math.round(Math.abs(out))}px ${out < 0 ? 'gerisinde' : 'önünde'} — figür düşer`);
    }
  }

  // Sırttaki bar GÖVDEDEN hesaplanıyor, elden değil — yani elin ona ulaşıp
  // ulaşmadığını hiçbir şey kontrol etmiyordu. `bar: 'hands'` olanlarda tutuş
  // yapı gereği garanti (bar elin konumuna çiziliyor), burada değil. Squat'ta
  // el bardan 56px ötede havada duruyordu ve hareket "eller arkada tutuluyor"
  // gibi okunuyordu.
  if (ex.bar === 'back' && S.bar) {
    const reach = len(S.hand, S.bar);
    if (reach > 30) add('tutuş', `el bardan ${Math.round(reach)}px uzakta — barı tutmuyor`);
  }

  if (ex.mode === 'hang') {
    if (S.hand[1] > 140) add('bar', 'el bardan kopmuş');
    if (S.ankle[1] > GROUND - 20) add('asılı', 'ayak yere değiyor');
  }

  // Eklem sınırları tek yerden, `ROM_BANDS` tablosundan geliyor. Eşikler koda
  // gömülü değil veri olduğu için editör, testler ve uygulama aynı sayıyı
  // okuyor; ayarlamak tek satır. Eskiden diz 155, dirsek 160 ayrı ayrı yazılıydı
  // ve dirsek kuralı `arm === 'angles'` kapısı yüzünden 30 arketipin 8'inde hiç
  // çalışmıyordu.
  ROM_BANDS.forEach((band) => {
    if (band.skip && band.skip(ex)) return;
    const v = band.angle(p, S);
    if (band.hi !== undefined && v > band.hi) {
      add(band.rule, `${band.label} ${Math.round(v)}° bükülmüş (üst sınır ${band.hi}°)`);
    }
    if (band.lo !== undefined && v < band.lo) {
      add(band.rule, `${band.label} ${Math.round(v)}° (alt sınır ${band.lo}°)`);
    }
  });

  if (len(S.pelvis, S.head) < 90) add('gövde', 'gövde kendi üstüne katlanmış');

  if (ex.view === 'front') {
    const F = frontPoints(ex, p, S);
    const trunk = frontTrunk(F);
    if (trunk.ry <= 0) add('gövde', 'önden gövde çizilemiyor (yarıçap negatif)');
    // Kol boyu artık yapı gereği doğru (3B yönden izdüşüm); eski 'kol' kuralı
    // hxF'in uzattığı kolu yakalıyordu, hxF yok.
  }

  return issues;
}

/**
 * Tekrarın tamamı — 21 kare. Uçlar kadar aralar da denetleniyor: eklem-yerel
 * geçiş yüzünden iki doğru karenin arası pekâlâ yanlış olabiliyor (kolun
 * uzun yoldan dönüp yerin içinden geçmesi böyle yakalandı).
 */
/**
 * Hareketin tamamını tarar.
 *
 * 41 örnek, 21 değil. Ölçüldü: 21 örnek `lunge_reach`in 163°lik dirsek
 * ihlalini KAÇIRIYORDU — ihlal iki örnek arasında kalıyor ve kural sessiz
 * kalıyordu. Kaba örnekleme, olmayan bir kuraldan farksız.
 *
 * Bedeli ölçüldü: 31 arketibin tam taraması 84ms yerine 157ms. Bu bir
 * geliştirme zamanı kontrolü, çalışma zamanı değil.
 */
export function auditExercise(ex: RigExercise, samples = 41): RigIssue[] {
  const seen = new Set<string>();
  const issues: RigIssue[] = [];
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    auditFrame(ex, poseAt(ex, t).p, t).forEach((issue) => {
      // Aynı sorun 21 karede 21 kez bildirilmesin; ilk görüldüğü an yeter.
      const key = issue.rule + '|' + issue.message;
      if (seen.has(key)) return;
      seen.add(key);
      issues.push(issue);
    });
  }
  return issues;
}

/**
 * Döngü kapanıyor mu: son karenin pozu ilk kareyle aynı olmalı.
 *
 * Hareket sonsuz döner; t=1 ile t=0 farklıysa her tekrarın sonunda figür
 * gözle görülür biçimde zıplar. Elle kare yazarken en kolay kaçırılan şey bu,
 * çünkü iki kare de tek başına doğru görünür.
 */
/**
 * Piksel cinsinden yazılan alanlar. Bunlar açı değil: `norm()` ile
 * sarmalanırlarsa 360 birimlik bir kaçak sıfır görünür ve döngü kapalı
 * sanılır. `hy` tek başına 440 birim gezebiliyor.
 */
const OFFSET_KEYS = new Set<keyof RigPose>(['hx', 'hy', 'shLift', 'ankleLift', 'armAz', 'armAzF', 'foreAz', 'foreAzF', 'toe', 'toeF']);

export function auditLoop(ex: RigExercise): RigIssue[] {
  const first = poseAt(ex, 0).p;
  const last = poseAt(ex, 1).p;
  const issues: RigIssue[] = [];
  (Object.keys(first) as (keyof RigPose)[]).forEach((k) => {
    const px = OFFSET_KEYS.has(k);
    const d = px ? Math.abs(first[k] - last[k]) : Math.abs(norm(first[k] - last[k]));
    const u = px ? 'px' : '°';
    if (d > 1) issues.push({ t: 1, rule: 'döngü', message: `${k}: başlangıç ${first[k]}${u} ile bitiş ${last[k]}${u} farklı, tekrar başa dönerken zıplıyor` });
  });
  // Sabit durması gereken ayak da döngü ölçeğinde bir sorun: tek kareye
  // bakarak görülmüyor, ancak zaman içinde gezindiği anlaşılıyor.
  issues.push(...auditPlantedFoot(ex));
  return issues;
}

/**
 * Sehpaya basan ayak kaymamalı.
 *
 * `bulgarian_split_squat`ta arka ayak sehpanın üstünde DURUR; hareketi yapan
 * ön bacaktır. Ama uzak bacak serbest bir zincir — kalça inerken açılar
 * değişmezse ayak sehpanın üstünde kayar. Ölçüldü: ayak bileği 89.7px
 * geziniyordu ve sehpanın (150px) dışına, boşluğa çıkıyordu.
 *
 * Bu kural yalnız o kurulumu denetliyor: sehpa var ama figür sehpanın ÜSTÜNDE
 * yatmıyor (`mode !== 'bench'`), yani sehpa ayağın altında. Diğer arketiplerde
 * uzak ayağın gezinmesi kasıtlı — `step_up` basamağa çıkıyor, `bird_dog`
 * bacağı geriye uzatıyor, `unilateral_lunge` adım atıyor. Ölçülüp bakıldı,
 * karıştırılmasın diye burada yazılı.
 *
 * Eşik 15px ≈ 6cm: açı interpolasyonu uçları tutturup arada hafif şişiyor,
 * sıfır kayma açı uzayında elde edilemiyor.
 */
export function auditPlantedFoot(ex: RigExercise, samples = 41): RigIssue[] {
  if (ex.prop !== 'bench' || ex.mode === 'bench' || !showFarLeg(ex)) return [];
  let lo = Infinity;
  let hi = -Infinity;
  let at = 0;
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const x = skeleton(ex, poseAt(ex, t).p).ankleF[0];
    if (x < lo) lo = x;
    if (x > hi) { hi = x; at = t; }
  }
  const drift = hi - lo;
  return drift > 15
    ? [{ t: at, rule: 'temas', message: `sehpaya basan ayak ${Math.round(drift)}px kayıyor — sehpanın üstünde durmalı` }]
    : [];
}

/** Segment boyları — geçiş sırasında uzuv uzarsa motor bozulmuş demektir. */
export function auditSegments(ex: RigExercise, samples = 21): RigIssue[] {
  const issues: RigIssue[] = [];
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const S = skeleton(ex, poseAt(ex, t).p);
    const check = (name: string, a: Vec, b: Vec, expected: number) => {
      if (Math.abs(len(a, b) - expected) > 0.01) {
        issues.push({ t, rule: 'segment', message: `${name} uzunluğu ${len(a, b).toFixed(1)} (olması gereken ${expected})` });
      }
    };
    check('uyluk', S.pelvis, S.knee, B.thigh);
    check('baldır', S.knee, S.ankle, B.shin);
    check('uzak uyluk', S.hipF, S.kneeF, B.thigh);
    check('bel', S.pelvis, S.lumbar, B.lumbar);
    check('gövde', S.lumbar, S.thorax, B.thorax);
  }
  return issues;
}
