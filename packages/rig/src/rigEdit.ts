import { B, FrontPoints, RigExercise, RigPose, Skeleton, Vec, angleOf, ik } from './rig';

/**
 * Figür üstünde sürükleyerek poz verme.
 *
 * Editörde bir eklemi tuttuğunda hangi AÇININ değişeceğini bu dosya
 * söylüyor. Kural her zaman aynı: tutulan eklem, kendisini taşıyan kemiğin
 * ucudur; o kemiği döndürürsün, gerisi zincirden gelir.
 *
 * Kaydırma ve yere oturtma sonucu etkilemiyor: açı iki nokta arasındaki
 * yönden çıkıyor ve ikisi de aynı miktarda ötelendiği için fark yok. Bu
 * yüzden çözücü ekrandaki (ötelenmiş) iskeletle doğrudan çalışabiliyor.
 */
export type DragJoint =
  | 'ankle'
  | 'knee'
  | 'pelvis'
  | 'lumbar'
  | 'thorax'
  | 'head'
  | 'elbow'
  | 'hand'
  | 'kneeF'
  | 'ankleF'
  | 'elbowF'
  | 'handF';

export interface DragHandle {
  joint: DragJoint;
  at: Vec;
  label: string;
  /** Uzak taraf tutamakları çizimde daha soluk. */
  far: boolean;
}

/** Bu hareket için sürüklenebilir eklemler — moda ve kol türüne göre değişir. */
export function dragHandles(ex: RigExercise, S: Skeleton): DragHandle[] {
  const near: [DragJoint, Vec, string][] = [
    ['knee', S.knee, 'Diz'],
    ['ankle', S.ankle, 'Ayak bileği'],
    ['pelvis', S.pelvis, 'Kalça'],
    ['lumbar', S.lumbar, 'Bel'],
    ['thorax', S.thorax, 'Göğüs'],
    ['head', S.head, 'Baş'],
  ];
  const arms: [DragJoint, Vec, string][] =
    ex.arm === 'angles'
      ? [
          ['elbow', S.elbow, 'Dirsek'],
          ['hand', S.hand, 'El'],
        ]
      : // Ters kinematikte dirsek çözümün sonucu; tutulacak tek şey el.
        [['hand', S.hand, 'El (hedef)']];
  const far: [DragJoint, Vec, string][] = [
    ['kneeF', S.kneeF, 'Uzak diz'],
    ['ankleF', S.ankleF, 'Uzak ayak'],
    ...(ex.arm === 'angles'
      ? ([
          ['elbowF', S.elbowF, 'Uzak dirsek'],
          ['handF', S.handF, 'Uzak el'],
        ] as [DragJoint, Vec, string][])
      : []),
  ];

  // Ölü tutamak "bozuk mu?" sorusu doğuruyor, o yüzden hiç çizilmiyor:
  // ayakta ayak yere sabit, asılıyken bel zincirin ortasında sabit.
  const nearFiltered = near.filter(
    ([j]) => !(ex.mode === 'stand' && j === 'ankle') && !(ex.mode === 'hang' && j === 'lumbar'),
  );
  // Asılı figürde el barda sabit, kalça zincirin ucu.
  const armsFiltered = ex.mode === 'hang' ? arms.filter(([j]) => j !== 'hand') : arms;

  return [
    ...nearFiltered.map(([joint, at, label]) => ({ joint, at, label, far: false })),
    ...armsFiltered.map(([joint, at, label]) => ({ joint, at, label, far: false })),
    ...far.map(([joint, at, label]) => ({ joint, at, label, far: true })),
  ];
}

/**
 * Eklem `joint` `target` noktasına çekildiğinde poza uygulanacak açı yaması.
 *
 * Kalçayı sürüklemek iki kemiği birden çözüyor (ayakta: ayak bileğinden yukarı
 * ters kinematik) — kalça, çömelme derinliğini veren tek tutamak olduğu için
 * en çok kullanılacak olan o.
 */
