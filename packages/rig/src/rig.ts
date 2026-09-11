/**
 * Eklemli kukla — ileri kinematik + kollar için ters kinematik.
 *
 * Kareler AÇI olarak yazılır, segment boyları sabittir (`B`). Geçiş
 * eklem-yerel uzayda yapılır: kalça, diz, omuz, dirsek açıları gövdeye GÖRE
 * geçer, yani sırt açısı değişirken uzuvlar gövdeyle birlikte döner. Nokta
 * interpolasyonu yapan eski motorun iki kusuru böyle kapanıyor: uzuvlar
 * kendi etraflarında dönmüyor ve gövde ara karelerde uzamıyor.
 *
 * Figür +x yönüne bakar. Açılar dünya uzayında: 0 = yukarı, saat yönünde
 * artar.
 *
 * Beş kök nokta (`mode`) var, çünkü bir hareketin nereye bastığı çizimin
 * temelidir:
 *   stand  — ayak tabanı yere sabit, kalça yüksekliği açılardan çıkar
 *   quad   — dört ayak / şınav duruşu, en alçak temas noktası yere oturur
 *   bench  — sehpada sırtüstü, sehpa çizilir
 *   supine — yerde sırtüstü, sırt yere oturur
 *   hang   — barda asılı, eller bara sabit, gövde aşağı sarkar
 */

export type Vec = [number, number];

/** Segment boyları. Tek doğruluk kaynağı: hiçbir kare boy yazmaz. */
export const B = {
  shin: 100,
  thigh: 105,
  lumbar: 55,
  thorax: 85,
  neck: 24,
  upper: 78,
  fore: 68,
  foot: 46,
  headR: 27,
} as const;

export const GROUND = 560;
export const ANKLE_X = 210;
export const CENTER_X = 210;
/**
 * Barın yüksekliği (hang). Asılı figür bardan aşağı yaklaşık 480px sarkıyor
 * (kol + gövde + bacak), bu yüzden bar yeterince yukarıda olmalı — yoksa
 * ayaklar zeminin altında kalır.
 */
export const BAR_Y = 56;
/**
 * Oturma yüksekliği: makinede kalçanın durduğu y.
 *
 * Baldır boyu kadar (`B.shin` = 100) zeminin üstünde + ayak kalınlığı payı.
 * Dik oturan ve ayağı yerde olan bir figürde baldır dikey, uyluk yataydır;
 * kalça o yüzden tam diz hizasında durur. Bacak presi gibi ayağın havada
 * olduğu hareketlerde de aynı yükseklik kullanılır — orada zemine basan
 * bir şey yoktur, referans koltuğun kendisidir.
 */
export const SEAT_Y = GROUND - 112;

export const rad = (d: number): number => (d * Math.PI) / 180;
export const D = (d: number): Vec => [Math.sin(rad(d)), -Math.cos(rad(d))];
export const add = (p: Vec, v: Vec, s: number): Vec => [p[0] + v[0] * s, p[1] + v[1] * s];
export const sub = (p: Vec, v: Vec, s: number): Vec => [p[0] - v[0] * s, p[1] - v[1] * s];
export const lerpP = (a: Vec, b: Vec, u: number): Vec => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];

/** İki nokta arasındaki dünya açısı (derece), `D` ile aynı eksende. */
export const angleOf = (a: Vec, b: Vec): number => (Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180) / Math.PI;

export interface RigPose {
  /** Yakın taraf: diz→ayak bileği, kalça→diz, kalça→bel, bel→göğüs, göğüs→boyun. */
  shinA: number;
  thighA: number;
  torso: number;
  thoraxA: number;
  neckA: number;
  /** Yakın kol (arm: 'angles' iken). */
  upperA: number;
  foreA: number;
  /** Ters kinematik hedefi, omuza göre (arm: 'ik' / 'floor'). */
  hx: number;
  hy: number;
  /**
   * Uzak taraf uzuvları. Yazılmazsa yakın uzvun birkaç derece kaydırılmışı
   * kullanılır — iki bacak üst üste binip tek bacak gibi görünmesin diye.
   * Hamle, step-up, bird-dog gibi iki tarafı AYRI çalışan hareketlerde
   * kareler bunları açıkça yazar.
   */
  thighF: number;
  shinF: number;
  upperF: number;
  foreF: number;
  /** Önden görünümde elin merkeze uzaklığı — yanal düzlemde çalışan hareketler. */
  hxF: number;
  /** Önden görünümde omuz yükselmesi (shrug). */
  shLift: number;
  /** Topuğun yerden kalkması (calf raise) ya da ayağın basamağa çıkması (step-up). */
  ankleLift: number;
}

export interface RigKeyframe {
  t: number;
  tr: string;
  p: Partial<RigPose>;
}

export type RigMode = 'stand' | 'quad' | 'bench' | 'supine' | 'hang' | 'seat';
export type RigArm = 'angles' | 'ik' | 'floor';
export type RigBar = 'back' | 'hands' | 'hips' | null;
/**
 * Sahnedeki ekipman. Her değer bir İSTASYONU tarif ediyor, tek bir parçayı
 * değil: `prop` tek değer aldığı için "koltuk + kızak" diye bir bileşim
 * yazılamıyor ve yalnızca kızağı seçmek figürü koltuksuz, havada bırakıyordu.
 */
export type RigProp = 'bench' | 'box' | 'bar' | 'hipbench' | 'seatback' | 'sled' | 'cable' | 'legpad' | null;

/**
 * Direncin GELDİĞİ yer. Kuvvetin yönünü bu belirliyor, çizim süsü değil:
 * yanlış seçilirse hareket başka bir hareket gibi okunuyor — göğüs presine
 * önden kablo koymak onu kürek yapıyordu.
 *
 * `high`  baş üstü makara — lat pulldown
 * `front` önde, el hizasında makara — yüz çekişi
 * `low`   önde, zemine yakın makara — oturarak kürek (kablo yerden yükselir)
 * `back`  arkada makara ve İTME KOLU — göğüs presi; direnç öne itişe karşı
 *         koyar, yani arkadan gelir
 */
export type RigCableFrom = 'high' | 'front' | 'low' | 'back';

/**
 * Elde taşınan yük. `bar` barın NEREDE olduğunu söyler (sırtta, elde,
 * kalçada); bu ise NE olduğunu: barbell tek uzun bir demir, dambıl iki ayrı
 * ağırlık. Dambıl hareketlerinde barbell tabağı çizmek yükü olduğundan çok
 * daha büyük gösteriyordu.
 */
