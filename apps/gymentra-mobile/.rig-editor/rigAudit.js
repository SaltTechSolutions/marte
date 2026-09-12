import { B, GROUND, angleOf, frontPoints, frontTrunk, poseAt, skeleton, } from './rig';
const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const norm = (deg) => {
    let d = ((deg % 360) + 360) % 360;
    if (d > 180)
        d -= 360;
    return d;
};
/** Diz bükülme açısı; işaret yalnızca `stand` modunda anlamlı. */
export const kneeFlex = (S) => norm(angleOf(S.knee, S.ankle) - angleOf(S.pelvis, S.knee));
export const elbowFlex = (S) => norm(angleOf(S.elbow, S.hand) - angleOf(S.sh, S.elbow));
/** Tek bir karenin denetimi — editör bunu her sürükleme sonrası çağırıyor. */
export function auditFrame(ex, p, t = 0) {
    const S = skeleton(ex, p);
    const issues = [];
    const add = (rule, message) => issues.push({ t, rule, message });
    // Gizli uzuv çizilmiyor: zeminin altında olması görünür bir kusur değil.
    const hidden = new Set([
        ...(ex.hideFarLeg ? ['hipF', 'kneeF', 'ankleF'] : []),
        ...(ex.hideFarArm ? ['shF', 'elbowF', 'handF'] : []),
    ]);
    Object.keys(S).forEach((k) => {
        const v = S[k];
        if (!v || k === 'bar' || hidden.has(k))
            return;
        if (v[1] > GROUND + 14)
            add('zemin', `${k} zeminin altında`);
    });
    if (ex.mode === 'stand' && Math.abs(S.ankle[1] + p.ankleLift - (GROUND - 12)) > 0.5) {
        add('ayak', 'basan ayak yerden kalkmış');
    }
    if (ex.mode === 'quad' || ex.mode === 'supine') {
        const lowest = Math.max(S.ankle[1], S.ankleF[1], S.knee[1], S.kneeF[1], S.hand[1], S.handF[1], S.pelvis[1], S.head[1]);
        if (lowest < GROUND - 30)
            add('temas', 'hiçbir yeri yere değmiyor');
    }
    if (ex.mode === 'hang') {
        if (S.hand[1] > 140)
            add('bar', 'el bardan kopmuş');
        if (S.ankle[1] > GROUND - 20)
            add('asılı', 'ayak yere değiyor');
    }
    const knee = kneeFlex(S);
    if (Math.abs(knee) > 155)
        add('diz', `diz ${Math.round(Math.abs(knee))}° bükülmüş (insan sınırı ~150°)`);
    if (ex.mode === 'stand' && knee < -14)
        add('diz', 'diz ters yöne kırılmış');
    if (ex.arm === 'angles' && Math.abs(elbowFlex(S)) > 160) {
        add('dirsek', `dirsek ${Math.round(Math.abs(elbowFlex(S)))}° bükülmüş`);
    }
    if (len(S.pelvis, S.head) < 90)
        add('gövde', 'gövde kendi üstüne katlanmış');
    if (ex.view === 'front') {
        const F = frontPoints(ex, p, S);
        const trunk = frontTrunk(F);
        if (trunk.ry <= 0)
            add('gövde', 'önden gövde çizilemiyor (yarıçap negatif)');
        [F.L, F.R].forEach((side, i) => {
            const upper = len(side.sh, side.elbow);
            const which = i === 0 ? 'sol' : 'sağ';
            if (upper < 30)
                add('kol', `önden ${which} üst kol omzun içine gömülmüş`);
            if (upper > 110)
                add('kol', `önden ${which} üst kol uzamış`);
        });
    }
    return issues;
}
/**
 * Tekrarın tamamı — 21 kare. Uçlar kadar aralar da denetleniyor: eklem-yerel
 * geçiş yüzünden iki doğru karenin arası pekâlâ yanlış olabiliyor (kolun
 * uzun yoldan dönüp yerin içinden geçmesi böyle yakalandı).
 */
export function auditExercise(ex, samples = 21) {
    const seen = new Set();
    const issues = [];
    for (let i = 0; i < samples; i++) {
        const t = i / (samples - 1);
        auditFrame(ex, poseAt(ex, t).p, t).forEach((issue) => {
            // Aynı sorun 21 karede 21 kez bildirilmesin; ilk görüldüğü an yeter.
            const key = issue.rule + '|' + issue.message;
            if (seen.has(key))
                return;
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
export function auditLoop(ex) {
    const first = poseAt(ex, 0).p;
    const last = poseAt(ex, 1).p;
    const issues = [];
    Object.keys(first).forEach((k) => {
        const d = Math.abs(norm(first[k] - last[k]));
        if (d > 1)
            issues.push({ t: 1, rule: 'döngü', message: `${k}: başlangıç ${first[k]}° ile bitiş ${last[k]}° farklı, tekrar başa dönerken zıplıyor` });
    });
    return issues;
}
/** Segment boyları — geçiş sırasında uzuv uzarsa motor bozulmuş demektir. */
export function auditSegments(ex, samples = 21) {
    const issues = [];
    for (let i = 0; i < samples; i++) {
        const t = i / (samples - 1);
        const S = skeleton(ex, poseAt(ex, t).p);
        const check = (name, a, b, expected) => {
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