export function dragJoint(ex: RigExercise, S: Skeleton, joint: DragJoint, target: Vec): Partial<RigPose> {
  const stand = ex.mode === 'stand';
  const hang = ex.mode === 'hang';

  switch (joint) {
    case 'knee':
      // Ayakta zincir ayaktan yukarı kuruluyor: diz, baldırın ucu.
      return stand
        ? { shinA: angleOf(target, S.ankle), thighA: angleOf(S.pelvis, target) }
        : { thighA: angleOf(S.pelvis, target), shinA: angleOf(target, S.ankle) };

    case 'ankle':
      // Ayakta ayak sabit; diğer modlarda baldırın ucu.
      return stand ? {} : { shinA: angleOf(S.knee, target) };

    case 'pelvis': {
      if (stand) {
        // İki kemikli ters kinematik: ayak bileğinden kalçaya. Diz öne
        // bükülür (bend +1), yani çömelirken diz geriye kırılmıyor.
        const solved = ik(S.ankle, target, B.shin, B.thigh, 1);
        return { shinA: angleOf(solved.elbow, S.ankle), thighA: angleOf(target, solved.elbow) };
      }
      if (hang) return { torso: angleOf(target, S.lumbar) };
      return {};
    }

    case 'lumbar':
      // Asılı figürde zincir elden AŞAĞI kuruluyor: bel gövdenin ortasında,
      // `torso` ne olursa olsun yerinde duruyor. Beli sürüklemek beli değil
      // kalçayı savuruyordu; orada gövdeyi döndüren tutamak kalça.
      return hang ? {} : { torso: angleOf(S.pelvis, target) };

    case 'thorax':
      return { thoraxA: angleOf(S.lumbar, target) };

    case 'head':
      return { neckA: angleOf(S.thorax, target) };

    case 'elbow':
      return hang ? { foreA: angleOf(target, S.hand) } : { upperA: angleOf(S.sh, target) };

    case 'hand':
      // Ters kinematikte el bir HEDEF: omuza göre konum yazılıyor.
      return ex.arm === 'angles'
        ? { foreA: angleOf(S.elbow, target) }
        : ex.arm === 'floor'
          ? { hx: target[0] - S.sh[0] }
          : { hx: target[0] - S.sh[0], hy: target[1] - S.sh[1] };

    case 'kneeF':
      return { thighF: angleOf(S.hipF, target), shinF: angleOf(target, S.ankleF) };

    case 'ankleF':
      return { shinF: angleOf(S.kneeF, target) };

    case 'elbowF':
      return { upperF: angleOf(S.shF, target) };

    case 'handF':
      return { foreF: angleOf(S.elbowF, target) };

    default:
      return {};
  }
}

/** Açıyı 0-360 aralığına indirger — kaydedilen sayılar okunabilir kalsın. */
export const tidyAngle = (deg: number): number => Math.round((((deg % 360) + 360) % 360) * 10) / 10;

/** Yamayı kareye işler; açılar yuvarlanır, kaydırma alanları olduğu gibi kalır. */
export function applyPatch(frame: Partial<RigPose>, patch: Partial<RigPose>): Partial<RigPose> {
  const next = { ...frame };
  (Object.entries(patch) as [keyof RigPose, number][]).forEach(([k, v]) => {
    // Azimutlar İŞARETLİ kalır (eksi = orta hattı geçen kol); 0-360'a indirgemek
    // −15'i 345 yapar ve interpolasyon uzun yoldan döner.
    next[k] = k === 'hx' || k === 'hy' || k === 'shLift' || k === 'ankleLift' || k === 'armAz' || k === 'armAzF' || k === 'foreAz' || k === 'foreAzF' || k === 'toe' || k === 'toeF' ? Math.round(v) : tidyAngle(v);
  });
  return next;
}

/* --- önden görünümde sürükleme -------------------------------------------- */