export type RigLoad = 'barbell' | 'dumbbell' | null;

export interface RigExercise {
  mode: RigMode;
  /** `ik`: eller hedefe gider, `floor`: eller yere basar, `angles`: açıyla çizilir. */
  arm: RigArm;
  bar: RigBar;
  /** Dirseğin büküleceği yön (+1 / -1). */
  bend: number;
  /** Bir tekrarın süresi (ms). */
  dur: number;
  /** Yazılmazsa `bar` varsa barbell, yoksa yük yok. */
  load?: RigLoad;
  /**
   * Uzak uzuvları yandan görünümde gizler.
   *
   * Yalnızca ÇİZİMİ etkiler: iskelet, yere oturma ve kadraj aynı kalır, yani
   * gizlemek figürü kımıldatmaz.
   *
   * `hideFarLeg` yazılmazsa karar OTOMATİK: uzak bacağın yakın bacaktan ayrı
   * bir hareketi yoksa gizlenir (bkz. `farLegDistinct`). Yalnızca kuralın
   * dışına çıkmak gerektiğinde yazılır.
   */
  hideFarLeg?: boolean;
  hideFarArm?: boolean;
  /** Hangi düzlemde okunur: yanal düzlemde çalışan hareketler önden anlaşılır. */
  view?: 'side' | 'front';
  prop?: RigProp;
  /** Ayak yönü, moda göre varsayılanı ezer (bkz. `footDirOf`). */
  footDir?: number;
  /** `prop: 'cable'` iken makaranın yeri. Yazılmazsa `'front'`. */
  cableFrom?: RigCableFrom;
  /** Kareleri yazan kişinin notu — hareketin ne anlatması gerektiği. Çizimi etkilemez. */
  note?: string;
  kf: RigKeyframe[];
}

const BASE = {
  shinA: 180,
  thighA: 180,
  torso: 0,
  thoraxA: 0,
  neckA: 0,
  upperA: 180,
  foreA: 180,
  hx: 0,
  hy: 0,
  hxF: 66,
  shLift: 0,
  ankleLift: 0,
};

/** Yumuşak geçiş (smoothstep). Uçlarda hız sıfır, ortada en hızlı. */
export const ease = (u: number): number => u * u * (3 - 2 * u);

/** Duruştan çıkış: yavaş başla, hızla devam et. */
const easeOut = (u: number): number => u * u;
/** Duruşa varış: hızla gel, yavaşlayarak dur. */
const easeIn = (u: number): number => u * (2 - u);

/**
 * İki karenin pozu aynı mı? Aynıysa aradaki aralık bir BEKLEME'dir.
 *
 * Bekleme ile geçiş ayrımı yumuşatmanın nereye uygulanacağını belirliyor:
 * beklemede hızın sıfırlanması hareketin kendisi, geçiş karesinde ise hata.
 */
const samePose = (a: RigKeyframe, b: RigKeyframe): boolean => {
  const A = fillPose(a.p);
  const B = fillPose(b.p);
  return (Object.keys(A) as (keyof RigPose)[]).every((k) => Math.abs(A[k] - B[k]) <= 0.5);
};

/**
 * Eksik alanları doldurur. Uzak uzuvlar yazılmadıysa yakınından türetilir:
 * yalnızca birkaç derece fark, çünkü iki taraf aynı işi yapıyordur.
 */
export const fillPose = (p: Partial<RigPose>): RigPose => {
  const f = { ...BASE, ...p };
  return {
    ...f,
    thighF: p.thighF ?? f.thighA + 7,
    shinF: p.shinF ?? f.shinA - 5,
    upperF: p.upperF ?? f.upperA - 5,
    foreF: p.foreF ?? f.foreA + 2,
  };
};

interface LocalPose {
  torso: number;
  thoraxA: number;
  neckA: number;
  thighA: number;
  shinA: number;
  upperA: number;
  foreA: number;
  thighF: number;
  shinF: number;
  upperF: number;
  foreF: number;
  hx: number;
  hy: number;
  hxF: number;
  shLift: number;
  ankleLift: number;
}

/**
 * Dünya açılarını eklem-yerel açılara çevirir.
 *
 * Kareler dünya uzayında yazılıyor çünkü "kaval kemiği dikey" demek insan
 * için kolay. Ama ara kareler yerel uzayda hesaplanmalı, yoksa gövde öne
 * eğilirken bacak yerinde kalıyormuş gibi görünür.
 */
export const toLocal = (p: RigPose): LocalPose => ({
  torso: p.torso,
  thoraxA: p.thoraxA - p.torso,
  neckA: p.neckA - p.thoraxA,
  thighA: p.thighA - p.torso,
  shinA: p.shinA - p.thighA,
  upperA: p.upperA - p.thoraxA,
  foreA: p.foreA - p.upperA,
  thighF: p.thighF - p.torso,
  shinF: p.shinF - p.thighF,
  upperF: p.upperF - p.thoraxA,
  foreF: p.foreF - p.upperF,
  hx: p.hx,
  hy: p.hy,
  hxF: p.hxF,
  shLift: p.shLift,
  ankleLift: p.ankleLift,
});

export const toWorld = (l: LocalPose): RigPose => {
  const torso = l.torso;
  const thoraxA = torso + l.thoraxA;
  const thighA = torso + l.thighA;
  const thighF = torso + l.thighF;
  const upperA = thoraxA + l.upperA;
  const upperF = thoraxA + l.upperF;
  return {
    torso,
    thoraxA,
    neckA: thoraxA + l.neckA,
    thighA,
    shinA: thighA + l.shinA,
    upperA,
    foreA: upperA + l.foreA,
    thighF,
    shinF: thighF + l.shinF,
    upperF,
    foreF: upperF + l.foreF,
    hx: l.hx,
    hy: l.hy,
    hxF: l.hxF,
    shLift: l.shLift,
    ankleLift: l.ankleLift,
  };
};

/**
 * İki eklemli zincir için ters kinematik: omuz `S`'den hedefe `T` uzanan
 * kolun dirsek ve el konumu. `bend` dirseğin hangi tarafa büküleceğini
 * seçer — bench press'te aşağı, omuz press'te yukarı.
 *
 * Hedef erişilemeyecek kadar uzak ya da yakınsa mesafe kırpılır: kol
 * kopmaz, sadece tam açılır veya tam katlanır.
 */
