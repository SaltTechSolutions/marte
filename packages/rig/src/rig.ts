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
  /** Boyun kökünden kafa merkezine; kafa parçasının kemiği. */
  head: 28,
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
 * YAN GÖRÜNÜM SAF ORTOGRAFİK — perspektif yok, uzak taraf kaydırılmaz.
 *
 * Uzak kalça yakın kalçanın, uzak omuz yakın omuzun TAM arkasında (aynı
 * ekran noktası). Eskiden uzak taraf (−18, +3) ve (−16, +5) kaydırılıyordu;
 * tek amacı özdeş iki uzvu ayırt ettirmekti ve yan etkisi uzak ayağın zemine
 * gömülmesiydi. Özdeş uzuvlar artık çizilmiyor (`showFarLeg`/`showFarArm`),
 * farklı hareket yapan uzak uzuv ise kendi açısıyla zaten x'te ayrı düşüyor
 * — hamlede geride, carry'de öbür adımda. Çakışan kısmı yakının arkasında
 * kalır; gerçek bir yan görünüm de böyle görünür. Uzak ayak yakınla aynı
 * zemine basar, ayrı zemin çizgisi yok.
 */

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
  /**
   * Kolun DÜZLEMİ: kol hangi dikey düzlemde kalkıyor. 0 = sagital (öne/arkaya),
   * 90 = frontal (yana), eksi = gövdenin önünden orta hattı geçer. Yükselme
   * miktarını `upperA` verir, bu yalnızca düzlemi döndürür — yani yan
   * görünümdeki kol açısı ile önden görünüm TEK pozdan çıkar: önden bakışta
   * el = omuz + kol · (sin·sin az, −cos), yana açılan kol öne bakışta
   * kısalır (bant açmada olduğu gibi). Eskiden `hxF` (piksel) vardı; kol
   * boyunu bilmediği için uzayıp kısalıyordu (ölçüldü: bant açmada el omuzdan
   * 98px ötede, üst kol 78).
   */
  armAz: number;
  armAzF: number;
  /** Ön kolun düzlemi; dış rotasyonda dirsek sabitken ön kol yana döner. */
  foreAz: number;
  foreAzF: number;
  /** Önden görünümde omuz yükselmesi (shrug). */
  shLift: number;
  /**
   * Parmak eklemi (ayak topu, MTP): parmakların arka ayağa göre açısı, + yukarı
   * (ekstansiyon). Yerdeki ayakta parmaklar zaten yere yatar (`footPinned`),
   * bu alan HAVADAKİ ayağın parmak duruşunu verir — itiş sonrası, uzatılmış
   * ayak. Bilek açısı (`ankle`) ayağı, bu parmakları çevirir.
   */
  toe: number;
  toeF: number;
  /** Topuğun yerden kalkması (calf raise) ya da ayağın basamağa çıkması (step-up). */
  ankleLift: number;
  /**
   * Ayak bileği eklem açısı, derece. 0 = anatomik nötr (ayak baldıra dik).
   * Pozitif = PLANTAR fleksiyon (parmak aşağı, topuk yukarı), negatif =
   * DORSİ fleksiyon (parmak yukarı, kaval kemiğine doğru).
   *
   * Açı BALDIRA GÖRE, dünyaya göre değil: baldır dönünce ayak onunla döner.
   * Eskiden ayak yönü `footDirFor(mode)` sabitiydi ve baldırı hiç takip
   * etmiyordu; ölçüldü, `carry`de uzak ayak bileği hareket boyunca 65°,
   * `unilateral_lunge`da 67° dönüyordu — basan bir ayağın yapamayacağı şey,
   * ve hiçbir kural görmüyordu çünkü model açıyı taşımıyordu.
   */
  ankle: number;
  ankleF: number;
}

export interface RigKeyframe {
  t: number;
  tr: string;
  p: Partial<RigPose>;
  /**
   * Uzak ayak bu karede YERE (ya da sehpaya) BASILI. Ardışık iki kare de
   * basılıysa aradaki her anda uzak bacak, ayağı karelerdeki yerinde tutacak
   * şekilde ters kinematikle çözülür; `thighF`/`shinF` yalnız ayağın yerini
   * tarif eder. Basılı ayak bir kısıttır, kare değil: açı interpolasyonu
   * ayağı yay çizdirir (ölçüldü: hamlede 20-48px havaya kalkıyor, Bulgar
   * squat'ta sehpada 90px kayıyordu) ve bunu ara kareyle avlamak bitmez.
   */
  plantF?: boolean;
}