export type FrontJoint = 'elbow' | 'hand' | 'elbowF' | 'handF';

/**
 * Önden görünümde tutulabilen eklemler: dirsek ve el, iki taraf. Kol düzlemi
 * (`armAz`) ve yükselme buradan geliyor; bacak ve gövde yan çözümden türediği
 * için önden tutamakları yok.
 */
export function frontDragHandles(ex: RigExercise, F: FrontPoints): { joint: FrontJoint; at: Vec; label: string; far: boolean }[] {
  const angles = ex.arm === 'angles';
  return [
    ...(angles ? [{ joint: 'elbow' as FrontJoint, at: F.L.elbow, label: 'Dirsek', far: false }] : []),
    { joint: 'hand', at: F.L.hand, label: angles ? 'El' : 'El (düzlem)', far: false },
    ...(angles ? [{ joint: 'elbowF' as FrontJoint, at: F.R.elbow, label: 'Uzak dirsek', far: true }] : []),
    { joint: 'handF', at: F.R.hand, label: angles ? 'Uzak el' : 'Uzak el (düzlem)', far: true },
  ];
}

/**
 * Önden görünümde bir eklemi hedefe çekmek: ekrandaki (yanal, dikey) ikilisi
 * ile kemik boyu, kolun 3B yönünü belirliyor — ileri bileşen kalan uzunluktan
 * çıkıyor, işareti bugünkü pozdan (kol öne mi arkaya mı bakıyordu).
 *
 *   yükselme  sag = acos(−dy / L)
 *   düzlem    az  = atan2(yanal, ileri)
 *
 * `angles` kipinde dirsek `upperA`+`armAz`, el `foreA`+`foreAz` yazar. Ters
 * kinematik kiplerinde sagital açı çözümün sonucu; el yalnız düzlemi yazar.
 */
export function dragFront(ex: RigExercise, p: RigPose, S: Skeleton, F: FrontPoints, joint: FrontJoint, target: Vec): Partial<RigPose> {
  const far = joint === 'elbowF' || joint === 'handF';
  const side = far ? F.R : F.L;
  const sgn = far ? 1 : -1;
  const isHand = joint === 'hand' || joint === 'handF';
  const from = isHand ? side.elbow : side.sh;
  const L = isHand ? B.fore : B.upper;
  const curSag = isHand
    ? angleOf(far ? S.elbowF : S.elbow, far ? S.handF : S.hand)
    : angleOf(far ? S.shF : S.sh, far ? S.elbowF : S.elbow);
  const curAz = isHand ? (far ? p.foreAzF : p.foreAz) : (far ? p.armAzF : p.armAz);
  const deg = (r: number) => (r * 180) / Math.PI;
  const rad = (d: number) => (d * Math.PI) / 180;

  let lat = sgn * (target[0] - from[0]);
  let dy = target[1] - from[1];
  const r = Math.hypot(lat, dy);
  // Tam uzanmış kol: hedef kol boyunu aşıyorsa kola oturt, ileri bileşen sıfır.
  if (r > L) { lat *= L / r; dy *= L / r; }
  const fwdSign = Math.sin(rad(curSag)) * Math.cos(rad(curAz)) < 0 ? -1 : 1;
  const fwd = fwdSign * Math.sqrt(Math.max(0, L * L - lat * lat - dy * dy));
  const az = Math.round(deg(Math.atan2(lat, fwd)));
  const sag = Math.round(deg(Math.acos(Math.max(-1, Math.min(1, -dy / L)))) * 10) / 10;

  if (ex.arm !== 'angles') {
    // Düzlem iki kemikte birden: ters kinematikte kol tek düzlemde çalışır.
    return far ? { armAzF: az, foreAzF: az } : { armAz: az, foreAz: az };
  }
  if (isHand) return far ? { foreF: sag, foreAzF: az } : { foreA: sag, foreAz: az };
  return far ? { upperF: sag, armAzF: az } : { upperA: sag, armAz: az };
}