export function ik(S: Vec, T: Vec, L1: number, L2: number, bend: number): { elbow: Vec; hand: Vec } {
  const dx = T[0] - S[0];
  const dy = T[1] - S[1];
  const lo = Math.abs(L1 - L2) + 3;
  const hi = L1 + L2 - 3;
  const dist = Math.min(hi, Math.max(lo, Math.hypot(dx, dy)));
  const base = Math.atan2(dx, -dy);
  const c = (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist);
  const th = base + bend * Math.acos(Math.min(1, Math.max(-1, c)));
  const elbow: Vec = [S[0] + Math.sin(th) * L1, S[1] - Math.cos(th) * L1];
  const fd = Math.atan2(T[0] - elbow[0], -(T[1] - elbow[1]));
  return { elbow, hand: [elbow[0] + Math.sin(fd) * L2, elbow[1] - Math.cos(fd) * L2] };
}

/** `t` (0..1) anındaki poz ve o anın evre adı. */
export function poseAt(ex: RigExercise, t: number): { p: RigPose; phase: RigKeyframe } {
  const kf = ex.kf;
  let i = 0;
  while (i < kf.length - 2 && t > kf[i + 1].t) i++;
  const a = kf[i];
  const b = kf[i + 1] || kf[i];
  const span = Math.max(0.0001, b.t - a.t);
  const raw = Math.min(1, Math.max(0, (t - a.t) / span));

  /*
   * Yumuşatma her aralığa DEĞİL, yalnızca hareketin gerçekten durduğu yerlere
   * uygulanıyor.
   *
   * Eskiden her aralık smoothstep'ti ve bu, figürün HER ara karede hızını
   * sıfırlaması demekti. Ölçüldü: 30 arketipteki 9 gerçek geçiş karesinin
   * dokuzunda da hız ortalamanın %25'inin altına düşüyordu — kol çevirme turun
   * içinde üç kez, omuz presi itişin ortasında duruyordu.
   *
   * Sıfır hız yalnızca BEKLEME'de doğru: iki komşu karenin pozu aynıysa orada
   * hareket gerçekten duruyor (çömelmenin dibi, plank duruşu). Geçiş
   * karesinden ise hızla geçilmeli.
   *
   * Kübik bir eğri (Catmull-Rom) hızı tam sürekli yapardı ama uçları aşabilir
   * ve aşan bir eklem ROM bandını ihlal eder; yani yumuşaklık uğruna anatomik
   * doğruluk riske girerdi. Buradaki çözüm hızda küçük bir kırılma bırakıyor,
   * ama duraklamayı tamamen kaldırıyor.
   */
  const startsAtRest = i === 0 || samePose(kf[i - 1], a);
  const endsAtRest = i + 2 >= kf.length || samePose(b, kf[i + 2]);
  const u = startsAtRest && endsAtRest ? ease(raw) : startsAtRest ? easeOut(raw) : endsAtRest ? easeIn(raw) : raw;
  const la = toLocal(fillPose(a.p));
  const lb = toLocal(fillPose(b.p));
  const l = {} as LocalPose;
  (Object.keys(la) as (keyof LocalPose)[]).forEach((k) => {
    l[k] = la[k] + (lb[k] - la[k]) * u;
  });
  return { p: toWorld(l), phase: u < 0.5 ? a : b };
}

export interface Skeleton {
  pelvis: Vec;
  knee: Vec;
  ankle: Vec;
  hipF: Vec;
  kneeF: Vec;
  ankleF: Vec;
  lumbar: Vec;
  thorax: Vec;
  neck: Vec;
  head: Vec;
  sh: Vec;
  elbow: Vec;
  hand: Vec;
  shF: Vec;
  elbowF: Vec;
  handF: Vec;
  bar: Vec | null;
}

/** Modun yere bastığı noktalar — figür bunların en alçağına oturtulur. */
const CONTACTS: Record<RigMode, (keyof Skeleton)[]> = {
  stand: [],
  quad: ['ankle', 'ankleF', 'knee', 'kneeF', 'hand', 'handF'],
  bench: [],
  supine: ['pelvis', 'thorax', 'head', 'ankle', 'hand'],
  hang: [],
  // Oturan figürü yere oturtacak bir temas noktası YOK: referans koltuktur,
  // zemin değil. `bench` ile aynı gerekçe — kalça sabit, dünya sabit.
  seat: [],
};

/**
 * Açılardan iskeleti çözer.
 *
 * Ayakta yapılan hareketlerde zincir AYAK BİLEĞİNDEN yukarı kurulur (ayak
 * yere sabit), barda asılı hareketlerde ELDEN aşağı kurulur (el bara
 * sabit), diğerlerinde kalçadan kurulup en alçak temas noktası yere
 * oturtulur. Bu son adım olmadan plank'ın ayakları havada kalıyordu.
 */
/**
 * Kadraj kaydırması, TEKRARIN TAMAMI için bir kez hesaplanır.
 *
 * Kare başına hesaplanan bir kaydırma figürü ortalar ama sahnenin geri
 * kalanını — zemin çizgisini, sehpayı, basamağı — figürle birlikte
 * sürükler: bar yukarı çıkarken yer yana kayıyordu. Dünya sabit durmalı,
 * içinde insan hareket etmeli.
 *
 * Önbellek nesne KİMLİĞİNE değil İÇERİĞE bağlı. Editör kareleri yerinde
 * değiştiriyor (aynı nesne, yeni açılar); kimliğe bağlı bir önbellek orada
 * bayatlıyor ve editördeki figür uygulamadakinden ~11px kayıyordu — aynı
 * veri, iki ayrı görüntü.
 */
const SHIFT = new Map<string, number>();

/** Kaydırmayı belirleyen her şey: kareler ve zinciri kuran ayarlar. */
const shiftKey = (ex: RigExercise): string =>
  `${ex.mode}|${ex.arm}|${ex.bar}|${ex.bend}|${JSON.stringify(ex.kf)}`;

function centeringShift(ex: RigExercise): number {
  const key = shiftKey(ex);
  const cached = SHIFT.get(key);
  if (cached !== undefined) return cached;
  let dx = 0;
  if (ex.mode !== 'hang') {
    let sum = 0;
    const N = 12;
    for (let i = 0; i < N; i++) {
      const { p } = poseAt(ex, i / N);
      const S = build(ex, p);
      const anchor = S.bar ? (S.bar[0] + S.pelvis[0] * 1.4) / 2.4 : S.pelvis[0];
      sum += CENTER_X - anchor;
    }
    dx = sum / N;
  }
  // Editörde her sürükleme yeni bir anahtar üretiyor; yığılmasın diye
  // kütüphaneden birkaç kat büyüdüğünde tamamen boşaltılıyor.
  if (SHIFT.size > 512) SHIFT.clear();
  SHIFT.set(key, dx);
  return dx;
}

