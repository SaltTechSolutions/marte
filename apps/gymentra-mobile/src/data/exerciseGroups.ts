/**
 * How the 46 library movements are shelved for browsing (PER-19).
 *
 * Hand-written rather than generated: the grouping is an editorial call about
 * how a trainer looks for a movement ("I need a pull"), not a property of the
 * exercise, and it is read by both the library screen and the programme
 * builder's picker — which is why it does not live in either of them.
 */
export const LIBRARY_GROUPS: { label: string; ids: string[] }[] = [
  {
    label: 'ALT VÜCUT',
    ids: [
      'goblet-squat', 'back-squat', 'front-hack-squat', 'leg-press', 'rdl', 'deadlift',
      'hip-thrust', 'bulgarian-split-squat', 'walking-lunge', 'reverse-lunge', 'step-up',
      'leg-extension', 'leg-curl', 'calf-raise',
    ],
  },
  { label: 'İTİŞ', ids: ['bench-press', 'incline-press', 'machine-chest-press', 'shoulder-press'] },
  {
    label: 'ÇEKİŞ',
    ids: [
      'barbell-row', 'single-arm-row', 'chest-supported-row', 'seated-cable-row',
      'lat-pulldown', 'pullup', 'face-pull', 'reverse-fly',
    ],
  },
  { label: 'KOL · OMUZ', ids: ['lateral-raise', 'biceps-curl', 'triceps-extension', 'triceps-pushdown', 'shrug'] },
  {
    label: 'CORE',
    ids: [
      'plank', 'side-plank', 'dead-bug', 'bird-dog', 'mcgill-curl-up', 'pallof-press',
      'ab-wheel-rollout', 'hanging-knee-raise', 'suitcase-carry', 'glute-bridge',
    ],
  },
  {
    label: 'ISINMA',
    ids: ['arm-circles', 'cat-cow', 'band-pull-apart', 'band-external-rotation', 'chin-tuck', 'worlds-greatest-stretch'],
  },
];
