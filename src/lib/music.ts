export type Mode = 'chords' | 'melody' | 'combined' | 'single';
export type Scale = 'major' | 'minor';
export type ChordQuality = 'diatonic' | 'major' | 'minor';
export type Role = 'chord' | 'melody';
export type Preset = 'pad' | 'pluck' | 'lead' | 'piano';
export interface Settings {
  mode: Mode;
  root: number;
  scale: Scale;
  swapped: boolean;
  wristControl: boolean;
  chordPreset: Preset;
  melodyPreset: Preset;
  volume: number;
  reverb: number;
}
export const DEFAULTS: Settings = {
  mode: 'combined',
  root: 0,
  scale: 'major',
  swapped: false,
  wristControl: true,
  chordPreset: 'pad',
  melodyPreset: 'pluck',
  volume: 0.65,
  reverb: 0.2,
};
export const ROOTS = [
  'C',
  'C♯',
  'D',
  'E♭',
  'E',
  'F',
  'F♯',
  'G',
  'A♭',
  'A',
  'B♭',
  'B',
];
export const PRESETS: { id: Preset; name: string; description: string }[] = [
  { id: 'pad', name: 'Warm Pad', description: 'Soft, spacious & sustained' },
  {
    id: 'pluck',
    name: 'Soft Pluck',
    description: 'Light, rounded & percussive',
  },
  { id: 'lead', name: 'Synth Lead', description: 'Clear, smooth & expressive' },
  {
    id: 'piano',
    name: 'Acoustic Piano',
    description: 'Sampled Salamander grand',
  },
];
const INTERVALS = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};
const DEGREES = [0, 3, 4, 5, 1];
export const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));
export function scaleNotes(
  root: number,
  scale: Scale,
  octave = 4,
  octaves = 2,
): number[] {
  return Array.from(
    { length: octaves * 7 + 1 },
    (_, i) =>
      12 * (octave + 1) +
      root +
      INTERVALS[scale][i % 7] +
      12 * Math.floor(i / 7),
  );
}
export function chordFor(
  fingers: number,
  root: number,
  scale: Scale,
  override: ChordQuality = 'diatonic',
) {
  if (!Number.isInteger(fingers) || fingers < 1 || fingers > 5) return null;
  const degree = DEGREES[fingers - 1];
  const notes = scaleNotes(root, scale, 3);
  const triad = [notes[degree], notes[degree + 2], notes[degree + 4]];
  if (override !== 'diatonic') {
    triad[1] = triad[0] + (override === 'major' ? 4 : 3);
    triad[2] = triad[0] + 7;
  }
  const third = triad[1] - triad[0],
    fifth = triad[2] - triad[0];
  const quality = fifth === 6 ? 'dim' : third === 3 ? 'm' : '';
  const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][degree];
  return {
    notes: triad,
    name: ROOTS[triad[0] % 12] + quality,
    roman: quality
      ? roman.toLowerCase() + (quality === 'dim' ? '°' : '')
      : roman,
  };
}
export const noteName = (midi: number) =>
  ROOTS[midi % 12] + (Math.floor(midi / 12) - 1);
export function noteIndex(
  x: number,
  count = 15,
  previous: number | null = null,
) {
  const position = clamp((x - 0.12) / 0.76, 0, 0.99999) * count;
  if (
    previous !== null &&
    position > previous - 0.14 &&
    position < previous + 1.14
  )
    return previous;
  return Math.floor(position);
}
export function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem('mein-settings-v1') || '{}');
    return {
      mode: ['chords', 'melody', 'combined', 'single'].includes(s.mode)
        ? s.mode
        : DEFAULTS.mode,
      root: Number.isInteger(s.root) && s.root >= 0 && s.root < 12 ? s.root : 0,
      scale: s.scale === 'minor' ? 'minor' : 'major',
      swapped: s.swapped === true,
      wristControl: s.wristControl !== false,
      chordPreset: PRESETS.some((p) => p.id === s.chordPreset)
        ? s.chordPreset
        : DEFAULTS.chordPreset,
      melodyPreset: PRESETS.some((p) => p.id === s.melodyPreset)
        ? s.melodyPreset
        : DEFAULTS.melodyPreset,
      volume: Number.isFinite(s.volume)
        ? clamp(s.volume, 0, 1)
        : DEFAULTS.volume,
      reverb: Number.isFinite(s.reverb)
        ? clamp(s.reverb, 0, 0.7)
        : DEFAULTS.reverb,
    };
  } catch {
    return { ...DEFAULTS };
  }
}