export function skeleton(ex: RigExercise, p: RigPose): Skeleton {
  const S = build(ex, p);
  const dx = centeringShift(ex);
  // Yere oturtma kare başına kalır: temas noktası zeminde durmalı, zemin
  // değil figür yer değiştirir.
  const contacts = CONTACTS[ex.mode];
  const dy = contacts.length ? GROUND - 8 - Math.max(...contacts.map((k) => (S[k] as Vec)[1])) : 0;
  (Object.keys(S) as (keyof Skeleton)[]).forEach((k) => {
    const v = S[k];
    if (v) (S[k] as Vec) = [v[0] + dx, v[1] + dy];
  });
  return S;
}

function build(ex: RigExercise, p: RigPose): Skeleton {
  let pelvis: Vec;
  let ankle: Vec;
  let knee: Vec;
  let sh: Vec | null = null;
  let hand: Vec | null = null;
  let elbow: Vec | null = null;

  if (ex.mode === 'hang') {
    // Zincir ters yönde: el barda, omuz elden aşağıda, gövde omuzdan sarkar.
    hand = [CENTER_X, BAR_Y];
    elbow = sub(hand, D(p.foreA), B.fore);
    sh = sub(elbow, D(p.upperA), B.upper);
    const thoraxH = sub(sh, D(p.thoraxA + 118), 14);
    const lumbarH = sub(thoraxH, D(p.thoraxA), B.thorax);
    pelvis = sub(lumbarH, D(p.torso), B.lumbar);
    knee = add(pelvis, D(p.thighA), B.thigh);
    ankle = add(knee, D(p.shinA), B.shin);
  } else if (ex.mode === 'stand') {
    ankle = [ANKLE_X, GROUND - 12 - p.ankleLift];
    knee = sub(ankle, D(p.shinA), B.shin);
    pelvis = sub(knee, D(p.thighA), B.thigh);
  } else {
    pelvis = ex.mode === 'quad' ? [150, GROUND - 119] : ex.mode === 'seat' ? [150, SEAT_Y] : [150, 430];
    knee = add(pelvis, D(p.thighA), B.thigh);
    ankle = add(knee, D(p.shinA), B.shin);
  }

  const hipF: Vec = [pelvis[0] - 18, pelvis[1] + 3];
  const kneeF = add(hipF, D(p.thighF), B.thigh);
  const ankleF = add(kneeF, D(p.shinF), B.shin);

  const lumbar = add(pelvis, D(p.torso), B.lumbar);
  const thorax = add(lumbar, D(p.thoraxA), B.thorax);
  const neck = add(thorax, D(p.neckA), B.neck);
  const head = add(neck, D(p.neckA), 28);

  if (!sh) sh = add(thorax, D(p.thoraxA + 118), 14);
  const shF: Vec = [sh[0] - 16, sh[1] + 5];
  let elbowF: Vec;
  let handF: Vec;
  if (ex.mode === 'hang') {
    const a2 = ik(shF, [hand![0] - 13, hand![1] + 3], B.upper, B.fore, ex.bend);
    elbowF = a2.elbow;
    handF = a2.hand;
  } else if (ex.arm === 'ik' || ex.arm === 'floor') {
    const T: Vec = ex.arm === 'floor' ? [sh[0] + p.hx, GROUND - 12] : [sh[0] + p.hx, sh[1] + p.hy];
    const a1 = ik(sh, T, B.upper, B.fore, ex.bend);
    const a2 = ik(shF, [T[0] - 11, T[1] + 4], B.upper, B.fore, ex.bend);
    elbow = a1.elbow;
    hand = a1.hand;
    elbowF = a2.elbow;
    handF = a2.hand;
  } else {
    elbow = add(sh, D(p.upperA), B.upper);
    hand = add(elbow, D(p.foreA), B.fore);
    elbowF = add(shF, D(p.upperF), B.upper);
    handF = add(elbowF, D(p.foreF), B.fore);
  }

  const bar: Vec | null =
    ex.bar === 'back'
      ? // Sırttaki bar TRAPEZ hizasında, ensenin arkasında durur — ve el onu
        // tutabilmeli. Eski konum gövdeden aşağı-geriye 18px idi: bar omuza
        // 21px düşüyor ve el oraya ancak 165° dirsekle uzanıyordu. İnsan
        // dirseği o kadar katlanmadığı için el barı hiç tutamıyor, hareket
        // "eller arkada tutuluyor" gibi okunuyordu.
        //
        // Çapa artık BOYUN: bar ensenin 14px arkasında. Omuz-bar 40-43px,
        // gereken dirsek 146-149°, sınırın altında. Yön gövdeyle döndüğü için
        // figür öne eğilirken bar trapezde kalıyor.
        add(neck, D(p.thoraxA + 270), 14)
      : ex.bar === 'hands'
        ? [hand![0], hand![1]]
        : // Kalçadaki bar yükün nerede olduğunu söyler ve kalçayla birlikte
          // yükselir — hip thrust'ın bütün hikâyesi bu.
          ex.bar === 'hips'
          ? add(pelvis, D(p.torso + 180), 26)
          : null;

  const S: Skeleton = {
    pelvis, knee, ankle, hipF, kneeF, ankleF, lumbar, thorax, neck, head,
    sh, elbow: elbow!, hand: hand!, shF, elbowF, handF, bar,
  };

  return S;
}

export interface FrontSide {
  hip: Vec;
  knee: Vec;
  ankle: Vec;
  sh: Vec;
  elbow: Vec;
  hand: Vec;
}

export interface FrontPoints {
  cx: number;
  L: FrontSide;
  R: FrontSide;
  pelvis: Vec;
  lumbar: Vec;
  thorax: Vec;
  neck: Vec;
  head: Vec;
  barY: number | null;
}

export const FX = 210;