export type RigMode = 'stand' | 'quad' | 'bench' | 'supine' | 'hang';
export type RigArm = 'angles' | 'ik' | 'floor';
export type RigBar = 'back' | 'hands' | 'hips' | null;
export type RigProp = 'bench' | 'box' | 'bar' | 'hipbench' | null;

/**
 * Elde taşınan yük. `bar` barın NEREDE olduğunu söyler (sırtta, elde,
 * kalçada); bu ise NE olduğunu: barbell tek uzun bir demir, dambıl iki ayrı
 * ağırlık. Dambıl hareketlerinde barbell tabağı çizmek yükü olduğundan çok
 * daha büyük gösteriyordu.
 */
/** Yük: halter, dambıl ya da lastik (direnç bandı — iki el arasında, kütlesi yok). */
export type RigLoad = 'barbell' | 'dumbbell' | 'band' | null;

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
  armAz: 0,
  armAzF: 0,
  foreAz: 0,
  foreAzF: 0,
  shLift: 0,
  toe: 0,
  toeF: 0,
  ankleLift: 0,
  ankle: 0,
  ankleF: 0,
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
    armAzF: p.armAzF ?? f.armAz,
    foreAzF: p.foreAzF ?? f.foreAz,
    toeF: p.toeF ?? f.toe,
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
  armAz: number;
  armAzF: number;
  foreAz: number;
  foreAzF: number;
  shLift: number;
  toe: number;
  toeF: number;
  ankleLift: number;
  // Bilek açısı ZATEN eklem-yerel (baldıra göre), o yüzden dünya→yerel
  // dönüşümünde olduğu gibi taşınıyor. Diğer açılar gibi çıkarma gerekmiyor.
  ankle: number;
  ankleF: number;
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
  armAz: p.armAz,
  armAzF: p.armAzF,
  foreAz: p.foreAz,
  foreAzF: p.foreAzF,
  shLift: p.shLift,
  toe: p.toe,
  toeF: p.toeF,
  ankleLift: p.ankleLift,
  ankle: p.ankle,
  ankleF: p.ankleF,
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
    armAz: l.armAz,
    armAzF: l.armAzF,
    foreAz: l.foreAz,
    foreAzF: l.foreAzF,
    shLift: l.shLift,
    toe: l.toe,
    toeF: l.toeF,
    ankleLift: l.ankleLift,
    ankle: l.ankle,
    ankleF: l.ankleF,
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
  let p = toWorld(l);
  if (a.plantF && b.plantF) p = plantFarFoot(ex, p, a, b, u);
  return { p, phase: u < 0.5 ? a : b };
}

/**
 * Uzak ayağı iki kare arasında yerinde tutar (bkz. `RigKeyframe.plantF`).
 *
 * Ayağın yeri YAKIN AYAK BİLEĞİNE göreli tutuluyor: kadraj kaydırması ve
 * zemine oturtma tüm iskeleti birlikte taşıdığı için göreli konum onlardan
 * bağımsız. Hedef, iki karenin kendi ayak konumları arasında interpolasyon —
 * ikisi aynıysa ayak kıpırdamaz.
 */
function plantFarFoot(ex: RigExercise, p: RigPose, a: RigKeyframe, b: RigKeyframe, u: number): RigPose {
  const relOf = (k: RigKeyframe): Vec => {
    const S = build(ex, fillPose(k.p));
    return [S.ankleF[0] - S.ankle[0], S.ankleF[1] - S.ankle[1]];
  };
  const ra = relOf(a);
  const rb = relOf(b);
  const S = build(ex, p);
  const target: Vec = [S.ankle[0] + ra[0] + (rb[0] - ra[0]) * u, S.ankle[1] + ra[1] + (rb[1] - ra[1]) * u];
  return { ...p, ...legIk(S.hipF, target) };
}

