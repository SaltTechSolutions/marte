import { B, angleOf, ik } from './rig';
/** Bu hareket için sürüklenebilir eklemler — moda ve kol türüne göre değişir. */
export function dragHandles(ex, S) {
    const near = [
        ['knee', S.knee, 'Diz'],
        ['ankle', S.ankle, 'Ayak bileği'],
        ['pelvis', S.pelvis, 'Kalça'],
        ['lumbar', S.lumbar, 'Bel'],
        ['thorax', S.thorax, 'Göğüs'],
        ['head', S.head, 'Baş'],
    ];
    const arms = ex.arm === 'angles'
        ? [
            ['elbow', S.elbow, 'Dirsek'],
            ['hand', S.hand, 'El'],
        ]
        : // Ters kinematikte dirsek çözümün sonucu; tutulacak tek şey el.
            [['hand', S.hand, 'El (hedef)']];
    const far = [
        ['kneeF', S.kneeF, 'Uzak diz'],
        ['ankleF', S.ankleF, 'Uzak ayak'],
        ...(ex.arm === 'angles'
            ? [
                ['elbowF', S.elbowF, 'Uzak dirsek'],
                ['handF', S.handF, 'Uzak el'],
            ]
            : []),
    ];
    // Ayakta duran figürde ayak yere sabit; onu sürüklemek anlamsız.
    const nearFiltered = ex.mode === 'stand' ? near.filter(([j]) => j !== 'ankle') : near;
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
export function dragJoint(ex, S, joint, target) {
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
            if (hang)
                return { torso: angleOf(target, S.lumbar) };
            return {};
        }
        case 'lumbar':
            return hang ? { torso: angleOf(S.pelvis, target) } : { torso: angleOf(S.pelvis, target) };
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
export const tidyAngle = (deg) => Math.round((((deg % 360) + 360) % 360) * 10) / 10;
/** Yamayı kareye işler; açılar yuvarlanır, kaydırma alanları olduğu gibi kalır. */
export function applyPatch(frame, patch) {
    const next = { ...frame };
    Object.entries(patch).forEach(([k, v]) => {
        next[k] = k === 'hx' || k === 'hy' || k === 'hxF' || k === 'shLift' || k === 'ankleLift' ? Math.round(v) : tidyAngle(v);
    });
    return next;
}