/**
 * Önden görünümde dirseğin yeri.
 *
 * Normalde omuz-el doğrusunun %45'i. Ama eller gövdeye yakınken (bant
 * açmanın başı, dış rotasyon) omuz ile el neredeyse üst üste geliyor ve
 * dirsek omzun içine gömülüyordu: üst kol 8 piksele iniyor, kol yok gibi
 * görünüyordu. Kollar öne uzandığında önden bakış onları kısaltır, ama
 * tamamen yutmamalı — bu durumda dirsek dışa ve aşağı açılıyor.
 */
function frontElbow(sh: Vec, hand: Vec, sgn: number): Vec {
  const dx = hand[0] - sh[0];
  const dy = hand[1] - sh[1];
  const d = Math.hypot(dx, dy);
  if (d < 70) return [sh[0] + sgn * 24, sh[1] + 32];
  return [sh[0] + dx * 0.45, sh[1] + dy * 0.45];
}

/**
 * Önden görünüm, çözülmüş YAN iskeletin dikey seviyelerini okur; burada
 * yalnızca yanal açıklık yazılır. Böylece çömelme derinliği iki görünümde
 * birebir aynı kalıyor ve önden bakışta bir bacak önde bir bacak geride
 * olmuyor.
 *
 * Elin merkeze uzaklığı `hxF` ile kareden geliyor: yan kaldırış, bant açma,
 * dış rotasyon gibi yanal düzlemde çalışan hareketlerin bütün hikâyesi bu.
 */
export function frontPoints(ex: RigExercise, p: RigPose, S: Skeleton): FrontPoints {
  const kneeFlex = Math.abs(p.shinA - p.thighA);
  const ab = 4 + kneeFlex * 0.16;
  const shDx = 44;
  const hipDx = 23;
  const footDx = 31;
  const shY = S.thorax[1] + 6 - p.shLift;
  const mk = (sgn: number): FrontSide => {
    const shX = FX + sgn * shDx;
    const handX = FX + sgn * p.hxF;
    return {
      hip: [FX + sgn * hipDx, S.pelvis[1]],
      knee: [FX + sgn * (footDx + ab), S.knee[1]],
      ankle: [FX + sgn * footDx, S.ankle[1]],
      sh: [shX, shY],
      // Kol omuzdan SARKAR: omuz yükselince dirsek ve el de aynı kadar
      // yükselir. Omuz silkmede omuz kalkıp kol yerinde kalınca üst kol
      // uzuyor, kol omuzdan çıkmış gibi görünüyordu.
      elbow: frontElbow([shX, shY], [handX, S.hand[1] - p.shLift], sgn),
      hand: [handX, S.hand[1] - p.shLift],
    };
  };
  const F: FrontPoints = {
    cx: FX,
    L: mk(-1),
    R: mk(1),
    pelvis: [FX, S.pelvis[1]],
    lumbar: [FX, S.lumbar[1]],
    thorax: [FX, S.thorax[1]],
    neck: [FX, S.neck[1]],
    head: [FX, S.head[1]],
    barY: null,
  };
  F.barY = ex.bar === 'back' ? S.thorax[1] + 4 : ex.bar === 'hands' ? F.R.hand[1] : null;
  return F;
}

/**
 * Uzak bacağın yakınından ayrı sayılması için gereken en küçük fark.
 *
 * Yazılmadığında uzak bacak yakınının 7°/5° kaydırılmışı olarak türetiliyor;
 * eşik bunun üstünde ki o kozmetik kayma "ayrı hareket" sayılmasın. Yan
 * plank'ta bacaklar bilerek üst üste yazılı (aynı açı) — o da ayrı hareket
 * değil, gizlenmeli.
 */
const FAR_LEG_EPSILON = 12;

/**
 * Uzak bacağın kendi hareketi var mı?
 *
 * Kural basit: ikinci bacak, birincinin birkaç derece kaydırılmış kopyasından
 * ibaretse çizimde bilgi taşımıyor, yalnızca gürültü ekliyor — squat,
 * deadlift, press. Hamle, step-up, Bulgar split squat ve bird-dog'da ise
 * hareketin kendisi orada, o yüzden görünmeli.
 *
 * Karar veriden türetiliyor, elle işaretlenmiyor: kareler değişince cevap da
 * kendiliğinden değişir, unutulmuş bir bayrak yüzünden bacak kaybolmaz.
 */
export function farLegDistinct(ex: RigExercise, samples = 21): boolean {
  for (let i = 0; i < samples; i++) {
    const { p } = poseAt(ex, i / (samples - 1));
    if (Math.abs(p.thighF - p.thighA) > FAR_LEG_EPSILON) return true;
    if (Math.abs(p.shinF - p.shinA) > FAR_LEG_EPSILON) return true;
  }
  return false;
}

/** Uzak bacak çizilecek mi: elle yazılan değer varsa o, yoksa kural. */
export const showFarLeg = (ex: RigExercise): boolean =>
  ex.hideFarLeg === undefined ? farLegDistinct(ex) : !ex.hideFarLeg;

/**
 * Önden görünümde gövde elipsi.
 *
 * Yarıçap bel ile göğüs arasındaki MESAFEDEN çıkar; işaretli farktan değil.
 * Ayakta duran figürde göğüs belin üstünde olduğu için fark negatif geliyordu
 * ve SVG negatif yarıçaplı elipsi hiç çizmiyordu — önden bakışta gövde
 * boştu.
 */
export function frontTrunk(F: FrontPoints): { cy: number; rx: number; ry: number } {
  return {
    cy: (F.lumbar[1] + F.thorax[1]) / 2,
    rx: 45,
    ry: Math.abs(F.thorax[1] - F.lumbar[1]) / 2 + 10,
  };
}

/**
 * Tüm tekrar boyunca figürün kapladığı alan.
 *
 * Kare başına yeniden hesaplanan bir viewBox figürü hareket boyunca
 * zıplatır; bu yüzden 25 örnek karenin birleşimi alınıp hareket süresince
 * SABİT tutuluyor.
 */
