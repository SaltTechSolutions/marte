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
};
export const GROUND = 560;
export const ANKLE_X = 210;
export const CENTER_X = 210;
/**
 * Barın yüksekliği (hang). Asılı figür bardan aşağı yaklaşık 480px sarkıyor
 * (kol + gövde + bacak), bu yüzden bar yeterince yukarıda olmalı — yoksa
 * ayaklar zeminin altında kalır.
 */
export const BAR_Y = 56;
export const rad = (d) => (d * Math.PI) / 180;
export const D = (d) => [Math.sin(rad(d)), -Math.cos(rad(d))];
export const add = (p, v, s) => [p[0] + v[0] * s, p[1] + v[1] * s];
export const sub = (p, v, s) => [p[0] - v[0] * s, p[1] - v[1] * s];
export const lerpP = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
/** İki nokta arasındaki dünya açısı (derece), `D` ile aynı eksende. */
export const angleOf = (a, b) => (Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180) / Math.PI;
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
export const ease = (u) => u * u * (3 - 2 * u);
/**
 * Eksik alanları doldurur. Uzak uzuvlar yazılmadıysa yakınından türetilir:
 * yalnızca birkaç derece fark, çünkü iki taraf aynı işi yapıyordur.
 */
export const fillPose = (p) => {
    const f = { ...BASE, ...p };
    return {
        ...f,
        thighF: p.thighF ?? f.thighA + 7,
        shinF: p.shinF ?? f.shinA - 5,
        upperF: p.upperF ?? f.upperA - 5,
        foreF: p.foreF ?? f.foreA + 2,
    };
};
/**
 * Dünya açılarını eklem-yerel açılara çevirir.
 *
 * Kareler dünya uzayında yazılıyor çünkü "kaval kemiği dikey" demek insan
 * için kolay. Ama ara kareler yerel uzayda hesaplanmalı, yoksa gövde öne
 * eğilirken bacak yerinde kalıyormuş gibi görünür.
 */
