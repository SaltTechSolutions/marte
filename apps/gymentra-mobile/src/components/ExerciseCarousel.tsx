import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Activation, Exercise, MuscleId } from '@/data/exerciseLibrary';
import { RIG_ARCHETYPES } from '@/data/rigArchetypes';
import { useAppTheme } from '@/theme/ThemeContext';
import { keyPhases } from '@/utils/rig';

import { Card } from './Card';
import { MuscleMap, MuscleMapLegend } from './MuscleMap';
import { RigFigure } from './RigFigure';
import { Text } from './Text';

/** Slayt alanının yüksekliği: dördü de aynı kartın içinde, kart zıplamasın. */
const SLIDE_H = 340;

type SlideKey = 'motion' | 'front' | 'back' | 'phases';
const SLIDES: { key: SlideKey; title: string }[] = [
  { key: 'motion', title: 'NASIL YAPILIR' },
  { key: 'front', title: 'ÇALIŞAN KASLAR · ÖN' },
  { key: 'back', title: 'ÇALIŞAN KASLAR · ARKA' },
  { key: 'phases', title: 'BAŞLANGIÇ VE BİTİŞ' },
];
const N = SLIDES.length;

/**
 * Hareket ekranının üst kartı: yana kaydırılan, DÖNEN dört slayt.
 *
 * 1. hareketli çizim, 2. çalışan kaslar önden, 3. arkadan, 4. başlangıç ve
 * bitiş çizimi (durağan) — sonra yine 1. Kullanıcının istediği sıra
 * (2026-10-07). Kaslar ve hareket önceden iki ayrı yerdeydi: çizim sabit
 * üstte, kaslar alttaki sekmede; üye ikisini aynı anda göremiyordu ama
 * birbirinin yerine de geçmiyorlardı. Carousel tek kartta hepsini
 * kaydırarak gösteriyor, metin (adımlar) altta kaydırmadan okunuyor.
 *
 * Döngü: slaytların başına sonuncunun, sonuna ilkinin KOPYASI konuyor. Kopyaya
 * varıldığında görünmeden asıl slayta atlanıyor; kaydırma iki yönde de
 * kesintisiz dönüyor. Kopyalar durağan çiziliyor — ikinci bir animasyon
 * döngüsü çalışmasın.
 */
export function ExerciseCarousel({ exercise }: { exercise: Exercise }) {
  const { colors, spacing } = useAppTheme();
  const [w, setW] = useState(0);
  const [index, setIndex] = useState(0);
  const ref = useRef<ScrollView>(null);

  const rig = RIG_ARCHETYPES[exercise.archetype];
  const activation: Partial<Record<MuscleId, Activation>> = {};
  exercise.secondary.forEach((m) => (activation[m] = 'secondary'));
  exercise.primary.forEach((m) => (activation[m] = 'primary'));
  const [p0, p1] = keyPhases(rig);

  // Genişlik ölçülünce ilk ASIL slayta (kopyadan sonraki) git.
  useEffect(() => {
    if (w > 0) ref.current?.scrollTo({ x: w, animated: false });
  }, [w]);

  const goTo = (i: number) => {
    setIndex(i);
    ref.current?.scrollTo({ x: (i + 1) * w, animated: true });
  };

  const onSettle = (x: number) => {
    if (w <= 0) return;
    const at = Math.round(x / w);
    if (at === 0) {
      ref.current?.scrollTo({ x: N * w, animated: false });
      setIndex(N - 1);
    } else if (at === N + 1) {
      ref.current?.scrollTo({ x: w, animated: false });
      setIndex(0);
    } else {
      setIndex(at - 1);
    }
  };

  const slide = (key: SlideKey, copy: boolean, k: string) => {
    let body: React.ReactNode;
    if (key === 'motion') {
      body = <RigFigure rig={rig} muscles={exercise} height={SLIDE_H - 40} still={copy ? 0 : undefined} />;
    } else if (key === 'front' || key === 'back') {
      body = (
        <View style={{ alignItems: 'center', gap: 6 }}>
          <MuscleMap view={key} activation={activation} size={150} />
          <MuscleMapLegend />
        </View>
      );
    } else {
      const label = (i: number) => rig.kf[i].tr || (i === p0 ? 'Başlangıç' : 'Bitiş');
      body = (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[p0, p1].map((i, n) => (
            // `alignItems: 'center'` YOK: figürün SVG'si genişliğini kapsayıcıdan
            // alıyor (%100); ortalanan sütunda genişliği 0 kalıp görünmüyordu.
            <View key={i} style={{ flex: 1, gap: 4 }}>
              <RigFigure rig={rig} muscles={exercise} height={SLIDE_H - 80} still={rig.kf[i].t} />
              <Text variant="label" weight="700" tone="sub" numberOfLines={2} style={{ textAlign: 'center' }}>
                {n === 0 ? '1 · ' : '2 · '}
                {label(i)}
              </Text>
            </View>
          ))}
        </View>
      );
    }
    const title = SLIDES.find((s) => s.key === key)!.title;
    return (
      <View
        key={k}
        style={{ width: w, height: SLIDE_H, justifyContent: 'center' }}
        accessible
        accessibilityLabel={`${title}. ${SLIDES.findIndex((s) => s.key === key) + 1} / ${N}`}>
        {body}
      </View>
    );
  };

  return (
    <Card style={{ marginHorizontal: spacing.md, marginBottom: spacing.sm, gap: 8, paddingHorizontal: 0 }}>
      <Text variant="label" tone="sub" style={{ paddingHorizontal: spacing.md }}>
        {SLIDES[index].title}
      </Text>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: SLIDE_H }}>
        {w > 0 && (
          <ScrollView
            ref={ref}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => onSettle(e.nativeEvent.contentOffset.x)}
            contentOffset={{ x: w, y: 0 }}>
            {slide(SLIDES[N - 1].key, true, 'copy-last')}
            {SLIDES.map((s) => slide(s.key, false, s.key))}
            {slide(SLIDES[0].key, true, 'copy-first')}
          </ScrollView>
        )}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
        {SLIDES.map((s, i) => (
          <Pressable
            key={s.key}
            onPress={() => goTo(i)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={s.title}
            accessibilityState={{ selected: i === index }}
            style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
            <View
              style={{
                width: i === index ? 18 : 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: i === index ? colors.p : colors.surf2,
              }}
            />
          </Pressable>
        ))}
      </View>
    </Card>
  );
}