export function boundsFor(ex: RigExercise, view: 'side' | 'front'): string {
  let x0 = 1e9;
  let y0 = 1e9;
  let x1 = -1e9;
  let y1 = -1e9;
  const eat = (q: Vec | null, r: number) => {
    if (!q) return;
    x0 = Math.min(x0, q[0] - r);
    x1 = Math.max(x1, q[0] + r);
    y0 = Math.min(y0, q[1] - r);
    y1 = Math.max(y1, q[1] + r);
  };
  for (let i = 0; i <= 24; i++) {
    const { p } = poseAt(ex, i / 24);
    const S = skeleton(ex, p);
    if (view === 'front') {
      const F = frontPoints(ex, p, S);
      [F.pelvis, F.lumbar, F.thorax, F.neck].forEach((q) => eat(q, 46));
      eat(F.head, 34);
      [F.L, F.R].forEach((side) => (Object.keys(side) as (keyof FrontSide)[]).forEach((k) => eat(side[k], 24)));
      if (F.barY !== null) {
        eat([FX - 152, F.barY], 26);
        eat([FX + 152, F.barY], 26);
      }
    } else {
      (Object.keys(S) as (keyof Skeleton)[]).forEach((k) => eat(S[k], k === 'bar' ? 54 : k === 'head' ? 34 : 24));
      if (ex.mode === 'bench') x1 = Math.max(x1, S.pelvis[0] + 270);
      if (ex.mode === 'hang') eat([CENTER_X, BAR_Y], 30);
    }
  }
  y1 = Math.max(y1, GROUND + 20);
  x0 -= 14;
  x1 += 14;
  y0 -= 14;
  return `${x0.toFixed(1)} ${y0.toFixed(1)} ${(x1 - x0).toFixed(1)} ${(y1 - y0).toFixed(1)}`;
}

/**
 * Önden görünümde gövde silueti: kalçadan omuza TEK parça.
 *
 * Eskiden gövde çıplak bir elipsti ve omuz topu ayrı çiziliyordu. Ölçüldü:
 * `shrug_front`'ta omuz silkerken omuz topu elipsin tepesinin tamamen dışına
 * çıkıyor (elipsin o yükseklikteki yarı genişliği 0) ve 27px boşluk kalıyordu
 * — omuzlar gövdeden kopuk duruyordu.
 *
 * Anatomik olarak eksik olan şey omuz kuşağıydı: gerçek bir önden görünümde
 * trapez boyundan omuza doğru eğimle iner, yani omuz gövdeden kopamaz. Bu yol
 * o eğimi çiziyor — boyun kökünden omuza, omuzdan bele, belden kalçaya.
 *
 * Omuz yükselmesi (`shLift`) siluetin İÇİNDE kalıyor: omuz kalkınca yamuk da
 * onunla birlikte yükseliyor.
 */
export function frontTorsoPath(F: FrontPoints): string {
  const cx = F.cx;
  const neckW = 20;
  const shL = F.L.sh;
  const shR = F.R.sh;
  const waistY = (F.lumbar[1] + F.thorax[1]) / 2 + (F.pelvis[1] - F.thorax[1]) * 0.42;
  const waistW = 38;
  const hipY = F.pelvis[1] + 10;
  const hipW = 44;
  const neckY = F.neck[1] + 6;
  // Yamuk eğimi: boyun kökünden omuza doğru dışa ve aşağı.
  return (
    `M ${cx - neckW} ${neckY} ` +
    `C ${cx - neckW - 8} ${neckY + 6} ${shL[0] + 12} ${shL[1] - 12} ${shL[0]} ${shL[1]} ` +
    `C ${shL[0] - 6} ${shL[1] + 14} ${cx - waistW - 6} ${waistY - 30} ${cx - waistW} ${waistY} ` +
    `C ${cx - waistW - 2} ${waistY + 18} ${cx - hipW} ${hipY - 22} ${cx - hipW} ${hipY} ` +
    `L ${cx + hipW} ${hipY} ` +
    `C ${cx + hipW} ${hipY - 22} ${cx + waistW + 2} ${waistY + 18} ${cx + waistW} ${waistY} ` +
    `C ${cx + waistW + 6} ${waistY - 30} ${shR[0] + 6} ${shR[1] + 14} ${shR[0]} ${shR[1]} ` +
    `C ${shR[0] - 12} ${shR[1] - 12} ${cx + neckW + 8} ${neckY + 6} ${cx + neckW} ${neckY} Z`
  );
}

/**
 * Yandan görünümde omzu göğüs kafesine bağlayan deltoid kaması.
 *
 * Omuz topu tek başına çizilince gövdeye teğet geçen bir daire gibi duruyordu.
 * Gerçekte deltoid göğüs kafesinin üstüne oturur ve silueti sürekli kılar.
 */
export function shoulderWedge(thorax: Vec, sh: Vec, w = 20): string {
  const dx = sh[0] - thorax[0];
  const dy = sh[1] - thorax[1];
  const l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l;
  const ny = dx / l;
  return (
    `M ${thorax[0] + nx * w} ${thorax[1] + ny * w} ` +
    `L ${sh[0] + nx * w * 0.75} ${sh[1] + ny * w * 0.75} ` +
    `A ${w * 0.75} ${w * 0.75} 0 0 0 ${sh[0] - nx * w * 0.75} ${sh[1] - ny * w * 0.75} ` +
    `L ${thorax[0] - nx * w} ${thorax[1] - ny * w} Z`
  );
}

/**
 * Yandan baş profili.
 *
 * Yerel uzay: merkez `(0,0)`, **+X yüzün baktığı yön**. Çizim `neckA` ile
 * döndürülüyor, yani baş boyunla birlikte eğiliyor.
 *
 * Düz bir daire yerine profil, çünkü baş figürün en tanınır parçası: alın,
 * burun, çene ve ense çizgisi olmadan figür manken gibi okunuyordu. Yüz
 * ayrıntısı YOK — göz, kulak, ağız çizilmiyor. Spor hareketi simülasyonunda
 * bunlar bilgi taşımıyor ve küçük ölçekte gürültüye dönüşüyor.
 */
export function headProfile(): string {
  return (
    'M 0 -30 ' +
    'C 11 -30 20 -22 22 -10 ' + // alın
    'C 23 -5 21 -2 19 0 ' + // kaş
    'C 22 3 23 7 20 9 ' + // burun
    'C 17 10 16 11 16 14 ' + // burun altı
    'C 18 16 18 20 15 23 ' + // dudak → çene
    'C 11 27 5 29 0 29 ' + // çene ucu
    'C -9 29 -18 22 -22 11 ' + // çene hattı → ense
    'C -25 0 -24 -16 -14 -24 ' + // ense → kafatası
    'C -9 -28 -5 -30 0 -30 Z'
  );
}

/**
 * El. Yerel uzay: bilek `(0,0)`, el `(0,18)` yönünde uzanır.
 *
 * Parmak yok — spor hareketinde parmak ayrıntısı bilgi taşımıyor (README'nin
 * kapsam kararı). Ama daire yerine eldiven biçimi, elin hangi yöne baktığını
 * gösteriyor ve bu bar tutuşunda okunuyor.
 */
