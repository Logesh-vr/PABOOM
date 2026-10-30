import { describe, expect, it } from 'vitest';
import { chordFor, noteIndex, noteName, scaleNotes } from './music';

describe('musical mappings', () => {
  it('changes a chord quality without changing its selected root', () => {
    expect(chordFor(4, 0, 'major', 'major')?.notes).toEqual([57, 61, 64]);
    expect(chordFor(4, 0, 'major', 'major')?.name).toBe('A');
    expect(chordFor(1, 0, 'major', 'minor')?.notes).toEqual([48, 51, 55]);
    expect(chordFor(1, 0, 'major', 'minor')?.name).toBe('Cm');
    expect(chordFor(5, 9, 'minor', 'major')?.name).toBe('B');
    expect(chordFor(5, 9, 'minor', 'minor')?.name).toBe('Bm');
  });
  it('maps five poses to I, IV, V, vi, ii in C major', () => {
    expect([1, 2, 3, 4, 5].map((f) => chordFor(f, 0, 'major')?.name)).toEqual([
      'C',
      'F',
      'G',
      'Am',
      'Dm',
    ]);
    expect(chordFor(1, 0, 'major')?.notes).toEqual([48, 52, 55]);
  });
  it('harmonizes natural minor, including the diminished second degree', () => {
    expect([1, 2, 3, 4, 5].map((f) => chordFor(f, 9, 'minor')?.name)).toEqual([
      'Am',
      'Dm',
      'Em',
      'F',
      'Bdim',
    ]);
    expect(chordFor(5, 9, 'minor')?.roman).toBe('ii°');
  });
  it('generates major and minor triads in every root without out-of-range notes', () => {
    for (let root = 0; root < 12; root++)
      for (const scale of ['major', 'minor'] as const)
        for (let f = 1; f <= 5; f++) {
          const chord = chordFor(f, root, scale)!;
          expect(chord.notes).toHaveLength(3);
          expect(chord.notes.every(Number.isFinite)).toBe(true);
          expect(chord.notes[0] % 12).toBe(
            (root + [0, 5, 7, scale === 'major' ? 9 : 8, 2][f - 1]) % 12,
          );
        }
  });
  it('rejects rest and invalid finger counts', () => {
    for (const f of [-1, 0, 6, 1.5, NaN])
      expect(chordFor(f, 0, 'major')).toBeNull();
  });
  it('spans exactly two octaves with fifteen scale notes', () => {
    const notes = scaleNotes(0, 'major');
    expect(notes).toHaveLength(15);
    expect(notes[0]).toBe(60);
    expect(notes.at(-1)).toBe(84);
    expect(noteName(60)).toBe('C4');
    expect(noteName(75)).toBe('E♭5');
  });
  it('clamps the melody range and holds a note near boundaries', () => {
    expect(noteIndex(-5)).toBe(0);
    expect(noteIndex(5)).toBe(14);
    const boundary = 0.12 + (0.76 * 5) / 15;
    expect(noteIndex(boundary + 0.001, 15, 4)).toBe(4);
    expect(noteIndex(boundary + 0.02, 15, 4)).toBe(5);
  });
});
