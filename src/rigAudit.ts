import {
  B,
  MAX_ANKLE_LIFT,
  FrontSide,
  GROUND,
  RigExercise,
  RigPose,
  Skeleton,
  Vec,
  angleOf,
  frontPoints,
  frontTrunk,
  poseAt,
  showFarLeg,
  skeleton,
} from './rig';

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
 * piksel alanlarını aynı düz nesnede tutuyor (`hx`, `hy`, `hxF`, `shLift`,
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
    ...(ex.hideFarArm ? (['shF', 'elbowF', 'handF'] as (keyof Skeleton)[]) : []),
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

  if (ex.mode === 'quad' || ex.mode === 'supine') {
    const lowest = Math.max(S.ankle[1], S.ankleF[1], S.knee[1], S.kneeF[1], S.hand[1], S.handF[1], S.pelvis[1], S.head[1]);
    if (lowest < GROUND - 30) add('temas', 'hiçbir yeri yere değmiyor');
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
    ([F.L, F.R] as FrontSide[]).forEach((side, i) => {
      const upper = len(side.sh, side.elbow);
      const which = i === 0 ? 'sol' : 'sağ';
      if (upper < 30) add('kol', `önden ${which} üst kol omzun içine gömülmüş`);
      if (upper > 110) add('kol', `önden ${which} üst kol uzamış`);
    });
  }

  return issues;
}

/**
 * Tekrarın tamamı — 21 kare. Uçlar kadar aralar da denetleniyor: eklem-yerel
 * geçiş yüzünden iki doğru karenin arası pekâlâ yanlış olabiliyor (kolun
 * uzun yoldan dönüp yerin içinden geçmesi böyle yakalandı).
 */
export function auditExercise(ex: RigExercise, samples = 21): RigIssue[] {
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
const OFFSET_KEYS = new Set<keyof RigPose>(['hx', 'hy', 'hxF', 'shLift', 'ankleLift']);

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
  return issues;
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