export function handPath(): string {
  return 'M -7 -1 C -10 5 -9 13 -5 17 C -1 20 4 20 7 16 C 10 11 10 3 8 -1 C 4 -4 -3 -4 -7 -1 Z';
}

/**
 * Bir uzuv parçasını kemiğine oturtan SVG dönüşümü.
 *
 * Parçalar YEREL uzayda çiziliyor: kemik (0,0)'dan (0,len)'e uzanır, +X
 * figürün baktığı yön. Bu dönüşüm parçayı kemiğin dünya konumuna ve yönüne
 * taşıyor. Kemik boyları sabit olduğu için (`B`) ölçekleme yok — her parça
 * kendi kemiğinin boyunda çiziliyor.
 *
 * Neden yerel uzay: parçaların NEREDEN geldiği bu sözleşmeyi değiştirmiyor.
 * Bugünkü kaba taslak da, bir 3B modelden seçilen açıyla render edilip
 * uzuvlara bölünmüş gerçek anatomik siluet de aynı yere oturuyor; kod aynı
 * kalıyor, yalnızca `data/bodyParts.json` değişiyor.
 */
export function partTransform(a: Vec, b: Vec): string {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  // Yerel +Y'yi kemik yönüne çeviren açı.
  const deg = (Math.atan2(-dx / l, dy / l) * 180) / Math.PI;
  return `translate(${a[0]} ${a[1]}) rotate(${deg})`;
}

/**
 * İki uçtaki kalınlığı farklı olabilen kapsül gövde.
 *
 * Uzuvlar tek kalınlıkta çubuk değil: kas kütlesi uyluğun ve baldırın üst
 * üçte birinde, pazunun ortasında toplanır. Çizim bu yüzden her uzvu iki
 * kapsülden kuruyor.
 */
export function capsule(a: Vec, b: Vec, wa: number, wb: number): string {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  const nx = -uy;
  const ny = ux;
  const ra = wa / 2;
  const rb = wb / 2;
  return (
    `M ${a[0] + nx * ra} ${a[1] + ny * ra} L ${b[0] + nx * rb} ${b[1] + ny * rb} ` +
    `A ${rb} ${rb} 0 0 0 ${b[0] - nx * rb} ${b[1] - ny * rb} L ${a[0] - nx * ra} ${a[1] - ny * ra} ` +
    `A ${ra} ${ra} 0 0 0 ${a[0] + nx * ra} ${a[1] + ny * ra} Z`
  );
}

/**
 * Ayak ölçüleri, ayak bileği orijin alınarak.
 *
 * Ayak bileği ayağın arkadan yaklaşık dörtte birinde durur; topuk arkada,
 * parmak ucu önde. Bu sayılar `footPath`'in ve `MAX_ANKLE_LIFT`'in ortak
 * kaynağı — ikisi ayrı yazılsaydı denetim, çizimin yapamayacağı bir kalkışa
 * izin verirdi. Nitekim veriyordu.
 */
export const FOOT = { heel: -12, toe: 34, sole: 13 } as const;

/**
 * Topuğun kalkabileceği en yüksek nokta.
 *
 * Topuk kalkarken ayak parmak ucu etrafında döner, yani parmak yerde kalır.
 * Ayak bileği ancak parmak ucuna olan mesafesi kadar yükselebilir; ötesinde
 * parmak yerden kopar ve figür havada yürür.
 *
 * Ölçüldü: `calf_raise` 38px kaldırıyordu ama sınır 23px. Aradaki fark
 * çizimde ayağı dörtgen gibi deforme ediyordu, çünkü `pinToe` parmağı zorla
 * yerde tutmaya çalışıyordu. Eski denetim sınırı ayak BOYUYDU (46) — çizimin
 * yapabildiğinden iki kat gevşek.
 */
export const MAX_ANKLE_LIFT = Math.round(Math.hypot(FOOT.toe, FOOT.sole) - FOOT.sole);

/**
 * Ayak profili.
 *
 * Topuk yuvarlak ve arkada, taban ortada hafif kavisli (ayak tabanı düz
 * değil), parmak ucu öne incelir. Eskiden dört köşeli bir dörtgendi ve eğim
 * değişince hangi ucun parmak olduğu okunmuyordu.
 *
 * `pinToe`: topuk kalkarken ayak PARMAK UCU ETRAFINDA döner — topuk
 * kalkışının tanımı bu. Dönüş açısı ayak bileğinin yerden yüksekliğinden
 * çıkıyor, yani şekil deforme olmuyor, katı kalıp dönüyor.
 */
/**
 * Ayağın yerel çerçevesi: `(u, v)` → dünya noktası.
 *
 * `+u` parmak yönü, `+v` taban tarafı. `flip = -1` yerel x eksenini aynalıyor
 * (bkz. `facingFlip`): parmak yönü aynı kalır, taban karşı tarafa geçer.
 * Topuk kalkış dönüşü de işaret değiştirir, çünkü aynalanan çerçevede parmak
 * ucu etrafındaki dönüş ters yöne gider.
 *
 * `footPath` ile `footLowestY` bu çerçeveyi PAYLAŞIYOR: ayrı yazılsalardı
 * denetim, çizimin bastığı yerden başka bir yeri ölçerdi.
 */
/**
 * Parmak yerde kalsın diye gereken ek dönüş (radyan).
 *
 * `footFrame` ile `footDirFromToe` aynı sayıyı kullanmak zorunda: biri ayağı
 * çiziyor, öteki çizilen parmak ucundan yönü GERİ çözüyor. İki yerde ayrı
 * hesaplanırsa tutamak ayağın altından kayar.
 */
function footExtra(ankle: Vec, pinToe: boolean): number {
  if (!pinToe) return 0;
  const r = Math.hypot(FOOT.toe, FOOT.sole);
  return Math.asin(Math.min(r, GROUND - ankle[1]) / r) - Math.atan2(FOOT.sole, FOOT.toe);
}

function footFrame(ankle: Vec, dir: number, pinToe: boolean, flip: number): (u: number, v: number) => Vec {
  const a = rad(dir) + footExtra(ankle, pinToe) * flip;
  const ux = Math.sin(a);
  const uy = -Math.cos(a);
  const vx = -uy * flip;
  const vy = ux * flip;
  return (u, v) => [ankle[0] + ux * u + vx * v, ankle[1] + uy * u + vy * v];
}