export const toLocal = (p) => ({
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
export const toWorld = (l) => {
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
export function ik(S, T, L1, L2, bend) {
    const dx = T[0] - S[0];
    const dy = T[1] - S[1];
    const lo = Math.abs(L1 - L2) + 3;
    const hi = L1 + L2 - 3;
    const dist = Math.min(hi, Math.max(lo, Math.hypot(dx, dy)));
    const base = Math.atan2(dx, -dy);
    const c = (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist);
    const th = base + bend * Math.acos(Math.min(1, Math.max(-1, c)));
    const elbow = [S[0] + Math.sin(th) * L1, S[1] - Math.cos(th) * L1];
    const fd = Math.atan2(T[0] - elbow[0], -(T[1] - elbow[1]));
    return { elbow, hand: [elbow[0] + Math.sin(fd) * L2, elbow[1] - Math.cos(fd) * L2] };
}
/** `t` (0..1) anındaki poz ve o anın evre adı. */
export function poseAt(ex, t) {
    const kf = ex.kf;
    let i = 0;
    while (i < kf.length - 2 && t > kf[i + 1].t)
        i++;
    const a = kf[i];
    const b = kf[i + 1] || kf[i];
    const span = Math.max(0.0001, b.t - a.t);
    const u = ease(Math.min(1, Math.max(0, (t - a.t) / span)));
    const la = toLocal(fillPose(a.p));
    const lb = toLocal(fillPose(b.p));
    const l = {};
    Object.keys(la).forEach((k) => {
        l[k] = la[k] + (lb[k] - la[k]) * u;
    });
    return { p: toWorld(l), phase: u < 0.5 ? a : b };
}
/** Modun yere bastığı noktalar — figür bunların en alçağına oturtulur. */
const CONTACTS = {
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
 * Kadraj kaydırması, harekete BİR KEZ hesaplanır.
 *
 * Kare başına hesaplanan bir kaydırma figürü ortalar ama sahnenin geri
 * kalanını — zemin çizgisini, sehpayı, basamağı — figürle birlikte
 * sürükler: bar yukarı çıkarken yer yana kayıyordu. Dünya sabit durmalı,
 * içinde insan hareket etmeli.
 */
const SHIFT = new WeakMap();
function centeringShift(ex) {
    const cached = SHIFT.get(ex);
    if (cached !== undefined)
        return cached;
    if (ex.mode === 'hang') {
        SHIFT.set(ex, 0);
        return 0;
    }
    let sum = 0;
    const N = 12;
    for (let i = 0; i < N; i++) {
        const { p } = poseAt(ex, i / N);
        const S = build(ex, p);
        const anchor = S.bar ? (S.bar[0] + S.pelvis[0] * 1.4) / 2.4 : S.pelvis[0];
        sum += CENTER_X - anchor;
    }
    const dx = sum / N;
    SHIFT.set(ex, dx);
    return dx;
}
export function skeleton(ex, p) {
    const S = build(ex, p);
    const dx = centeringShift(ex);
    // Yere oturtma kare başına kalır: temas noktası zeminde durmalı, zemin
    // değil figür yer değiştirir.
    const contacts = CONTACTS[ex.mode];
    const dy = contacts.length ? GROUND - 8 - Math.max(...contacts.map((k) => S[k][1])) : 0;
    Object.keys(S).forEach((k) => {
        const v = S[k];
        if (v)
            S[k] = [v[0] + dx, v[1] + dy];
    });
    return S;
}
function build(ex, p) {
    let pelvis;
    let ankle;
    let knee;
    let sh = null;
    let hand = null;
    let elbow = null;
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
    }
    else if (ex.mode === 'stand') {
        ankle = [ANKLE_X, GROUND - 12 - p.ankleLift];
        knee = sub(ankle, D(p.shinA), B.shin);
        pelvis = sub(knee, D(p.thighA), B.thigh);
    }
    else {
        pelvis = ex.mode === 'quad' ? [150, GROUND - 119] : [150, 430];
        knee = add(pelvis, D(p.thighA), B.thigh);
        ankle = add(knee, D(p.shinA), B.shin);
    }
    const hipF = [pelvis[0] - 18, pelvis[1] + 3];
    const kneeF = add(hipF, D(p.thighF), B.thigh);
    const ankleF = add(kneeF, D(p.shinF), B.shin);
    const lumbar = add(pelvis, D(p.torso), B.lumbar);
    const thorax = add(lumbar, D(p.thoraxA), B.thorax);
    const neck = add(thorax, D(p.neckA), B.neck);
    const head = add(neck, D(p.neckA), 28);
    if (!sh)
        sh = add(thorax, D(p.thoraxA + 118), 14);
    const shF = [sh[0] - 16, sh[1] + 5];
    let elbowF;
    let handF;
    if (ex.mode === 'hang') {
        const a2 = ik(shF, [hand[0] - 13, hand[1] + 3], B.upper, B.fore, ex.bend);
        elbowF = a2.elbow;
        handF = a2.hand;
    }
    else if (ex.arm === 'ik' || ex.arm === 'floor') {
        const T = ex.arm === 'floor' ? [sh[0] + p.hx, GROUND - 12] : [sh[0] + p.hx, sh[1] + p.hy];
        const a1 = ik(sh, T, B.upper, B.fore, ex.bend);
        const a2 = ik(shF, [T[0] - 11, T[1] + 4], B.upper, B.fore, ex.bend);
        elbow = a1.elbow;
        hand = a1.hand;
        elbowF = a2.elbow;
        handF = a2.hand;
    }
    else {
        elbow = add(sh, D(p.upperA), B.upper);
        hand = add(elbow, D(p.foreA), B.fore);
        elbowF = add(shF, D(p.upperF), B.upper);
        handF = add(elbowF, D(p.foreF), B.fore);
    }
    const bar = ex.bar === 'back'
        ? add(thorax, D(p.thoraxA + 201), 18)
        : ex.bar === 'hands'
            ? [hand[0], hand[1]]
            : // Kalçadaki bar yükün nerede olduğunu söyler ve kalçayla birlikte
                // yükselir — hip thrust'ın bütün hikâyesi bu.
                ex.bar === 'hips'
                    ? add(pelvis, D(p.torso + 180), 26)
                    : null;
    const S = {
        pelvis, knee, ankle, hipF, kneeF, ankleF, lumbar, thorax, neck, head,
        sh, elbow: elbow, hand: hand, shF, elbowF, handF, bar,
    };
    return S;
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
function frontElbow(sh, hand, sgn) {
    const dx = hand[0] - sh[0];
    const dy = hand[1] - sh[1];
    const d = Math.hypot(dx, dy);
    if (d < 70)
        return [sh[0] + sgn * 24, sh[1] + 32];
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
export function frontPoints(ex, p, S) {
    const kneeFlex = Math.abs(p.shinA - p.thighA);
    const ab = 4 + kneeFlex * 0.16;
    const shDx = 44;
    const hipDx = 23;
    const footDx = 31;
    const shY = S.thorax[1] + 6 - p.shLift;
    const mk = (sgn) => {
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
    const F = {
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
 * Önden görünümde gövde elipsi.
 *
 * Yarıçap bel ile göğüs arasındaki MESAFEDEN çıkar; işaretli farktan değil.
 * Ayakta duran figürde göğüs belin üstünde olduğu için fark negatif geliyordu
 * ve SVG negatif yarıçaplı elipsi hiç çizmiyordu — önden bakışta gövde
 * boştu.
 */
export function frontTrunk(F) {
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
export function boundsFor(ex, view) {
    let x0 = 1e9;
    let y0 = 1e9;
    let x1 = -1e9;
    let y1 = -1e9;
    const eat = (q, r) => {
        if (!q)
            return;
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
            [F.L, F.R].forEach((side) => Object.keys(side).forEach((k) => eat(side[k], 24)));
            if (F.barY !== null) {
                eat([FX - 152, F.barY], 26);
                eat([FX + 152, F.barY], 26);
            }
        }
        else {
            Object.keys(S).forEach((k) => eat(S[k], k === 'bar' ? 54 : k === 'head' ? 34 : 24));
            if (ex.mode === 'bench')
                x1 = Math.max(x1, S.pelvis[0] + 270);
            if (ex.mode === 'hang')
                eat([CENTER_X, BAR_Y], 30);
        }
    }
    y1 = Math.max(y1, GROUND + 20);
    x0 -= 14;
    x1 += 14;
    y0 -= 14;
    return `${x0.toFixed(1)} ${y0.toFixed(1)} ${(x1 - x0).toFixed(1)} ${(y1 - y0).toFixed(1)}`;
}
/**
 * İki uçtaki kalınlığı farklı olabilen kapsül gövde.
 *
 * Uzuvlar tek kalınlıkta çubuk değil: kas kütlesi uyluğun ve baldırın üst
 * üçte birinde, pazunun ortasında toplanır. Çizim bu yüzden her uzvu iki
 * kapsülden kuruyor.
 */
export function capsule(a, b, wa, wb) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const ux = dx / l;
    const uy = dy / l;
    const nx = -uy;
    const ny = ux;
    const ra = wa / 2;
    const rb = wb / 2;
    return (`M ${a[0] + nx * ra} ${a[1] + ny * ra} L ${b[0] + nx * rb} ${b[1] + ny * rb} ` +
        `A ${rb} ${rb} 0 0 0 ${b[0] - nx * rb} ${b[1] - ny * rb} L ${a[0] - nx * ra} ${a[1] - ny * ra} ` +
        `A ${ra} ${ra} 0 0 0 ${a[0] + nx * ra} ${a[1] + ny * ra} Z`);
}
/**
 * Ayak. Topuk ayak bileğinin altında, parmak ucu önde; ikisi de yerden
 * yükselebilir — topuk kalkışında ve basamağa çıkışta ayak havada kalır,
 * tabanı zemine yapıştırmak yanlış olur.
 */
/**
 * Ayak.
 *
 * `pinToe`: topuk kalkarken parmak ucu yerde kalır ve ayak parmak ucu
 * etrafında döner — topuk kalkışının tanımı bu. Yükseklik ayağın boyuyla
 * sınırlı: taban zeminden koparsa figür havada yürür.
 *
 * `pinToe` olmadan taban ayak bileğine bağlı kalır; havadaki ayak (hamlenin
 * arka ayağı, asılı bacak) zemine kadar uzayan bir kama çizmez.
 */
export function footPath(ankle, dir, pinToe = false) {
    const d = D(dir);
    const heel = add(ankle, d, -16);
    const toe = add(ankle, d, B.foot - 16);
    const sx = d[0] < 0 ? -1 : 1;
    const heelBottom = Math.min(GROUND, ankle[1] + 12);
    const toeBottom = pinToe ? GROUND : Math.min(GROUND, toe[1] + 12);
    return `M ${heel[0]} ${ankle[1] - 6} L ${toe[0]} ${Math.min(toeBottom - 6, toe[1])} L ${toe[0] + 6 * sx} ${toeBottom} L ${heel[0] - 4 * sx} ${heelBottom} Z`;
}
export const footDirFor = (mode) => (mode === 'bench' || mode === 'supine' ? 268 : mode === 'quad' ? 250 : 92);
