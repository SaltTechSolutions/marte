import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';

import { hexToHsl, mix } from '@/theme/deriveColor';
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
  footDirFor,
  footPath,
  frontPoints,
  frontTrunk,
  handPath,
  headProfile,
  showFarLeg,
  lerpP,
  partTransform,
  poseAt,
  skeleton,
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

  const light = hexToHsl(colors.bg0).l > 50;
  const skin = mix(colors.surf2, colors.txt, light ? 0.42 : 0.1);
  const skinFar = mix(colors.surf2, colors.bg0, light ? -0.18 : 0.35);
  const joint = mix(colors.surf2, colors.txt, light ? 0.32 : 0.16);
  const line = colors.line;
  const metal = mix(colors.bg0, colors.txt, light ? 0.55 : 0.04);
  const floorC = mix(colors.surf, colors.txt, light ? 0.25 : 0.12);

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

  const seg = (key: string, a: Vec, b: Vec, wa: number, wb: number, far?: boolean) => (
    <Path key={key} d={capsule(a, b, wa, wb)} fill={far ? skinFar : skin} stroke={line} strokeWidth={1} />
  );
  /**
   * Eklem topu.
   *
   * Parça siluetleri kendi hacmini taşıdığı için eklemler SESSİZ: kontrastlı
   * bir daire silueti kesiyor ve figürü eklemli bir manken gibi gösteriyordu.
   * Top hâlâ çiziliyor — iki parça arasındaki boşluğu dolduruyor — ama ten
   * renginde ve dış çizgisiz.
   */
  const ball = (key: string, c: Vec, r: number, far?: boolean) => (
    <Circle key={key} cx={c[0]} cy={c[1]} r={r} fill={far ? skinFar : skin} />
  );
  /** Veri siluetini kemiğe oturtur; parça yoksa null döner. */
  const part = (key: string, name: string, a: Vec, b: Vec, far?: boolean) => {
    const q = PARTS[name];
    return q ? (
      <Path key={key} d={q.d} transform={partTransform(a, b)} fill={far ? skinFar : skin} stroke={line} strokeWidth={1} />
    ) : null;
  };
  /** Uzuv: parça varsa siluet, yoksa iki kapsül (kütle üst üçte birde). */
  const limb = (key: string, a: Vec, b: Vec, wa: number, wm: number, wb: number, at: number, far?: boolean, name?: string) => {
    if (name && PARTS[name]) return part(key, name, a, b, far);
    const m = lerpP(a, b, at);
    return (
      <G key={key}>
        {seg(key + 'p', a, m, wa, wm, far)}
        {seg(key + 'd', m, b, wm, wb, far)}
      </G>
    );
  };
  /** Gövde parçası; yoksa kapsüle düşer. */
  const trunk = (key: string, name: string, a: Vec, b: Vec, wa: number, wb: number) =>
    part(key, name, a, b) ?? seg(key, a, b, wa, wb);
  /**
   * El, ön kolun yönünde uzanır: bileği (0,0) kabul edip kemik dönüşümünü
   * kullanıyoruz, böylece elin yönü koldan geliyor — daire bunu söyleyemiyordu.
   */
  const hand = (key: string, wrist: Vec, elbow: Vec, far?: boolean) => {
    const dx = wrist[0] - elbow[0];
    const dy = wrist[1] - elbow[1];
    const l = Math.hypot(dx, dy) || 1;
    return (
      <Path
        key={key}
        d={handPath()}
        transform={partTransform(wrist, [wrist[0] + (dx / l) * 18, wrist[1] + (dy / l) * 18])}
        fill={far ? skinFar : skin}
        stroke={line}
        strokeWidth={1}
      />
    );
  };
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
      <FrontBody rig={rig} p={p} S={S} colors={{ skin, joint, line, metal, floorC, accent: colors.p }} />
    ) : (
      <>
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
        {rig.prop === 'seatback' && (
          <G key="seatback">
            <Rect x={S0.pelvis[0] - 46} y={S0.pelvis[1] + 22} width={150} height={18} rx={8} fill={colors.surf2} stroke={line} />
            <Rect x={S0.pelvis[0] - 64} y={S0.pelvis[1] - 96} width={20} height={122} rx={8} fill={colors.surf2} stroke={line} />
            <Rect x={S0.pelvis[0] - 32} y={S0.pelvis[1] + 40} width={16} height={Math.max(0, GROUND - S0.pelvis[1] - 40)} fill={colors.surf2} stroke={line} />
          </G>
        )}
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
                const ax = S.ankle[0] - S.knee[0];
                const ay = S.ankle[1] - S.knee[1];
                const aL = Math.hypot(ax, ay) || 1;
                const ux = ax / aL;
                const uy = ay / aL;
                const cx = S.ankle[0] + ux * 24;
                const cy = S.ankle[1] + uy * 24;
                const p1: Vec = [cx - uy * 62, cy + ux * 62];
                const p2: Vec = [cx + uy * 62, cy - ux * 62];
                return <Path d={capsule(p1, p2, 15, 15)} fill={metal} stroke={line} />;
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
        {/* Uzak uzuvlar. Gizlemek yalnızca çizimi etkiler — iskelet, yere
            oturma ve kadraj değişmez, figür kımıldamaz. */}
        {/* Uzak taraf: uzuvlar, EL ve elin taşıdığı ağırlık — hepsi gövdeden
            ÖNCE, çünkü hepsi figürün arkasında kalıyor. El ve dambıl önceden
            en sona, gövdenin üstüne çiziliyordu; uzak dambıl gövdenin önünde
            belirdiği için yakın el iki ağırlık tutuyormuş gibi görünüyordu. */}
        <G key="far" opacity={0.95}>
          {farLeg && (
            <>
              <Path d={footPath(S.ankleF, footDirFor(rig.mode), pinToe, flip)} fill={skinFar} stroke={line} />
              {limb('ft', S.hipF, S.kneeF, 38, 30, 24, 0.42, true, 'thigh')}
              {limb('fs', S.kneeF, S.ankleF, 24, 25, 12, 0.34, true, 'shin')}
              {ball('fk', S.kneeF, 12, true)}
            </>
          )}
          {!rig.hideFarArm && (
            <>
              {limb('fu', S.shF, S.elbowF, 23, 21, 16, 0.5, true, 'upper')}
              {limb('ff', S.elbowF, S.handF, 17, 17, 11, 0.3, true, 'fore')}
              {ball('fe', S.elbowF, 9, true)}
              {ball('fw', S.handF, 9, true)}
              {hand('fh', S.handF, S.elbowF, true)}
              {rig.load === 'dumbbell' && dumbbell('dbF', S.handF, S.elbowF, true)}
            </>
          )}
        </G>
        {/* Sırtta VE kalçada taşınan bar gövdeden önce: ikisi de figürün
            arkasından geçiyor. `hips` daha önce hiç çizilmiyordu — `hip_thrust`
            halteri olmadan görünüyordu. */}
        {(rig.bar === 'back' || rig.bar === 'hips') && plate(S.bar)}
        <G key="torso">
          {trunk('waist', 'lumbar', S.pelvis, S.lumbar, 40, 33)}
          {trunk('rib', 'thorax', S.lumbar, S.thorax, 54, 46)}
          {trunk('neck', 'neck', S.thorax, S.neck, 21, 19)}
          {/* Omuz yan görünümde gövdeden HEP 14px uzakta; yarıçapı 20 olan
              yuvarlak bir deltoid kapağı birleşimi zaten örtüyor. Kama
              gereksiz ve düz kenarları gövdenin üstünde çentik bırakıyordu. */}
          <Circle cx={S.sh[0]} cy={S.sh[1]} r={20} fill={skin} stroke={line} strokeWidth={1} />
        </G>
        <G key="near">
          <Path d={footPath(S.ankle, footDirFor(rig.mode), pinToe, flip)} fill={skin} stroke={line} />
          {limb('t', S.pelvis, S.knee, 42, 33, 26, 0.42, false, 'thigh')}
          {limb('s', S.knee, S.ankle, 26, 28, 13, 0.34, false, 'shin')}
          {ball('k', S.knee, 13)}
          {ball('a', S.ankle, 9)}
          {limb('u', S.sh, S.elbow, 25, 22, 17, 0.5, false, 'upper')}
          {limb('f2', S.elbow, S.hand, 18, 18, 12, 0.3, false, 'fore')}
          {ball('e', S.elbow, 10)}
        </G>
        {hand('h', S.hand, S.elbow)}
        {rig.load === 'dumbbell' && dumbbell('db', S.hand, S.elbow)}
        {/* Sırt üstü kiplerde profil AYNALANIYOR. Kemik açısı başı doğru yere
            koyuyor ama yüzün hangi yöne baktığını söyleyemiyor: `quad`
            (yüzükoyun) ile `bench` (sırt üstü) neredeyse aynı açıyı taşıyor,
            biri yere biri tavana bakmalı. Bkz. `facingFlip`. */}
        <G key="head" transform={`translate(${S.head[0]} ${S.head[1]}) rotate(${p.neckA}) scale(${flip} 1)`}>
          <Path d={headProfile()} fill={skin} stroke={line} strokeWidth={1} />
        </G>
        {/* Elde tutulan halter KAFADAN SONRA: figürün önünde duruyor, o yüzden
            en üstte. Tabak bilerek saydam — kafanın konumu içinden okunuyor
            (bkz. `plate`). Önden görünüm barı zaten en üste çiziyordu; yandan
            görünüm çizmiyordu ve aynı hareket iki görünümde ters katmanlanıyordu.
            Ölçüldü: `seated_overhead_press` t=0.80'de tabak kafa merkezinin
            24px içinde, `face_pull_standing` 4px, `lat_pulldown_seated` 2px. */}
        {rig.bar === 'hands' && plate(S.bar)}
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
  colors: { skin: string; joint: string; line: string; metal: string; floorC: string; accent: string };
}) {
  const F = frontPoints(rig, p, S);
  const cx = F.cx;
  const trunk = frontTrunk(F);
  const seg = (key: string, a: Vec, b: Vec, wa: number, wb: number) => (
    <Path key={key} d={capsule(a, b, wa, wb)} fill={c.skin} stroke={c.line} strokeWidth={1} />
  );
  const ball = (key: string, q: Vec, r: number) => (
    <Circle key={key} cx={q[0]} cy={q[1]} r={r} fill={c.joint} stroke={c.line} strokeWidth={1} />
  );
  const limb = (key: string, a: Vec, b: Vec, wa: number, wm: number, wb: number, at: number) => {
    const m = lerpP(a, b, at);
    return (
      <G key={key}>
        {seg(key + 'p', a, m, wa, wm)}
        {seg(key + 'd', m, b, wm, wb)}
      </G>
    );
  };
  const side = (key: string, s: typeof F.L) => (
    <G key={key}>
      <Rect x={s.ankle[0] - 15} y={GROUND - 13} width={30} height={13} rx={5} fill={c.skin} stroke={c.line} />
      {limb('t', s.hip, s.knee, 40, 32, 27, 0.42)}
      {limb('s', s.knee, s.ankle, 27, 29, 15, 0.34)}
      {ball('k', s.knee, 13)}
      {ball('a', s.ankle, 9)}
      {ball('d', s.sh, 17)}
      {limb('u', s.sh, s.elbow, 24, 21, 17, 0.5)}
      {limb('f', s.elbow, s.hand, 18, 18, 12, 0.3)}
      {ball('e', s.elbow, 10)}
      <Circle cx={s.hand[0]} cy={s.hand[1]} r={10} fill={c.skin} stroke={c.line} />
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
      <G key="floor">
        <Ellipse cx={cx} cy={GROUND + 4} rx={104} ry={12} fill={c.floorC} opacity={0.25} />
        <Line x1={cx - 190} y1={GROUND} x2={cx + 190} y2={GROUND} stroke={c.floorC} strokeWidth={2} />
      </G>
      {rig.bar === 'back' && bar('barback')}
      {side('legL', F.L)}
      {side('legR', F.R)}
      <G key="trunk">
        <Ellipse cx={cx} cy={F.pelvis[1] + 8} rx={38} ry={25} fill={c.skin} stroke={c.line} />
        {seg('waist', F.pelvis, F.lumbar, 66, 56)}
        <Ellipse cx={cx} cy={trunk.cy} rx={trunk.rx} ry={trunk.ry} fill={c.skin} stroke={c.line} />
        {seg('neck', F.thorax, F.neck, 27, 24)}
      </G>
      <G key="head">
        <Ellipse cx={F.head[0]} cy={F.head[1] - 3} rx={23} ry={27} fill={c.skin} stroke={c.line} />
        <Path
          d={`M ${F.head[0] - 17} ${F.head[1] + 6} L ${F.head[0] + 17} ${F.head[1] + 6} L ${F.head[0] + 10} ${F.head[1] + 25} L ${F.head[0] - 10} ${F.head[1] + 25} Z`}
          fill={c.skin}
          stroke={c.line}
        />
      </G>
      {rig.bar === 'hands' && bar('barhands')}
    </>
  );
}

export const RIG_HEAD_R = B.headR;
export const RIG_FX = FX;
