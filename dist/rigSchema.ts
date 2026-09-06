// ÜRETİLMİŞ DOSYA — elle düzenleme.
// Kaynak: antrenman-simulatoru v1.0.0 (26eff06+kirli), 2026-09-06T09:05:48.363Z
// Değişiklik orada yapılır, buraya kopyalanır. Bu dosyayı düzenlemek iki ayrı
// motor doğurur. Bütünlük kontrolü: manifest.json.

import { B, RigExercise, RigPose } from './rig';

/**
 * Kare verisinin biçim denetimi.
 *
 * `rigAudit.ts` hareketin MEKANİĞİNİ denetler; burası verinin ŞEKLİNİ. İkisi
 * ayrı sorular: mekanik denetim, elinde düzgün biçimli bir hareket olduğunu
 * varsayar — `mode: "supin"` yazan bir JSON ona hiç ulaşamaz, `CONTACTS[mode]`
 * `undefined` gelir ve motor `undefined.length` ile patlar.
 *
 * Kurallar tek yerde çünkü iki yerden okunuyorlar: yüklerken (`archetypes.ts`,
 * yani testler) ve kaydederken (editör sunucusu). Ayrı yazılsalardı editör
 * testlerin reddettiği veriyi diske yazabilirdi — nitekim yazabiliyordu.
 */

const MODES = ['stand', 'quad', 'bench', 'supine', 'hang'];
const ARMS = ['angles', 'ik', 'floor'];
const BARS = ['back', 'hands', 'hips'];
const PROPS = ['bench', 'box', 'bar', 'hipbench'];
const LOADS = ['barbell', 'dumbbell'];
const VIEWS = ['side', 'front'];

/** `fillPose` bu alanları tanıyor; gerisi sessizce yok sayılırdı. */
const POSE_KEYS: (keyof RigPose)[] = [
  'shinA', 'thighA', 'torso', 'thoraxA', 'neckA', 'upperA', 'foreA',
  'hx', 'hy', 'thighF', 'shinF', 'upperF', 'foreF', 'hxF', 'shLift', 'ankleLift',
];

const EXERCISE_KEYS = ['mode', 'arm', 'bar', 'bend', 'dur', 'load', 'hideFarLeg', 'hideFarArm', 'view', 'prop', 'note', 'kf'];

/**
 * Bir tekrarın en kısa süresi (ms). Testler de bunu okuyor: editörün daha
 * gevşek davranması, orada kaydedilip burada düşen veri demekti.
 */
export const MIN_DUR = 2000;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Bulunan her kusuru döndürür — ilkinde durmaz. Elle düzenlenmiş bir dosyada
 * hataları teker teker keşfetmek, hepsini bir kerede görmekten yavaş.
 */
export function validateArchetypes(data: unknown): string[] {
  const errs: string[] = [];
  if (!isObj(data)) return ['kök nesne bekleniyor'];
  const keys = Object.keys(data);
  if (keys.length === 0) return ['boş veri — en az bir arketip olmalı'];

  keys.forEach((key) => {
    const e = data[key];
    const bad = (msg: string) => errs.push(`${key}: ${msg}`);
    if (!isObj(e)) return bad('nesne değil');

    Object.keys(e).forEach((k) => {
      if (!EXERCISE_KEYS.includes(k)) bad(`bilinmeyen alan "${k}"`);
    });

    if (!MODES.includes(e.mode as string)) bad(`mode "${String(e.mode)}" geçersiz (${MODES.join(', ')})`);
    if (!ARMS.includes(e.arm as string)) bad(`arm "${String(e.arm)}" geçersiz (${ARMS.join(', ')})`);
    if (e.bar !== null && !BARS.includes(e.bar as string)) bad(`bar "${String(e.bar)}" geçersiz (null, ${BARS.join(', ')})`);
    if (e.bend !== 1 && e.bend !== -1) bad(`bend ${String(e.bend)} geçersiz (+1 ya da -1)`);
    if (!num(e.dur) || e.dur <= MIN_DUR) bad(`dur ${String(e.dur)} geçersiz (${MIN_DUR}ms üstü olmalı)`);
    if (e.load !== undefined && !LOADS.includes(e.load as string)) bad(`load "${String(e.load)}" geçersiz`);
    if (e.prop !== undefined && e.prop !== null && !PROPS.includes(e.prop as string)) bad(`prop "${String(e.prop)}" geçersiz`);
    if (e.view !== undefined && !VIEWS.includes(e.view as string)) bad(`view "${String(e.view)}" geçersiz`);
    if (e.note !== undefined && typeof e.note !== 'string') bad('note metin olmalı');
    (['hideFarLeg', 'hideFarArm'] as const).forEach((k) => {
      if (e[k] !== undefined && typeof e[k] !== 'boolean') bad(`${k} doğru/yanlış olmalı`);
    });

    if (!Array.isArray(e.kf)) return bad('kf dizisi yok');
    if (e.kf.length < 2) bad('en az iki kare olmalı');

    e.kf.forEach((k: unknown, i: number) => {
      if (!isObj(k)) return bad(`kf[${i}] nesne değil`);
      if (!num(k.t) || k.t < 0 || k.t > 1) bad(`kf[${i}].t ${String(k.t)} geçersiz (0..1)`);
      if (typeof k.tr !== 'string') bad(`kf[${i}].tr metin olmalı`);
      if (!isObj(k.p)) return bad(`kf[${i}].p nesne değil`);
      Object.entries(k.p).forEach(([f, v]) => {
        if (!POSE_KEYS.includes(f as keyof RigPose)) bad(`kf[${i}].p bilinmeyen alan "${f}"`);
        else if (!num(v)) bad(`kf[${i}].p.${f} sayı olmalı`);
      });
    });

    // Uçlar döngünün tanımı: hareket sonsuz dönüyor, t=1 ile t=0 aynı ana
    // denk gelmezse her tekrarın başında figür zıplıyor.
    const first = e.kf[0] as { t?: unknown };
    const last = e.kf[e.kf.length - 1] as { t?: unknown };
    if (first && first.t !== 0) bad(`ilk kare t=${String(first.t)}, 0 olmalı`);
    if (last && last.t !== 1) bad(`son kare t=${String(last.t)}, 1 olmalı`);
    for (let i = 1; i < e.kf.length; i++) {
      const a = (e.kf[i - 1] as { t: number }).t;
      const b = (e.kf[i] as { t: number }).t;
      if (num(a) && num(b) && b < a) bad(`kf[${i}] zamanı geriye gidiyor (${a} → ${b})`);
    }

    // Topuk kalkışı ayağın boyuyla sınırlı; basamakta yükselten şey ayak değil.
    if (e.mode === 'stand' && e.prop !== 'box') {
      e.kf.forEach((k: unknown, i: number) => {
        const lift = isObj(k) && isObj(k.p) ? k.p.ankleLift : undefined;
        if (num(lift) && (lift < 0 || lift > B.foot)) bad(`kf[${i}].p.ankleLift ${lift} sınır dışı (0..${B.foot})`);
      });
    }
  });

  return errs;
}

/** Geçersiz veriyle devam etmek anlamsız: motor birkaç satır sonra patlıyor. */
export function assertArchetypes(data: unknown): Record<string, RigExercise> {
  const errs = validateArchetypes(data);
  if (errs.length) throw new Error(`rigArchetypes.json geçersiz:\n  ${errs.join('\n  ')}`);
  return data as Record<string, RigExercise>;
}