/**
 * Ayak TABANININ iki ucu — topuk ve parmak, taban düzleminde.
 *
 * Ayağın oturduğu yüzeyi çizen kod bunu bilmek zorunda: bacak presi levhası
 * tabana düz basmalı. Ayak bileğinden sabit bir mesafe ölçmek yetmiyor —
 * ayak `FOOT.toe` kadar uzanıyor ve levha parmak ucunun içinden geçiyordu.
 *
 * Geometri MOTORDA, çizicide değil: aynı hesabı iki ayrı çizim katmanına
 * yazmak, `capsule` ve `footPath` için zaten reddedilmiş bir desen.
 */
export function solePoints(ankle: Vec, dir: number, pinToe = false, flip = 1): [Vec, Vec] {
  const P = footFrame(ankle, dir, pinToe, flip);
  return [P(FOOT.heel, FOOT.sole), P(FOOT.toe, FOOT.sole)];
}

/**
 * Parmak ucu `target`'a çekildiğinde hareketin `footDir` değeri ne olmalı?
 *
 * `solePoints(...)[1]`'in tersi. Ayak ucu tutamağı bunu kullanıyor: ayak
 * bileği açısı modelde yok (TODOS.md), yani ayağın yönü kare başına değil
 * HAREKET başına bir sayı — tutamak `footDir`'i yazar, pozu değil.
 */
export function footDirFromToe(ankle: Vec, target: Vec, pinToe = false, flip = 1): number {
  // Parmak ucu, u ekseninden `atan2(sole, toe)` kadar sapmış duruyor; ayna ve
  // parmak sabitlemesi de aynı yöne ekleniyor.
  const off =
    (flip * (footExtra(ankle, pinToe) + Math.atan2(FOOT.sole, FOOT.toe)) * 180) / Math.PI;
  return ((angleOf(ankle, target) - off) % 360 + 360) % 360;
}

/**
 * Çizilen ayağın en alt noktası.
 *
 * Tabanı oluşturan eğrinin düğüm ve kontrol noktaları örnekleniyor — yani
 * denetim, ÇİZİLEN şeklin en alçak yerini ölçüyor, ayak bileğinin konumunu
 * değil. Aradaki fark önemli: eski dörtgen ayak kendini `min(GROUND, …)` ile
 * zemine kırpıyordu, o yüzden veri yanlış olsa bile çizim doğru görünüyordu.
 * Yeni ayak katı bir şekil; kırpma yok, hata görünür.
 */
export function footLowestY(ankle: Vec, dir: number, pinToe = false, flip = 1): number {
  const P = footFrame(ankle, dir, pinToe, flip);
  const { heel, toe, sole } = FOOT;
  const sample: [number, number][] = [
    [heel + 1, sole - 1], [heel + 6, sole + 1], [2, sole - 3], [10, sole - 2],
    [18, sole], [26, sole], [toe - 2, sole - 1], [toe + 2, sole - 5],
  ];
  return Math.max(...sample.map(([u, v]) => P(u, v)[1]));
}


export function footPath(ankle: Vec, dir: number, pinToe = false, flip = 1): string {
  const P = footFrame(ankle, dir, pinToe, flip);
  const pt = (u: number, v: number) => { const q = P(u, v); return `${q[0].toFixed(1)} ${q[1].toFixed(1)}`; };
  const { heel, toe, sole } = FOOT;
  return (
    `M ${pt(heel + 2, -9)} ` +
    `C ${pt(heel - 3, -4)} ${pt(heel - 4, 6)} ${pt(heel + 1, sole - 1)} ` + // topuk arkası, yuvarlak
    `C ${pt(heel + 6, sole + 1)} ${pt(2, sole - 3)} ${pt(10, sole - 2)} ` + // taban kavisi
    `C ${pt(18, sole)} ${pt(26, sole)} ${pt(toe - 2, sole - 1)} ` + // topuk-parmak arası taban
    `C ${pt(toe + 2, sole - 5)} ${pt(toe + 1, 3)} ${pt(toe - 7, 1)} ` + // parmak ucu

    `C ${pt(18, -2)} ${pt(6, -6)} ${pt(heel + 2, -9)} Z`
  );
}

/**
 * Gövde aynalanmış mı?
 *
 * Yan görünümde figür +x'e bakar. Sırt üstü kiplerde (`bench`, `supine`) baş
 * SAĞDA, gövdenin önü YUKARI bakar — yani figür ekseni etrafında dönmüş
 * değil, AYNALANMIŞTIR. Tek bir kemik açısı bunu anlatamıyor: `quad`
 * (yüzükoyun plank, neckA≈78) ile `bench` (sırt üstü, neckA≈96) neredeyse
 * aynı açıyı taşıyor, ama biri yere bakar diğeri tavana; biri tabanını yukarı
 * çevirir diğeri yere basar. Rotasyon bu iki durumu ayıramaz, ayna ayırır.
 *
 * Ölçüldü: aynasız hâlde `bench_press` yüzü AŞAĞI bakıyordu (sırt üstü yatan
 * biri için imkânsız) ve ayak tabanı YUKARI dönüktü.
 *
 * Dönen değer profil çizimlerinin yerel x eksenine uygulanacak ölçek:
 * `scale(flip, 1)`. Kemik açıları etkilenmez — onlar zaten dünya uzayında.
 */
export const facingFlip = (mode: RigMode): number => (mode === 'bench' || mode === 'supine' ? -1 : 1);

export const footDirFor = (mode: RigMode): number => (mode === 'bench' || mode === 'supine' ? 268 : mode === 'quad' ? 250 : 92);

/**
 * Bu hareketin ayak yönü.
 *
 * Varsayılan MODA bağlı: ayakta duran figürün ayağı öne-aşağı bakar. Makine
 * hareketlerinde bu yetmiyor — bacak presinde taban platforma basar, yani
 * ayak makinenin açısında durur, ayakta durur gibi değil.
 *
 * `footDir` bunun harekete özel geçersiz kılması. Modele ayak bileği AÇISI
 * eklemiyor: o kare başına değişen bir şey ve `RigPose`'u büyütür
 * (TODOS.md'de kayıtlı). Bu yalnızca hareket boyunca sabit bir yön —
 * makinenin eğimi tekrar boyunca değişmiyor.
 */
export const footDirOf = (ex: Pick<RigExercise, 'mode' | 'footDir'>): number =>
  ex.footDir ?? footDirFor(ex.mode);
