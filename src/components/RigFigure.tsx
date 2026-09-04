import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';

import { hexToHsl, mix } from '@/theme/deriveColor';
import { useAppTheme } from '@/theme/ThemeContext';
import {
  B,
  BAR_Y,
  D,
  FX,
  GROUND,
  RigExercise,
  RigPose,
  Skeleton,
  Vec,
  add,
  boundsFor,
  capsule,
  footDirFor,
  footPath,
  frontPoints,
  frontTrunk,
  lerpP,
  poseAt,
  skeleton,
} from '@/utils/rig';

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
  const viewBox = useMemo(() => boundsFor(rig, plane), [rig, plane]);

  const seg = (key: string, a: Vec, b: Vec, wa: number, wb: number, far?: boolean) => (
    <Path key={key} d={capsule(a, b, wa, wb)} fill={far ? skinFar : skin} stroke={line} strokeWidth={1} />
  );
  const ball = (key: string, c: Vec, r: number, far?: boolean) => (
    <Circle key={key} cx={c[0]} cy={c[1]} r={r} fill={far ? skinFar : joint} stroke={line} strokeWidth={1} />
  );
  // Kütle formu taşır: uyluk ve baldır üst üçte birinde, pazu ortada kalın.
  const limb = (key: string, a: Vec, b: Vec, wa: number, wm: number, wb: number, at: number, far?: boolean) => {
    const m = lerpP(a, b, at);
    return (
      <G key={key}>
        {seg(key + 'p', a, m, wa, wm, far)}
        {seg(key + 'd', m, b, wm, wb, far)}
      </G>
    );
  };
  const oval = (key: string, c: Vec, rx: number, ry: number, deg?: number) => (
    <Ellipse
      key={key}
      cx={c[0]}
      cy={c[1]}
      rx={rx}
      ry={ry}
      fill={skin}
      stroke={line}
      {...(deg === undefined ? {} : { transform: `rotate(${deg} ${c[0]} ${c[1]})` })}
    />
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
  const plate = (c: Vec | null) =>
    c ? (
      <G key="plate">
        <Circle cx={c[0]} cy={c[1]} r={50} fill={metal} stroke={colors.p} strokeWidth={2} />
        <Circle cx={c[0]} cy={c[1]} r={38} fill="none" stroke={line} strokeWidth={1.5} />
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
            cx={rig.hideFarLeg ? S.ankle[0] + 6 : (S.ankle[0] + S.ankleF[0]) / 2 + 6}
            cy={GROUND + 4}
            rx={rig.hideFarLeg ? 62 : 92}
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
        <G key="far" opacity={0.95}>
          {!rig.hideFarLeg && (
            <>
              <Path d={footPath(S.ankleF, footDirFor(rig.mode), pinToe)} fill={skinFar} stroke={line} />
              {limb('ft', S.hipF, S.kneeF, 38, 30, 24, 0.42, true)}
              {limb('fs', S.kneeF, S.ankleF, 24, 25, 12, 0.34, true)}
              {ball('fk', S.kneeF, 12, true)}
            </>
          )}
          {!rig.hideFarArm && (
            <>
              {limb('fu', S.shF, S.elbowF, 23, 21, 16, 0.5, true)}
              {limb('ff', S.elbowF, S.handF, 17, 17, 11, 0.3, true)}
              {ball('fe', S.elbowF, 9, true)}
              {ball('fh', S.handF, 9, true)}
            </>
          )}
        </G>
        {rig.bar === 'back' && plate(S.bar)}
        <G key="torso">
          {oval('pelv', add(S.pelvis, D(p.torso), 12), 25, 21, p.torso)}
          {seg('waist', S.pelvis, S.lumbar, 40, 33)}
          {oval('rib', lerpP(S.lumbar, S.thorax, 0.55), 27, 47, p.thoraxA)}
          {seg('neck', S.thorax, S.neck, 21, 19)}
          {ball('delt', S.sh, 17)}
        </G>
        <G key="near">
          <Path d={footPath(S.ankle, footDirFor(rig.mode), pinToe)} fill={skin} stroke={line} />
          {limb('t', S.pelvis, S.knee, 42, 33, 26, 0.42)}
          {limb('s', S.knee, S.ankle, 26, 28, 13, 0.34)}
          {ball('k', S.knee, 13)}
          {ball('a', S.ankle, 9)}
          {limb('u', S.sh, S.elbow, 25, 22, 17, 0.5)}
          {limb('f2', S.elbow, S.hand, 18, 18, 12, 0.3)}
          {ball('e', S.elbow, 10)}
        </G>
        {rig.bar === 'hands' && plate(S.bar)}
        <G key="hands">
          <Circle cx={S.hand[0]} cy={S.hand[1]} r={10} fill={skin} stroke={line} />
          {!rig.hideFarArm && <Circle cx={S.handF[0]} cy={S.handF[1]} r={9} fill={skinFar} stroke={line} />}
        </G>
        {rig.load === 'dumbbell' && !rig.hideFarArm && dumbbell('dbF', S.handF, S.elbowF, true)}
        {rig.load === 'dumbbell' && dumbbell('db', S.hand, S.elbow)}
        <G key="head" transform={`rotate(${p.neckA} ${S.head[0]} ${S.head[1]})`}>
          <Ellipse cx={S.head[0]} cy={S.head[1] - 3} rx={23} ry={26} fill={skin} stroke={line} />
          <Path
            d={`M ${S.head[0] - 4} ${S.head[1] + 4} L ${S.head[0] + 21} ${S.head[1] + 6} L ${S.head[0] + 14} ${S.head[1] + 23} L ${S.head[0] - 8} ${S.head[1] + 22} Z`}
            fill={skin}
            stroke={line}
          />
        </G>
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
