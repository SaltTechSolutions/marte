import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';

import { figureColors } from '@/theme/figureColors';
import { useAppTheme } from '@/theme/ThemeContext';
import {
  B,
  BAR_Y,
  FX,
  GROUND,
  RigExercise,
  RigPose,
  Skeleton,
  Vec,
  boundsFor,
  capsule,
  facingFlip,
  footDirFarOf,
  footDirOf,
  footPath,
  frontPoints,
  frontTrunk,
  handPath,
  headProfile,
  showFarLeg,
  lerpP,
  partTransform,
  pelvisMass,
  poseAt,
  propShift,
  skeleton,
  solePoints,
} from '@/utils/rig';
import rigBodyParts from '@/data/rigBodyParts.json';

/**
 * Kemiğe oturan uzuv siluetleri.
 *
 * Yerel uzayda kemik (0,0) → (0,len); `partTransform` onu iki eklem arasına
 * yerleştiriyor. Kapsül geometrisinin yerini alıyorlar: kapsül iki daireyi
 * birleştiren bir şekildi ve baldırın inceldiği, pazunun şiştiği yeri
 * anlatamıyordu. Bir parça eksikse çağıran kapsüle düşüyor.
 */
const PARTS = rigBodyParts.parts as Record<string, { len: number; d: string }>;

const FRAME_MS = 33; // ~30 fps: telefonda akıcı, pili yakmıyor

/** Görünen kenar çizgisi kalınlığı. Editördeki `EDGE_W` ile aynı olmak zorunda. */
const EDGE_W = 1.6;

/** Zincirin tek bir parçası: ya dönüştürülmüş bir yol ya da bir eklem topu. */
type Piece = { key: string; d: string; tf?: string } | { key: string; c: Vec; r: number };

/** Elips → yol. Zincire giren her şey `d` taşımak zorunda. */
const ellipsePath = (cx: number, cy: number, rx: number, ry: number) =>
  `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${rx * 2} 0 a ${rx} ${ry} 0 1 0 ${-rx * 2} 0 Z`;

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
 * Dışarıda kalan `EDGE_W`'lik şerit zincirin DIŞ hattı oluyor; parçalar
 * arasındaki bütün ekler dolgunun altında kalıyor.
 *
 * Zincir sınırları çizim sırasını da taşıyor: gövde ile yakın kol ayrı
 * zincirler, çünkü kolun gövdenin önünden geçtiği yerde hat İSTENİYOR.
 */
function Chain({ id, pieces, fill, edge }: { id: string; pieces: (Piece | null)[]; fill: string; edge: string }) {
  const list = pieces.filter((q): q is Piece => q !== null);
  const draw = (q: Piece, pass: 'alt' | 'ust') => {
    const k = `${q.key}${pass}`;
    const paint = pass === 'alt'
      ? { fill: edge, stroke: edge, strokeWidth: EDGE_W * 2, strokeLinejoin: 'round' as const }
      : { fill };
    return 'd' in q
      ? <Path key={k} d={q.d} transform={q.tf} {...paint} />
      : <Circle key={k} cx={q.c[0]} cy={q.c[1]} r={q.r} {...paint} />;
  };
  return (
    <G key={id}>
      <G>{list.map((q) => draw(q, 'alt'))}</G>
      <G>{list.map((q) => draw(q, 'ust'))}</G>
    </G>
  );
}

/**
 * Eklemli kuklanın çizimi (src/utils/rig.ts çözer, burası boyar).
 *
 * Ekranda oynatma düğmesi, kaydırma çubuğu ya da eklem/iskelet anahtarı
 * YOK: onlar hareketi hazırlarken işe yarayan araçlardı, üyenin ekranında
 * yalnızca gürültü. Hareket kendiliğinden döner; "azaltılmış hareket"
 * açıksa ilk karede durur.
 */