/**
 * Bacak için ters kinematik: kalçadan hedefe, diz ÖNE kırık. İki çözümden
 * dizi daha önde (+x) olanı seçiliyor; bacak geriye uzansa da diz arkaya
 * kırılmaz.
 */
export function legIk(hip: Vec, target: Vec): { thighF: number; shinF: number } {
  const L1 = B.thigh;
  const L2 = B.shin;
  let dx = target[0] - hip[0];
  let dy = target[1] - hip[1];
  // Kırpma payı çok küçük: `ik()` 3px pay bırakıyor ve bacak gerginken ayağı
  // 2-4px kaydırıyordu (ölçüldü, testte). Basılı ayak kıpırdamamalı.
  const d0 = Math.hypot(dx, dy) || 0.001;
  const d = Math.min(L1 + L2 - 0.25, Math.max(Math.abs(L1 - L2) + 0.25, d0));
  dx *= d / d0;
  dy *= d / d0;
  const T: Vec = [hip[0] + dx, hip[1] + dy];
  const a = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  const base = Math.atan2(dx, -dy);
  const knees = [base + a, base - a].map((th): Vec => [hip[0] + Math.sin(th) * L1, hip[1] - Math.cos(th) * L1]);
  const knee = knees[0][0] >= knees[1][0] ? knees[0] : knees[1];
  const norm = (deg: number) => ((deg % 360) + 360) % 360;
  return { thighF: norm(angleOf(hip, knee)), shinF: norm(angleOf(knee, T)) };
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
    // Bilek tabanın kalınlığı kadar yukarıda: taban tam yerde. (12 idi, taban 13 — 1px gömülüyordu.)
    ankle = [ANKLE_X, GROUND - FOOT.sole - p.ankleLift];
    knee = sub(ankle, D(p.shinA), B.shin);
    pelvis = sub(knee, D(p.thighA), B.thigh);
  } else {
    pelvis = ex.mode === 'quad' ? [150, GROUND - 119] : [150, 430];
    knee = add(pelvis, D(p.thighA), B.thigh);
    ankle = add(knee, D(p.shinA), B.shin);
  }

  const hipF: Vec = [pelvis[0], pelvis[1]];
  const kneeF = add(hipF, D(p.thighF), B.thigh);
  const ankleF = add(kneeF, D(p.shinF), B.shin);

  const lumbar = add(pelvis, D(p.torso), B.lumbar);
  const thorax = add(lumbar, D(p.thoraxA), B.thorax);
  const neck = add(thorax, D(p.neckA), B.neck);
  const head = add(neck, D(p.neckA), B.head);

  if (!sh) sh = add(thorax, D(p.thoraxA + 118), 14);
  const shF: Vec = [sh[0], sh[1]];
  let elbowF: Vec;
  let handF: Vec;
  if (ex.mode === 'hang') {
    const a2 = ik(shF, hand!, B.upper, B.fore, ex.bend);
    elbowF = a2.elbow;
    handF = a2.hand;
  } else if (ex.arm === 'ik' || ex.arm === 'floor') {
    const T: Vec = ex.arm === 'floor' ? [sh[0] + p.hx, GROUND - 12] : [sh[0] + p.hx, sh[1] + p.hy];
    const a1 = ik(sh, T, B.upper, B.fore, ex.bend);
    const a2 = ik(shF, T, B.upper, B.fore, ex.bend);
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
          //
          // İki kaydırma var ve ikisi de gerekli:
          //
          // 1. Gövde ekseni boyunca 14px AŞAĞI (`torso + 180`): bar kalça
          //    çizgisinde, karın değil kalça kıvrımı hizasında durur.
          // 2. Eksene DİK 22px, KARIN tarafına (`torso + 90`): bar vücudun
          //    üstünde durur, içinden geçmez. Eskiden yalnız birinci kaydırma
          //    vardı ve bar leğenle AYNI yükseklikte kalıyordu (ölçüldü,
          //    hip_thrust: dy = +2..11px, yani kalçanın ortasından geçiyordu).
          //
          // Karın yönü gövde açısından türetiliyor, sabit değil: ayakta duran
          // figürde `torso ≈ 0` ve `D(90)` figürün baktığı yön; hip
          // thrust'ta `torso ≈ 283` ve aynı formül YUKARIYI veriyor, çünkü
          // figür sırt üstü. Sabit bir yön yazsaydık iki duruştan biri
          // yanlış olurdu.
          ex.bar === 'hips'
          ? add(add(pelvis, D(p.torso + 180), 14), D(p.torso + 90), 22)
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
/**
 * Kolun 3B yönü: sagital açı (yan görünümdeki, `D` ile aynı eksen) + düzlem
 * azimutu. Önden bakışta yalnız (x yanal, y dikey) bileşenleri çizilir; z
 * (öne) bileşeni kısalma olarak görünür.
 */
const armDir3 = (sag: number, az: number): { x: number; y: number } => {
  const f = Math.sin(rad(sag));
  return { x: f * Math.sin(rad(az)), y: -Math.cos(rad(sag)) };
};

/**
 * Önden görünüm, çözülmüş YAN iskeletin dikey seviyelerini okur (gövde,
 * bacak); kollar ise 3B yönden izdüşürülür. Böylece çömelme derinliği iki
 * görünümde birebir aynı kalıyor, kol boyu her karede doğru, yana açılan kol
 * gerçekten kol boyu kadar açılıyor.
 *
 * Taraflar: `L` ekranın solu = figürün SAĞI = yakın taraf (A); `R` ekranın
 * sağı = figürün solu = uzak taraf (F). Mesh'ten üretilen ön parçalar figürün
 * sol uzuvları, o yüzden `R` aynalanmadan, `L` aynalanarak çizilir.
 */
export function frontPoints(ex: RigExercise, p: RigPose, S: Skeleton): FrontPoints {
  const kneeFlex = Math.abs(p.shinA - p.thighA);
  const ab = 4 + kneeFlex * 0.16;
  const shDx = 44;
  const hipDx = 23;
  const footDx = 31;
  const shY = S.thorax[1] + 6 - p.shLift;
  const mk = (sgn: number, far: boolean): FrontSide => {
    const shX = FX + sgn * shDx;
    const sh: Vec = [shX, shY];
    // Sagital açılar İSKELETTEN: `ik`/`floor` kiplerinde de doğru (çözülmüş kol).
    const upperSag = angleOf(far ? S.shF : S.sh, far ? S.elbowF : S.elbow);
    const foreSag = angleOf(far ? S.elbowF : S.elbow, far ? S.handF : S.hand);
    const u = armDir3(upperSag, far ? p.armAzF : p.armAz);
    const f = armDir3(foreSag, far ? p.foreAzF : p.foreAz);
    const elbow: Vec = [sh[0] + sgn * u.x * B.upper, sh[1] + u.y * B.upper];
    const hand: Vec = [elbow[0] + sgn * f.x * B.fore, elbow[1] + f.y * B.fore];
    return {
      hip: [FX + sgn * hipDx, S.pelvis[1]],
      knee: [FX + sgn * (footDx + ab), S.knee[1]],
      ankle: [FX + sgn * footDx, S.ankle[1]],
      sh,
      elbow,
      hand,
    };
  };
  const F: FrontPoints = {
    cx: FX,
    L: mk(-1, false),
    R: mk(1, true),
    pelvis: [FX, S.pelvis[1]],
    lumbar: [FX, S.lumbar[1]],
    thorax: [FX, S.thorax[1]],
    neck: [FX, S.neck[1]],
    head: [FX, S.head[1]],
    barY: null,
  };
  // Bar yüksekliği İSKELETTEN okunuyor, ayrıca hesaplanmıyor. Eskiden
  // `bar: 'back'` için `thorax + 4` yazılıydı; sırt barı sonradan göğüsten
  // BOYUNA taşındı (el barı tutabilsin diye) ama burası güncellenmedi ve iki
  // görünüm ayrıştı. Ölçüldü, squat: yan görünümde bar 179.2, önden 207.4 —
  // 28px fark, yani önden bakışta eller barın 28px üstünde duruyordu.
  //
  // `bar: 'hips'` de artık çiziliyor; eskiden `null` dönüyordu ve hip
  // thrust önden bakışta haltersiz görünüyordu.
  F.barY = S.bar ? S.bar[1] : null;
  return F;
}

/** Yük: yazılmadıysa bar varsa halter, yoksa yok. */
export const loadOf = (ex: RigExercise): RigLoad => ex.load ?? (ex.bar ? 'barbell' : null);

/**
 * Parça kütle oranları (Dempster, vücut ağırlığının payı) ve kütle merkezinin
 * parça üstündeki yeri (başlangıçtan oran). Her iki taraf ayrı sayılıyor;
 * uzak taraf çizilmese de kütlesi var.
 */
const MASS: [keyof Skeleton, keyof Skeleton, number, number][] = [
  ['neck', 'head', 0.081, 0.6],
  ['pelvis', 'thorax', 0.497, 0.5],
  ['sh', 'elbow', 0.028, 0.44], ['elbow', 'hand', 0.022, 0.55],
  ['shF', 'elbowF', 0.028, 0.44], ['elbowF', 'handF', 0.022, 0.55],
  ['pelvis', 'knee', 0.1, 0.43], ['knee', 'ankle', 0.0465, 0.43], ['ankle', 'ankle', 0.0145, 0.5],
  ['hipF', 'kneeF', 0.1, 0.43], ['kneeF', 'ankleF', 0.0465, 0.43], ['ankleF', 'ankleF', 0.0145, 0.5],
];
/** Yükün vücut ağırlığına oranı: halter ~25 kg / 70 kg, dambıl ~7 kg. */
const LOAD_MASS: Record<'barbell' | 'dumbbell', number> = { barbell: 0.35, dumbbell: 0.1 };

/**
 * Ağırlık merkezi (vücut + yük). Hareketin doğru anlatımı için tek sayı:
 * bu nokta destek tabanının dışına düşerse figür, gerçekte düşecek bir pozda.
 */
export function centerOfMass(ex: RigExercise, S: Skeleton): Vec {
  let m = 0;
  let x = 0;
  let y = 0;
  for (const [a, b, w, f] of MASS) {
    const A = S[a] as Vec, Bp = S[b] as Vec;
    m += w; x += w * (A[0] + (Bp[0] - A[0]) * f); y += w * (A[1] + (Bp[1] - A[1]) * f);
  }
  const load = loadOf(ex);
  if (load && load !== 'band') {
    const at = load === 'barbell' && S.bar ? S.bar : S.hand;
    const w = LOAD_MASS[load];
    m += w; x += w * at[0]; y += w * at[1];
  }
  return [x / m, y / m];
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
 * Uzak kolun kendi hareketi var mı? Bacakla aynı ilke: iki uzuv aynı şeyi
 * yapıyorsa yalnız öndeki çizilir — squat'ta, preste, kürekte ikinci kol
 * bilgi değil gürültü. Bird-dog gibi çapraz hareketlerde uzak kol kendi
 * açısını taşır ve görünür.
 *
 * Ters kinematik kiplerinde (`ik`, `floor`, `hang`) uzak el yakınının aynı
 * hedefine gider — tanım gereği aynı hareket, gizli. Sadece `angles` kipinde
 * uzak kolun ayrı açısı olabilir.
 */
export function farArmDistinct(ex: RigExercise, samples = 21): boolean {
  if (ex.mode === 'hang' || ex.arm !== 'angles') return false;
  for (let i = 0; i < samples; i++) {
    const { p } = poseAt(ex, i / (samples - 1));
    if (Math.abs(p.upperF - p.upperA) > FAR_LEG_EPSILON) return true;
    if (Math.abs(p.foreF - p.foreA) > FAR_LEG_EPSILON) return true;
  }
  return false;
}

/** Uzak kol çizilecek mi: elle yazılan değer varsa o, yoksa kural. */
export const showFarArm = (ex: RigExercise): boolean =>
  ex.hideFarArm === undefined ? farArmDistinct(ex) : !ex.hideFarArm;

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
 * Önden görünüm için parça dönüşümü: kemik izdüşümde KISALIR (öne eğik gövde,
 * bükük diz kameraya doğru gelir), parça da kemik boyunca aynı oranda
 * kısalır; genişlik değişmez — katı bir parçanın ortografik izdüşümü tam
 * budur. Yan görünümde kemik hiç kısalmadığı için orada `partTransform`.
 * Ölçüldü: menteşeli fly'da boyun kemiği önden 6px'e iniyor, parça 24px
 * çizilince kafa gövdeden kopuyordu.
 */
export function partTransformScaled(a: Vec, b: Vec, len: number): string {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return `${partTransform(a, b)} scale(1 ${Math.max(0.05, l / len).toFixed(4)})`;
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
 * Topuk geride 16, parmak tabanı (ayak topu, MTP eklemi) önde 34, parmak ucu
 * 48 → 64px = 25.5 cm (2.51 px/cm). Eskiden 46px = 18 cm'di; denge denetimi
 * gelince anlaşıldı — küçük tabanda ağırlık merkezi sürekli dışarı taşıyordu.
 *
 * Bu sayılar `footPath`, `footLowestY`, `footSpan` ve `MAX_ANKLE_LIFT`'in
 * ortak kaynağı — ayrı yazılsalardı denetim, çizimin yapamayacağı bir
 * kalkışa izin verirdi. Nitekim veriyordu.
 */
export const FOOT = { heel: -16, ball: 34, toe: 48, sole: 13 } as const;

/**
 * Topuğun kalkabileceği en yüksek nokta.
 *
 * Topuk kalkarken ayak PARMAK TABANI (ayak topu) etrafında döner; parmaklar
 * yerde düz kalır. Ayak bileği ancak topa olan mesafesi kadar yükselebilir;
 * ötesinde top yerden kopar ve figür havada yürür.
 */
export const MAX_ANKLE_LIFT = Math.round(Math.hypot(FOOT.ball, FOOT.sole) - FOOT.sole);

/**
 * Ayağın yerel çerçeveleri: `(u, v)` → dünya noktası.
 *
 * `+u` parmak yönü, `+v` taban tarafı. `flip = -1` yerel x eksenini aynalıyor
 * (bkz. `facingFlip`): parmak yönü aynı kalır, taban karşı tarafa geçer.
 *
 * İKİ çerçeve, çünkü ayağın bir eklemi var: `arka` topuktan parmak tabanına
 * (ayak topu) kadar olan katı parça, `parmak` toptan parmak ucuna kadar olan
 * parça. Topuk kalkışında (`pinToe`) arka parça TOP etrafında döner, parmaklar
 * yerde düz kalır — kalf raise'in gerçek görünümü bu. Eskiden ayak tek katı
 * kalıp parmak UCU etrafında dönüyordu; parmak ucunda dikilen bir ayak gibi
 * duruyordu. Dönüş açısı ayak bileğinin yerden yüksekliğinden çıkıyor.
 *
 * `footPath`, `footLowestY` ve `footSpan` bu çerçeveleri PAYLAŞIYOR: ayrı
 * yazılsalardı denetim, çizimin bastığı yerden başka bir yeri ölçerdi.
 */
function footFrames(ankle: Vec, dir: number, pinToe: boolean, flip: number, toeDeg = 0): {
  arka: (u: number, v: number) => Vec;
  parmak: (u: number, v: number) => Vec;
} {
  const frame = (a: number) => {
    const ux = Math.sin(a);
    const uy = -Math.cos(a);
    const vx = -uy * flip;
    const vy = ux * flip;
    return (u: number, v: number): Vec => [ankle[0] + ux * u + vx * v, ankle[1] + uy * u + vy * v];
  };
  const duz = frame(rad(dir));
  if (!pinToe) {
    if (!toeDeg) return { arka: duz, parmak: duz };
    // Havadaki ayak: parmaklar TOPA menteşeli, arka ayağa göre `toe` kadar
    // yukarı (ekstansiyon) döner.
    const donuk = frame(rad(dir) - rad(toeDeg) * flip);
    const top = duz(FOOT.ball, FOOT.sole);
    const topD = donuk(FOOT.ball, FOOT.sole);
    return { arka: duz, parmak: (u, v) => { const q = donuk(u, v); return [q[0] - topD[0] + top[0], q[1] - topD[1] + top[1]]; } };
  }
  // Top yerde kalsın diye gereken ek dönüş: topun bilekten uzaklığı r, bilek
  // yerden h yüksekte → top tam yerde olacak şekilde arka parça döner.
  //
  // Dönüş MUTLAK: parmakları yerde olan ayağın yönü yalnız bilek
  // yüksekliğinden çıkar, `dir`den değil. Eskiden `dir`in üstüne ekleniyordu
  // ve plantar fleksiyonlu ayakta (hamlede arka ayak) top yerin altına
  // iniyordu — ölçüldü, 11px.
  const r = Math.hypot(FOOT.ball, FOOT.sole);
  const h = Math.max(0, Math.min(r, GROUND - ankle[1]));
  const extra = Math.asin(h / r) - Math.atan2(FOOT.sole, FOOT.ball);
  const arka = frame(Math.PI / 2 + extra * flip);
  // Parmaklar YERE DÜZ (taban yatay) ama TOPA menteşeli: yatay çerçevenin
  // top noktasını dönmüş çerçevenin top noktasına taşı. Ayak bileği açısı
  // parmakları aşağı çevirse bile yerdeki parmak yere gömülmez, yatar.
  const yatay = frame(Math.PI / 2);
  const topYatay = yatay(FOOT.ball, FOOT.sole);
  const topArka = arka(FOOT.ball, FOOT.sole);
  const parmak = (u: number, v: number): Vec => {
    const q = yatay(u, v);
    return [q[0] - topYatay[0] + topArka[0], q[1] - topYatay[1] + topArka[1]];
  };
  return { arka, parmak };
}

/**
 * Topuk kalkmış mı — ayak topu yerde, arka parça dönük?
 *
 * Üç durum: (1) `ankleLift` yazılmış (kalf raise), (2) ayak olduğu gibi
 * çizilse yere gömülecek (baldır öne eğik, bilek yüksek: hamlede arka ayak),
 * (3) ayak yere 6px içinde yaklaşmış ve top yere yetişiyor — yere basan bir
 * ayak birkaç piksel havada asılı kalmasın, otursun. Sallanan ayak (carry)
 * yere yaklaşınca topu bir an yere sürer; bu düşme değil, adım.
 * Sehpa üstündeki ayak (kutu, Bulgar sehpası) zemine göre ölçülmez.
 */
/** Tarafın parmak eklemi açısı. */
export const toeOf = (p: RigPose, far = false): number => (far ? p.toeF : p.toe);

export function footPinned(ex: RigExercise, p: RigPose, S: Skeleton, far: boolean): boolean {
  if (ex.mode !== 'stand') return false;
  if ((ex.prop === 'box' && !far) || (ex.prop === 'bench' && far)) return false;
  if (!far && p.ankleLift > 0) return true;
  const ankle = far ? S.ankleF : S.ankle;
  const h = GROUND - ankle[1];
  // Topuk gerçekten kalkmış olmalı (bilek duruş yüksekliğinin üstünde) ve top yere yetişmeli.
  if (h <= FOOT.sole + 0.5 || h > Math.hypot(FOOT.ball, FOOT.sole)) return false;
  return footLowestY(ankle, footDirOf(ex, p, far), false, facingFlip(ex.mode), toeOf(p, far)) > GROUND - 6;
}

/** Çizilen tabanın yatay aralığı `[sol, sağ]` — denge denetiminin destek tabanı. */
export function footSpan(ankle: Vec, dir: number, pinToe = false, flip = 1, toeDeg = 0): [number, number] {
  const { arka, parmak } = footFrames(ankle, dir, pinToe, flip, toeDeg);
  const xs = [arka(FOOT.heel + 1, FOOT.sole - 1)[0], parmak(FOOT.toe - 2, FOOT.sole - 1)[0]];
  return [Math.min(...xs), Math.max(...xs)];
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
export function footLowestY(ankle: Vec, dir: number, pinToe = false, flip = 1, toeDeg = 0): number {
  const { arka, parmak } = footFrames(ankle, dir, pinToe, flip, toeDeg);
  const { heel, ball, toe, sole } = FOOT;
  const arkaOrnek: [number, number][] = [[heel + 1, sole - 1], [heel + 6, sole + 1], [2, sole - 3], [10, sole - 2], [20, sole], [ball, sole]];
  const parmakOrnek: [number, number][] = [[ball, sole], [toe - 2, sole - 1], [toe + 2, sole - 5]];
  return Math.max(...arkaOrnek.map(([u, v]) => arka(u, v)[1]), ...parmakOrnek.map(([u, v]) => parmak(u, v)[1]));
}

/**
 * Ayak profili: arka parça (topuk → top) ve parmaklar (top → uç), iki alt yol.
 *
 * Topuk yuvarlak ve arkada, taban ortada hafif kavisli (ayak tabanı düz
 * değil), parmaklar öne incelir. Topuk kalkışında parmaklar yerde kalır,
 * arka parça toptan kırılır (bkz. `footFrames`).
 */
export function footPath(ankle: Vec, dir: number, pinToe = false, flip = 1, toeDeg = 0): string {
  const { arka, parmak } = footFrames(ankle, dir, pinToe, flip, toeDeg);
  const pa = (u: number, v: number) => { const q = arka(u, v); return `${q[0].toFixed(1)} ${q[1].toFixed(1)}`; };
  const pp = (u: number, v: number) => { const q = parmak(u, v); return `${q[0].toFixed(1)} ${q[1].toFixed(1)}`; };
  const { heel, ball, toe, sole } = FOOT;
  return (
    `M ${pa(heel + 2, -9)} ` +
    `C ${pa(heel - 3, -4)} ${pa(heel - 4, 6)} ${pa(heel + 1, sole - 1)} ` + // topuk arkası, yuvarlak
    `C ${pa(heel + 6, sole + 1)} ${pa(2, sole - 3)} ${pa(10, sole - 2)} ` + // taban kavisi
    `C ${pa(20, sole)} ${pa(ball - 4, sole)} ${pa(ball, sole)} ` + // taban → top
    `L ${pa(ball, 2)} ` + // top üstü
    `C ${pa(20, -2)} ${pa(6, -6)} ${pa(heel + 2, -9)} Z ` +
    // Parmaklar: toptan uca, taban düz, üstü incelerek
    `M ${pp(ball, sole)} ` +
    `L ${pp(toe - 2, sole - 1)} ` +
    `C ${pp(toe + 2, sole - 5)} ${pp(toe + 1, 1)} ${pp(toe - 6, -1)} ` + // parmak ucu
    `L ${pp(ball, 2)} Z`
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

/**
 * Ayak bileği NÖTR açısı: baldır yönünden ayak yönüne, kip başına.
 *
 * Ölçüldü, 31 arketibin bütün kareleri: `stand` ve `hang` kiplerinde ayak yönü
 * ile baldır yönü arasındaki fark −86°de kümeleniyor (statik pozların hepsi
 * TAM −86), `bench`te +125, `quad`ta −18. Bu sayılar keyfi değil, bugünkü
 * çizimin kendisi; nötr olarak alınınca mevcut duruşlar `ankle = 0` oluyor.
 *
 * `quad` iki kümeye ayrılıyordu (+11 plank, −18 dört ayak) çünkü tek bir sabit
 * ikisini birden anlatamıyordu. Nötr −18 (dört ayak, ayak düz) alındı; plank
 * farkı artık VERİDE duruyor — plank ayak parmakları üstünde, yani +29°
 * plantar fleksiyon. Model kazandığı için ifade edilebilir oldu.
 */
const ANKLE_NEUTRAL: Record<RigMode, number> = {
  stand: -86,
  hang: -86,
  bench: 125,
  supine: 125,
  quad: -18,
};

/**
 * Ayağın DÜNYA yönü: baldır + nötr + bilek açısı.
 *
 * Eskiden bu bir sabitti (`footDirFor(mode)`) ve baldırı hiç takip etmiyordu.
 * Sonucu ölçüldü: bacak salınırken ayak dünyada sabit kaldığı için bilek
 * eklemi hareket boyunca dönüyordu — `carry` 65°, `unilateral_lunge` 67°,
 * `bulgarian_split_squat` 116°. Hiçbir kural görmüyordu, çünkü model o açıyı
 * taşımıyordu; şimdi taşıyor ve denetlenebiliyor.
 *
 * `facingFlip` çarpanı sırt üstü kiplerde işareti çeviriyor: aynalanmış
 * figürde plantar fleksiyon ters yöne döner (bkz. `facingFlip`).
 */
export const footDirOf = (ex: RigExercise, p: RigPose, far = false): number =>
  (far ? p.shinF : p.shinA) + ANKLE_NEUTRAL[ex.mode] + (far ? p.ankleF : p.ankle) * facingFlip(ex.mode);