export function RigFigure({
  rig,
  view,
  height = 260,
}: {
  rig: RigExercise;
  /** Yazılmazsa hareketin kendi düzlemi: yanal işler önden okunur. */
  view?: 'side' | 'front';
  height?: number;
}) {
  const { colors } = useAppTheme();
  const plane: 'side' | 'front' = view ?? rig.view ?? 'side';
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const originRef = useRef(0);
  const lastPaintRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!cancelled && !reduce) setPlaying(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!playing) return undefined;
      let raf = 0;
      originRef.current = performance.now() - t * rig.dur;
      const tick = (now: number) => {
        if (now - lastPaintRef.current >= FRAME_MS) {
          lastPaintRef.current = now;
          setT((((now - originRef.current) / rig.dur) % 1 + 1) % 1);
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
      // `t` bilerek bağımlılık değil: döngü oynarken onun sahibi.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playing, rig]),
  );

  // Türetme ve gerekçesi `theme/figureColors.ts`'te; oradaki test dört
  // temada da kontrast eşiğini sınıyor.
  const { skin, skinFar, edge, edgeFar, joint, floor: floorC, metal } = figureColors(colors);
  // `line` SAHNE eşyasının (sehpa, basamak, kablo, makine) ince hattı olarak
  // kalıyor: figürün hattıyla aynı vurguyu alsaydı mobilya figürle yarışırdı.
  const line = colors.line;

  const { p, phase } = poseAt(rig, t);
  const S = useMemo(() => skeleton(rig, p), [rig, p]);
  // Sahne (zemin, sehpa, basamak, bar) ilk karenin iskeletinden çizilir ve
  // hareket boyunca yerinde kalır. Bunları her karenin eklemlerinden çizmek
  // sehpayı ve yeri figürle birlikte kaydırıyordu.
  const S0 = useMemo(() => skeleton(rig, poseAt(rig, 0).p), [rig]);
  // Sehpanın eğimi gövdenin ekseninden okunur (SVG'de saat yönü, +x'ten).
  const t0 = poseAt(rig, 0).p.torso;
  const benchDeg = (Math.atan2(-Math.cos((t0 * Math.PI) / 180), Math.sin((t0 * Math.PI) / 180)) * 180) / Math.PI;
  // Topuk kalkışında ayak parmak ucu etrafında döner; basamakta ayak düz basar.
  const pinToe = rig.prop !== 'box' && p.ankleLift > 0;
  // Uzak bacak yalnızca kendi hareketi varsa çizilir (hamle, step-up,
  // bird-dog, taşıma). Squat gibi iki tarafın aynı işi yaptığı hareketlerde
  // ikinci bacak derinlik değil gürültü ekliyor.
  const farLeg = showFarLeg(rig);
  // Sırt üstü kiplerde figür aynalanmış: yüz yukarı, ayak tabanı yerde.
  const flip = facingFlip(rig.mode);
  const viewBox = useMemo(() => boundsFor(rig, plane), [rig, plane]);

  /** Kapsül parçası — siluet verisi yoksa düşülen çizim. */
  const seg = (key: string, a: Vec, b: Vec, wa: number, wb: number): Piece => ({ key, d: capsule(a, b, wa, wb) });
  /**
   * Eklem topu.
   *
   * İki katı parçanın uç uca eklendiği yerdeki kamayı dolduruyor. Yarıçaplar
   * siluetin o uçtaki yarı genişliğine göre seçili (diz 13 ↔ uyluk ucu 12 /
   * baldır başı 15, dirsek 10 ↔ üst kol ucu 9 / ön kol başı 10): büyüğü
   * silueti dışarı taşırıp yumru yapıyor, küçüğü kamayı kapatmıyor.
   */
  const ball = (key: string, c: Vec, r: number): Piece => ({ key, c, r });
  /** Veri siluetini kemiğe oturtur; parça yoksa null döner. */
  const part = (key: string, name: string, a: Vec, b: Vec): Piece | null => {
    const q = PARTS[name];
    return q ? { key, d: q.d, tf: partTransform(a, b) } : null;
  };
  /** Uzuv: parça varsa siluet, yoksa iki kapsül (kütle üst üçte birde). */
  const limb = (key: string, a: Vec, b: Vec, wa: number, wm: number, wb: number, at: number, name?: string): Piece[] => {
    const q = name ? part(key, name, a, b) : null;
    if (q) return [q];
    const m = lerpP(a, b, at);
    return [seg(key + 'p', a, m, wa, wm), seg(key + 'd', m, b, wm, wb)];
  };
  /**
   * El, ön kolun yönünde uzanır: bileği (0,0) kabul edip kemik dönüşümünü
   * kullanıyoruz, böylece elin yönü koldan geliyor — daire bunu söyleyemiyordu.
   */
  const hand = (key: string, wrist: Vec, elbow: Vec): Piece => {
    const dx = wrist[0] - elbow[0];
    const dy = wrist[1] - elbow[1];
    const l = Math.hypot(dx, dy) || 1;
    return { key, d: handPath(), tf: partTransform(wrist, [wrist[0] + (dx / l) * 18, wrist[1] + (dy / l) * 18]) };
  };
  /** Yakın taraf zinciri. */
  const near = (key: string, pieces: (Piece | null)[]) => (
    <Chain key={key} id={key} pieces={pieces} fill={skin} edge={edge} />
  );
  /** Uzak taraf zinciri: dolgu kart rengi, ayrımı hat taşıyor. */
  const far = (key: string, pieces: (Piece | null)[]) => (
    <Chain key={key} id={key} pieces={pieces} fill={skinFar} edge={edgeFar} />
  );
  /**
   * Dambıl: kısa sap, iki ucunda ağırlık. Ön kola DİK duruyor — elin
   * kavradığı yön bu. Barbell tabağını küçültmek dambıl yapmıyor; iki ayrı
   * ağırlık olduğu görünmeli.
   */
  const dumbbell = (key: string, c: Vec, from: Vec, far?: boolean) => {
    const deg = (Math.atan2(c[1] - from[1], c[0] - from[0]) * 180) / Math.PI + 90;
    const fill = far ? skinFar : metal;
    return (
      <G key={key} transform={`rotate(${deg} ${c[0]} ${c[1]})`}>
        <Rect x={c[0] - 17} y={c[1] - 4} width={34} height={8} rx={4} fill={fill} stroke={line} />
        <Rect x={c[0] - 25} y={c[1] - 13} width={13} height={26} rx={4} fill={fill} stroke={colors.p} strokeWidth={1.5} />
        <Rect x={c[0] + 12} y={c[1] - 13} width={13} height={26} rx={4} fill={fill} stroke={colors.p} strokeWidth={1.5} />
      </G>
    );
  };
  /**
   * Halter tabağı. Dış disk SAYDAM: 50px yarıçapla kafanın önüne geldiğinde
   * onu tamamen örterdi, saydamlık kafanın konumunu görünür bırakıyor. Kenar
   * çizgisi tam opak kalıyor ki tabağın sınırı belirsizleşmesin.
   *
   * Saydamlık kararı editörde alınmıştı (rig 1c7c1a17) ama buraya hiç
   * taşınmamıştı; tabak kafadan sonra çizilmeye başlayınca kafa tamamen
   * kayboldu. Sayılar editörün `plate`'iyle birebir aynı olmak zorunda —
   * çizim iki yerde ayrı yazılıyor, görünüm ayrışamaz.
   */
  const plate = (c: Vec | null) =>
    c ? (
      <G key="plate">
        <Circle cx={c[0]} cy={c[1]} r={50} fill={metal} fillOpacity={0.62} stroke={colors.p} strokeWidth={2} />
        <Circle cx={c[0]} cy={c[1]} r={38} fill="none" stroke={line} strokeWidth={1.5} opacity={0.8} />
        <Circle cx={c[0]} cy={c[1]} r={11} fill={joint} stroke={colors.p} strokeWidth={2} />
      </G>
    ) : null;

  const label = phase.tr;

  const body =
    plane === 'front' ? (
      <FrontBody rig={rig} p={p} S={S} colors={{ skin, joint, line, edge, metal, floorC, accent: colors.p }} />
    ) : (
      <>
        {/* KATMAN yan: floor */}
        <G key="floor">
          <Ellipse
            cx={farLeg ? (S.ankle[0] + S.ankleF[0]) / 2 + 6 : S.ankle[0] + 6}
            cy={GROUND + 4}
            rx={farLeg ? 92 : 62}
            ry={12}
            fill={floorC}
            opacity={0.25}
          />
          <Line x1={S0.pelvis[0] - 220} y1={GROUND} x2={S0.pelvis[0] + 280} y2={GROUND} stroke={floorC} strokeWidth={2} />
        </G>
        {/* Uzak uzuvlar. Gizlemek yalnızca çizimi etkiler — iskelet, yere
            oturma ve kadraj değişmez, figür kımıldamaz. */}
        {/* Uzak taraf: uzuvlar, EL ve elin taşıdığı ağırlık — hepsi gövdeden
            ÖNCE, çünkü hepsi figürün arkasında kalıyor. El ve dambıl önceden
            en sona, gövdenin üstüne çiziliyordu; uzak dambıl gövdenin önünde
            belirdiği için yakın el iki ağırlık tutuyormuş gibi görünüyordu. */}
        <G key="far" opacity={0.95}>
          {/* KATMAN yan: fleg */}
          {farLeg &&
            far('fleg', [
              { key: 'ffoot', d: footPath(S.ankleF, footDirFarOf(rig, p), pinToe, flip) },
              ...limb('ft', S.hipF, S.kneeF, 38, 30, 24, 0.42, 'thigh'),
              ...limb('fs', S.kneeF, S.ankleF, 24, 25, 12, 0.34, 'shin'),
              ball('fk', S.kneeF, 12),
            ])}
          {/* KATMAN yan: farm */}
          {!rig.hideFarArm && (
            <>
              {far('farm', [
                ...limb('fu', S.shF, S.elbowF, 23, 21, 16, 0.5, 'upper'),
                ...limb('ff', S.elbowF, S.handF, 17, 17, 11, 0.3, 'fore'),
                ball('fe', S.elbowF, 9),
                ball('fw', S.handF, 9),
                hand('fh', S.handF, S.elbowF),
              ])}
              {/* KATMAN yan: dbfar */}
              {rig.load === 'dumbbell' && dumbbell('dbF', S.handF, S.elbowF, true)}
            </>
          )}
        </G>
        {/* Sahne eşyası UZAK UZUVLARDAN SONRA: uzak taraf figürün arkasında,
            eşya da onunla izleyici arasında duruyor. Basamağa çıkmada arka
            bacak kutunun ARKASINDA kalmalı, Bulgar squat'ta arka ayak
            sehpanın arkasında. Eskiden eşya en önce çiziliyordu ve uzak
            bacak onun üstüne biniyordu. */}
        {/* Sahne eşyası TEK grupta: `propShift` bir kere uygulanıyor.
            Eşya konumları iskeletten türetildiği için figür kayınca eşya da
            kayıyor; `propDx/propDy` aradaki bağı gevşetiyor. */}
        {/* KATMAN yan: props */}
        <G key="props" transform={propShift(rig)}>
          {/* Sehpa gövdenin ekseni boyunca, sırtın hemen altında çizilir: düz
              bench'te yatay, eğimli bench'te eğimli. Sabit yatay bir sehpa
              eğimli press'te sırtı boşlukta bırakıyordu. */}
          {rig.prop === 'bench' && rig.mode === 'bench' && (
            <G key="bench" transform={`rotate(${benchDeg} ${S0.pelvis[0]} ${S0.pelvis[1]})`}>
              <Rect x={S0.pelvis[0] - 70} y={S0.pelvis[1] + 24} width={330} height={20} rx={10} fill={colors.surf2} stroke={line} />
            </G>
          )}
          {rig.prop === 'bench' && rig.mode === 'bench' && (
            <G key="benchlegs">
              <Rect x={S0.pelvis[0] - 56} y={S0.pelvis[1] + 44} width={16} height={Math.max(0, GROUND - S0.pelvis[1] - 44)} fill={colors.surf2} stroke={line} />
              <Rect x={S0.thorax[0] + 40} y={S0.thorax[1] + 44} width={16} height={Math.max(0, GROUND - S0.thorax[1] - 44)} fill={colors.surf2} stroke={line} />
            </G>
          )}
          {/* Hip thrust: omuzların dayandığı sehpa. Çizilmeyince figürün neye
              yaslandığı belirsiz kalıyordu. */}
          {rig.prop === 'hipbench' && (
            <G key="hipbench">
              <Rect x={S0.thorax[0] - 96} y={S0.thorax[1] + 26} width={210} height={18} rx={8} fill={colors.surf2} stroke={line} />
              <Rect x={S0.thorax[0] - 82} y={S0.thorax[1] + 44} width={16} height={Math.max(0, GROUND - S0.thorax[1] - 44)} fill={colors.surf2} stroke={line} />
              <Rect x={S0.thorax[0] + 82} y={S0.thorax[1] + 44} width={16} height={Math.max(0, GROUND - S0.thorax[1] - 44)} fill={colors.surf2} stroke={line} />
            </G>
          )}
          {/* Bulgar split squat: arka ayağın bastığı sehpa, ayağın altına çizilir. */}
          {rig.prop === 'bench' && rig.mode !== 'bench' && (
            <G key="rearbench">
              <Rect x={S0.ankleF[0] - 70} y={S0.ankleF[1] + 16} width={150} height={16} rx={8} fill={colors.surf2} stroke={line} />
              <Rect x={S0.ankleF[0] - 56} y={S0.ankleF[1] + 32} width={14} height={Math.max(0, GROUND - S0.ankleF[1] - 32)} fill={colors.surf2} stroke={line} />
            </G>
          )}
          {/* Makine koltuğu: kalçanın altında yastık, arkasında sırt dayaması.
              Lat pulldown, oturarak kürek, göğüs presi ve bacak makineleri
              buna yaslanıyor — çizilmezse figür havada oturuyor görünüyor. */}
          {(rig.prop === 'seatback' || rig.prop === 'cable' || rig.prop === 'legpad') &&
            rig.mode === 'seat' &&
            rig.cableFrom !== 'low' && (
            <G key="seatback">
              <Rect x={S0.pelvis[0] - 46} y={S0.pelvis[1] + 22} width={150} height={18} rx={8} fill={colors.surf2} stroke={line} />
              <Rect x={S0.pelvis[0] - 64} y={S0.pelvis[1] - 96} width={20} height={122} rx={8} fill={colors.surf2} stroke={line} />
              <Rect x={S0.pelvis[0] - 32} y={S0.pelvis[1] + 40} width={16} height={Math.max(0, GROUND - S0.pelvis[1] - 40)} fill={colors.surf2} stroke={line} />
            </G>
          )}
          {/* Kablo küreğinde SANDALYE yok: alçak bir sehpaya oturulur, bacaklar
              öne uzanır ve ayaklar plakaya basar. Sırt dayamalı koltuk çizmek
              hareketi göğüs destekli kürek gibi gösteriyordu. */}
          {rig.prop === 'cable' && rig.mode === 'seat' && rig.cableFrom === 'low' && (() => {
            // Ayak plakası ayağın TABAN DÜZLEMİNE oturuyor — bacak presi
            // levhasıyla aynı kural. Dik bir levha ayağı içinden geçiriyordu.
            const [heelP, toeP] = solePoints(S0.ankle, footDirOf(rig), false, facingFlip(rig.mode));
            const ux = toeP[0] - heelP[0];
            const uy = toeP[1] - heelP[1];
            const uL = Math.hypot(ux, uy) || 1;
            const a: Vec = [heelP[0] - (ux / uL) * 26, heelP[1] - (uy / uL) * 26];
            const b: Vec = [toeP[0] + (ux / uL) * 26, toeP[1] + (uy / uL) * 26];
            return (
              <G key="lowbench">
                <Rect x={S0.pelvis[0] - 54} y={S0.pelvis[1] + 22} width={128} height={16} rx={7} fill={colors.surf2} stroke={line} />
                <Rect x={S0.pelvis[0] - 24} y={S0.pelvis[1] + 38} width={16} height={Math.max(0, GROUND - S0.pelvis[1] - 38)} fill={colors.surf2} stroke={line} />
                <Path d={capsule(a, b, 8, 8)} fill={colors.surf2} stroke={line} />
                {/* Levhayı zemine bağlayan ayak: yüzey havada durmuyor. */}
                <Path d={capsule(a, [a[0], GROUND], 7, 7)} fill={colors.surf2} stroke={line} />
              </G>
            );
          })()}
          {/* Kablo istasyonu: makara, kablo ve tutamak. Bu hareketler önce
              `bar: 'hands'` taşıyordu ve elde TABAKLI HALTER çiziliyordu —
              direncin nereden geldiği görünmüyordu. Kablo onu söylüyor. */}
          {rig.prop === 'cable' && (() => {
            // Makaranın YERİ direncin yönü demek — çizim süsü değil. Göğüs
            // presine ÖNDEN kablo koymak onu kürek yapıyordu, çünkü kablo eli
            // öne çekiyordu.
            const from = rig.cableFrom ?? 'front';
            const ahead = Math.max(S.hand[0], S0.hand[0]);
            const anchor: Record<string, Vec> = {
              // Pulldown'da makaranın ALTINA oturulur, pushdown'da kolonun
              // ÖNÜNDE durulur: ayakta makarayı tepeye koymak direği figürün
              // içinden geçiriyordu.
              high: [rig.mode === 'stand' ? ahead + 90 : S0.hand[0], BAR_Y + 24],
              front: [ahead + 100, S0.hand[1]],
              low: [ahead + 110, GROUND - 34],
              back: [S0.pelvis[0] - 132, S0.sh[1]],
            };
            const [px, py] = anchor[from];
            const postY = from === 'high' ? BAR_Y : py;
            return (
              <G key="cable">
                <Rect x={px - 9} y={postY} width={18} height={Math.max(0, GROUND - postY)} rx={4} fill={colors.surf2} stroke={line} />
                {from === 'high' && (
                  <Rect
                    x={Math.min(px, S0.pelvis[0]) - 30}
                    y={BAR_Y}
                    width={Math.abs(px - S0.pelvis[0]) + 60}
                    height={16}
                    rx={6}
                    fill={colors.surf2}
                    stroke={line}
                  />
                )}
                <Circle cx={px} cy={py} r={13} fill={metal} stroke={line} />
                {/* `back` bir KOL, kablo değil: makine göğüs presinde direnci
                    taşıyan şey kaldıraç kolu, ve gövdenin arkasında kalıyor. */}
                {from === 'back' ? (
                  <Path d={capsule([px, py], [S.hand[0], S.hand[1]], 11, 9)} fill={colors.surf2} stroke={line} />
                ) : (
                  <Line x1={px} y1={py} x2={S.hand[0]} y2={S.hand[1]} stroke={metal} strokeWidth={4} strokeLinecap="round" />
                )}
                {/* Tutamak UÇTAN görünüyor: çeken çubuk gövdeye dik duruyor,
                    yandan bakınca kesiti görünür. Kabloya dik uzun bir kapsül
                    çizmek onu elde tutulan eğik bir sopaya çeviriyordu. */}
                <Circle cx={S.hand[0]} cy={S.hand[1]} r={14} fill={metal} fillOpacity={0.62} stroke={line} strokeWidth={2} />
                <Circle cx={S.hand[0]} cy={S.hand[1]} r={6} fill={colors.surf2} stroke={line} />
              </G>
            );
          })()}
          {/* Bacak makinesi yastığı: baldır rulosu ve onu koltuğa bağlayan kol.
              Yastıksız çizimde bacağın hangi yöne KUVVET UYGULADIĞI görünmüyor.
              Rulo, ayağın gittiği YÖNDE duruyor — direnç harekete karşı koyar,
              yani ekstansiyonda baldırın önünde, curl'de arkasında. */}
          {rig.prop === 'legpad' && (() => {
            const mid = skeleton(rig, poseAt(rig, 0.45).p);
            const vx0 = mid.ankle[0] - S0.ankle[0];
            const vy0 = mid.ankle[1] - S0.ankle[1];
            const vL = Math.hypot(vx0, vy0) || 1;
            const cx = S.ankle[0] + (vx0 / vL) * 22;
            const cy = S.ankle[1] + (vy0 / vL) * 22;
            return (
              <G key="legpad">
                <Path d={capsule([cx, cy], [S0.knee[0], S0.knee[1] + 34], 8, 8)} fill={colors.surf2} stroke={line} />
                <Circle cx={cx} cy={cy} r={21} fill={metal} stroke={line} />
                <Circle cx={cx} cy={cy} r={8} fill={colors.surf2} stroke={line} />
              </G>
            );
          })()}
          {/* Bacak presi MAKİNESİ: koltuk + sırt dayaması + zemine inen ayak +
              itilen platform. Yalnızca platform çizilince figür zeminin 110px
              üstünde hiçbir şeyin üstünde oturuyordu — `prop` tek değer aldığı
              için `sled` seçmek `seatback`'i düşürüyor. Bir kızak yalnızca
              bacak presinde bulunduğuna göre tek prop bütün makineyi çizer. */}
          {rig.prop === 'sled' && (() => {
            const dx = S0.thorax[0] - S0.pelvis[0];
            const dy = S0.thorax[1] - S0.pelvis[1];
            const L = Math.hypot(dx, dy) || 1;
            let nx = dy / L;
            let ny = -dx / L;
            // Bacaklar önde; sırt dayaması onların ters yönünde.
            if ((S0.knee[0] - S0.pelvis[0]) * nx + (S0.knee[1] - S0.pelvis[1]) * ny > 0) {
              nx = -nx;
              ny = -ny;
            }
            const o = 30;
            const seatA: Vec = [S0.pelvis[0] + nx * o, S0.pelvis[1] + ny * o];
            const seatB: Vec = [S0.thorax[0] + nx * o + (dx / L) * 26, S0.thorax[1] + ny * o + (dy / L) * 26];
            const padX = S0.pelvis[0] + nx * 16;
            const padY = S0.pelvis[1] + ny * 16;
            return (
              <G key="sled">
                <Path d={capsule(seatA, seatB, 22, 19)} fill={colors.surf2} stroke={line} />
                <Path d={capsule([padX, padY], [padX + 78, padY + 10], 18, 15)} fill={colors.surf2} stroke={line} />
                <Rect x={padX + 4} y={padY + 14} width={16} height={Math.max(0, GROUND - padY - 14)} fill={colors.surf2} stroke={line} />
                {/* Ayak platformu SABİT DEĞİL: sehpa ve basamak sahnenin durağan
                    parçaları ama bacak presinde kızak HAREKET EDEN parça — ayak
                    ona basılı kalır, ikisi birlikte gider. Sabit çizilince bacak
                    tekrar boyunca levhanın içinden geçiyordu. Levha itiş eksenine
                    (diz → ayak bileği) dik: gerçek makinede taban ona düz basar. */}
                {(() => {
                  // Levha ayağın TABAN DÜZLEMİNE oturuyor (`solePoints`): ayak
                  // bileğinden sabit mesafe ölçmek parmak ucunu levhanın içinde
                  // bırakıyordu. Ray levhayı koltuğun direğine bağlıyor — makine
                  // tek parça, plaka havada asılı değil.
                  const [heelP, toeP] = solePoints(S.ankle, footDirOf(rig), false, flip);
                  const sx = toeP[0] - heelP[0];
                  const sy = toeP[1] - heelP[1];
                  const sL = Math.hypot(sx, sy) || 1;
                  const tx = sx / sL;
                  const ty = sy / sL;
                  const px = -ty * flip;
                  const py = tx * flip;
                  const A: Vec = [heelP[0] - tx * 34 + px * 8, heelP[1] - ty * 34 + py * 8];
                  const B: Vec = [toeP[0] + tx * 34 + px * 8, toeP[1] + ty * 34 + py * 8];
                  const mid: Vec = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
                  return (
                    <>
                      <Path d={capsule(mid, [padX + 12, padY + 6], 7, 7)} fill={colors.surf2} stroke={line} />
                      <Path d={capsule(A, B, 15, 15)} fill={metal} stroke={line} />
                    </>
                  );
                })()}
              </G>
            );
          })()}
          {/* Step-up: ayağın çıktığı basamak. */}
          {rig.prop === 'box' && (
            <Rect
              key="box"
              x={S0.ankle[0] - 62}
              y={S0.ankle[1] + 12}
              width={150}
              height={Math.max(0, GROUND - S0.ankle[1] - 12)}
              rx={6}
              fill={colors.surf2}
              stroke={line}
            />
          )}
          {/* Barfiks barı: figür buna asılı, bu yüzden figürden ÖNCE çizilir. */}
          {rig.prop === 'bar' && (
            <G key="pullbar">
              <Rect x={S0.hand[0] - 150} y={BAR_Y - 6} width={300} height={12} rx={6} fill={metal} stroke={line} />
              <Rect x={S0.hand[0] - 150} y={BAR_Y - 6} width={12} height={54} fill={metal} stroke={line} />
              <Rect x={S0.hand[0] + 138} y={BAR_Y - 6} width={12} height={54} fill={metal} stroke={line} />
            </G>
          )}
        </G>
        {/* Gövde tek zincir: bel, göğüs, boyun ve omuz kapağı. Ayrı ayrı
            konturlanınca aralarındaki ekler gövdenin ortasından geçen iki
            çizgi olarak görünüyordu.
            Omuz yan görünümde gövdeden HEP 14px uzakta; yarıçapı 20 olan
            yuvarlak bir deltoid kapağı birleşimi zaten örtüyor. Kama
            gereksiz ve düz kenarları gövdenin üstünde çentik bırakıyordu. */}
        {/* KATMAN yan: torso */}
        {near('torso', [
          // Leğen kütlesi: Bridgman'ın üç değişmez gövde kütlesinden biri.
          // Kalça ekleminin ALTINA taşıyor ki uyluk onun üstüne binsin —
          // kütleler uç uca gelmez, geçer. Bu blok yokken bel parçası ile
          // uyluk parçası tek noktada değiyordu ve kalça gövdeden kopuk
          // görünüyordu.
          { key: 'pelvis', d: pelvisMass(S.pelvis, S.lumbar) },
          part('waist', 'lumbar', S.pelvis, S.lumbar) ?? seg('waist', S.pelvis, S.lumbar, 40, 33),
          part('rib', 'thorax', S.lumbar, S.thorax) ?? seg('rib', S.lumbar, S.thorax, 54, 46),
          part('neck', 'neck', S.thorax, S.neck) ?? seg('neck', S.thorax, S.neck, 21, 19),
          // Deltoid kapağı: yarıçap üst kolun o uçtaki yarı genişliğinden
          // (13) türetiliyor, biraz payla. 20'de kolun üstünde ayrı bir
          // yumru gibi okunuyordu — referans yandan çizimde omuz kolun
          // devamıdır, ayrı bir top değil.
          ball('sh', S.sh, 16),
        ])}
        {/* Bacak ve kol AYRI zincirler: ikisinin de gövdenin önünden geçtiği
            yerde hat isteniyor, yoksa uzuv gövdeye yapışık okunuyor. */}
        {/* KATMAN yan: nleg */}
        {near('nleg', [
          { key: 'nfoot', d: footPath(S.ankle, footDirOf(rig), pinToe, flip) },
          ...limb('t', S.pelvis, S.knee, 42, 33, 26, 0.42, 'thigh'),
          ...limb('s', S.knee, S.ankle, 26, 28, 13, 0.34, 'shin'),
          ball('k', S.knee, 13),
          ball('a', S.ankle, 9),
        ])}
        {/* Sırt üstü kiplerde profil AYNALANIYOR. Kemik açısı başı doğru yere
            koyuyor ama yüzün hangi yöne baktığını söyleyemiyor: `quad`
            (yüzükoyun) ile `bench` (sırt üstü) neredeyse aynı açıyı taşıyor,
            biri yere biri tavana bakmalı. Bkz. `facingFlip`. */}
        {/* Baş da zincirin iki geçişinden geçiyor: düz kontur yola ORTALANIR
            ve yarısı şeklin içinde kalır, yani gövdeninkinin yarı kalınlığında
            görünürdü. Dönüşüm iki geçişi birden sarıyor. */}
        {/* KATMAN yan: head */}
        <G key="head" transform={`translate(${S.head[0]} ${S.head[1]}) rotate(${p.neckA}) scale(${flip} 1)`}>
          <Path d={headProfile()} fill={edge} stroke={edge} strokeWidth={EDGE_W * 2} strokeLinejoin="round" />
          <Path d={headProfile()} fill={skin} />
        </G>
        {/* YAKIN KOL KAFADAN SONRA. Yan görünümde yakın kol izleyiciyle kafa
            arasında duruyor, yani kafayı ÖRTMELİ. Önce çizildiğinde tersi
            oluyordu: kolun kafanın önünden geçtiği altı harekette
            (hip_thrust, glute_bridge, bird_dog, dead_bug, hanging_knee_raise,
            pull_up) kafa kolun üstüne biniyor ve kol arkadan geçiyormuş gibi
            görünüyordu. */}
        {/* KATMAN yan: narm */}
        {near('narm', [
          ...limb('u', S.sh, S.elbow, 25, 22, 17, 0.5, 'upper'),
          ...limb('f2', S.elbow, S.hand, 18, 18, 12, 0.3, 'fore'),
          ball('e', S.elbow, 10),
          hand('h', S.hand, S.elbow),
        ])}
        {/* KATMAN yan: db */}
        {rig.load === 'dumbbell' && dumbbell('db', S.hand, S.elbow)}
        {/* Elde tutulan halter KAFADAN SONRA: figürün önünde duruyor, o yüzden
            en üstte. Tabak bilerek saydam — kafanın konumu içinden okunuyor
            (bkz. `plate`). Önden görünüm barı zaten en üste çiziyordu; yandan
            görünüm çizmiyordu ve aynı hareket iki görünümde ters katmanlanıyordu.
            Ölçüldü: `seated_overhead_press` t=0.80'de tabak kafa merkezinin
            24px içinde, `face_pull_standing` 4px, `lat_pulldown_seated` 2px.

            Sırt ve kalça halteri de aynı sıraya girdi: gövdenin ARKASINA
            çiziliyorlardı, oysa yakın taraftaki tabak izleyiciye en yakın
            şeydir — back squat'ta figürün önünde durur. Kural tek: halter
            nerede tutulursa tutulsun, YAKIN TABAK en üstte ve saydam. */}
        {/* KATMAN yan: plate */}
        {rig.bar && plate(S.bar)}
      </>
    );

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`Hareketin canlandırması: ${label}`}>
      <Svg viewBox={viewBox} width="100%" height={height} preserveAspectRatio="xMidYMid meet">
        {body}
      </Svg>
    </View>
  );
}

/**
 * Önden görünüm. Dikey seviyeleri yan iskeletten okur, yalnızca yanal
 * açıklığı kendi yazar — iki bacak simetrik, çömelme derinliği aynı.
 */
function FrontBody({
  rig,
  p,
  S,
  colors: c,
}: {
  rig: RigExercise;
  p: RigPose;
  S: Skeleton;
  colors: { skin: string; joint: string; line: string; edge: string; metal: string; floorC: string; accent: string };
}) {
  const F = frontPoints(rig, p, S);
  const cx = F.cx;
  const trunk = frontTrunk(F);
  const seg = (key: string, a: Vec, b: Vec, wa: number, wb: number): Piece => ({ key, d: capsule(a, b, wa, wb) });
  const ball = (key: string, q: Vec, r: number): Piece => ({ key, c: q, r });
  const limb = (key: string, a: Vec, b: Vec, wa: number, wm: number, wb: number, at: number): Piece[] => {
    const m = lerpP(a, b, at);
    return [seg(key + 'p', a, m, wa, wm), seg(key + 'd', m, b, wm, wb)];
  };
  /** Yandan görünümdeki `Chain` ile aynı sebep: parça ekleri dikiş bırakıyor. */
  const chain = (key: string, pieces: (Piece | null)[]) => (
    <Chain key={key} id={key} pieces={pieces} fill={c.skin} edge={c.edge} />
  );
  const side = (key: string, s: typeof F.L) => (
    <G key={key}>
      {chain(key + 'leg', [
        { key: 'foot', d: `M ${s.ankle[0] - 15} ${GROUND - 13} h 30 v 13 h -30 Z` },
        ...limb('t', s.hip, s.knee, 40, 32, 27, 0.42),
        ...limb('s', s.knee, s.ankle, 27, 29, 15, 0.34),
        ball('k', s.knee, 13),
        ball('a', s.ankle, 9),
      ])}
      {chain(key + 'arm', [
        ball('d', s.sh, 17),
        ...limb('u', s.sh, s.elbow, 24, 21, 17, 0.5),
        ...limb('f', s.elbow, s.hand, 18, 18, 12, 0.3),
        ball('e', s.elbow, 10),
        ball('w', s.hand, 10),
      ])}
      {rig.load === 'dumbbell' && (
        <G key="db" transform={`rotate(${(Math.atan2(s.hand[1] - s.elbow[1], s.hand[0] - s.elbow[0]) * 180) / Math.PI + 90} ${s.hand[0]} ${s.hand[1]})`}>
          <Rect x={s.hand[0] - 17} y={s.hand[1] - 4} width={34} height={8} rx={4} fill={c.metal} stroke={c.line} />
          <Rect x={s.hand[0] - 25} y={s.hand[1] - 13} width={13} height={26} rx={4} fill={c.metal} stroke={c.accent} strokeWidth={1.5} />
          <Rect x={s.hand[0] + 12} y={s.hand[1] - 13} width={13} height={26} rx={4} fill={c.metal} stroke={c.accent} strokeWidth={1.5} />
        </G>
      )}
    </G>
  );
  const bar = (key: string) =>
    F.barY === null ? null : (
      <G key={key}>
        <Rect x={cx - 152} y={F.barY - 5} width={304} height={10} rx={5} fill={c.metal} stroke={c.line} />
        <Rect x={cx - 152} y={F.barY - 48} width={15} height={96} rx={6} fill={c.metal} stroke={c.line} strokeWidth={2} />
        <Rect x={cx - 132} y={F.barY - 40} width={12} height={80} rx={5} fill={c.metal} stroke={c.line} />
        <Rect x={cx + 137} y={F.barY - 48} width={15} height={96} rx={6} fill={c.metal} stroke={c.line} strokeWidth={2} />
        <Rect x={cx + 120} y={F.barY - 40} width={12} height={80} rx={5} fill={c.metal} stroke={c.line} />
      </G>
    );

  return (
    <>
      {/* KATMAN ön: floor */}
      <G key="floor">
        <Ellipse cx={cx} cy={GROUND + 4} rx={104} ry={12} fill={c.floorC} opacity={0.25} />
        <Line x1={cx - 190} y1={GROUND} x2={cx + 190} y2={GROUND} stroke={c.floorC} strokeWidth={2} />
      </G>
      {/* KATMAN ön: barback */}
      {rig.bar === 'back' && bar('barback')}
      {/* KATMAN ön: side */}
      {side('legL', F.L)}
      {side('legR', F.R)}
      {/* Gövde de tek zincir: leğen, bel, göğüs ve boyun arasındaki ekler
          ayrı konturlanınca gövdeyi enine kesen çizgiler bırakıyor. */}
      {/* KATMAN ön: trunk */}
      {chain('trunk', [
        { key: 'pelvis', d: ellipsePath(cx, F.pelvis[1] + 8, 38, 25) },
        seg('waist', F.pelvis, F.lumbar, 66, 56),
        { key: 'rib', d: ellipsePath(cx, trunk.cy, trunk.rx, trunk.ry) },
        seg('neck', F.thorax, F.neck, 27, 24),
      ])}
      {/* Kafa ve çene TEK zincir: ayrı konturlandıklarında aralarındaki ek
          çenenin üstünden geçen bir çizgi bırakıyor, çene de gövde hattından
          farklı kalınlıkta okunuyordu. */}
      {/* KATMAN ön: head */}
      {chain('headf', [
        { key: 'skull', d: ellipsePath(F.head[0], F.head[1] - 3, 23, 27) },
        { key: 'jaw', d: `M ${F.head[0] - 17} ${F.head[1] + 6} L ${F.head[0] + 17} ${F.head[1] + 6} L ${F.head[0] + 10} ${F.head[1] + 25} L ${F.head[0] - 10} ${F.head[1] + 25} Z` },
      ])}
      {/* KATMAN ön: barhands */}
      {rig.bar === 'hands' && bar('barhands')}
    </>
  );
}

export const RIG_HEAD_R = B.headR;
export const RIG_FX = FX;
