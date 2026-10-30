import { describe, expect, it } from 'vitest';
import {
  countFingers,
  GestureInterpreter,
  mirroredX,
  roleFor,
  type Point,
  type TrackedHand,
  type TrackingFrame,
  wristTilt,
} from './gestures';

function points(fingers: number): Point[] {
  const p = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.7, z: 0 }));
  p[0] = { x: 0.5, y: 0.85, z: 0 };
  for (const [i, base] of [5, 9, 13, 17].entries()) {
    const x = 0.38 + i * 0.1;
    const ys = i < fingers ? [0.6, 0.43, 0.31, 0.2] : [0.6, 0.48, 0.57, 0.66];
    for (let j = 0; j < 4; j++) p[base + j] = { x, y: ys[j], z: 0 };
  }
  p[2] = { x: 0.31, y: 0.67, z: 0 };
  p[3] = { x: 0.24, y: 0.6, z: 0 };
  p[4] =
    fingers === 5 ? { x: 0.16, y: 0.53, z: 0 } : { x: 0.36, y: 0.68, z: 0 };
  return p;
}
function hand(fingers: number, side: 'Left' | 'Right' = 'Left'): TrackedHand {
  return { side, confidence: 0.95, points: points(fingers) };
}
function frame(capturedAt: number, hands: TrackedHand[]): TrackingFrame {
  return { capturedAt, hands, inferenceMs: 12 };
}

describe('tracking geometry', () => {
  it.each([0, 1, 2, 3, 4, 5])('recognizes %i extended fingers', (n) =>
    expect(countFingers(points(n))).toBe(n),
  );
  it('mirrors coordinates once and swaps physical hand roles', () => {
    expect(mirroredX(0.2)).toBe(0.8);
    expect(roleFor('Left', false)).toBe('chord');
    expect(roleFor('Right', false)).toBe('melody');
    expect(roleFor('Left', true)).toBe('melody');
  });
});

function tiltedHand(
  fingers: number,
  tilt: number,
  side: 'Left' | 'Right' = 'Left',
) {
  const h = hand(fingers, side),
    origin = h.points[0];
  h.points = h.points.map((p) => ({
    x: p.x,
    y: origin.y + (p.y - origin.y) * Math.cos(tilt),
    z: -(p.y - origin.y) * Math.sin(tilt),
  }));
  return h;
}
describe('wrist quality and one-hand play', () => {
  it('recognizes inward and outward depth tilt while preserving finger counts', () => {
    expect(wristTilt(tiltedHand(2, 0.6).points)).toBeGreaterThan(0.22);
    expect(wristTilt(tiltedHand(2, -0.6).points)).toBeLessThan(-0.22);
    expect(countFingers(tiltedHand(2, 0.6).points)).toBe(2);
  });
  it('debounces inward major and outward minor without dropping the held chord', () => {
    const g = new GestureInterpreter();
    g.update(frame(0, [tiltedHand(1, 0.6)]), 'combined', false, 0);
    const major = g.update(
      frame(130, [tiltedHand(1, 0.6)]),
      'combined',
      false,
      130,
    );
    expect(major.chordQuality).toBe('major');
    expect(major.fingers).toBe(1);
    for (const t of [170, 250, 390])
      g.update(frame(t, [tiltedHand(1, -0.6)]), 'combined', false, t);
    expect(g.state.chordQuality).toBe('minor');
    expect(g.state.fingers).toBe(1);
  });
  it('keeps neutral tilt jitter from changing chord quality', () => {
    const g = new GestureInterpreter();
    for (const t of [0, 130, 260, 390, 520])
      g.update(
        frame(t, [tiltedHand(1, t % 260 ? 0.15 : -0.15)]),
        'combined',
        false,
        t,
      );
    expect(g.state.chordQuality).toBe('diatonic');
  });
  it('can disable wrist changes and resets quality after hand loss', () => {
    const g = new GestureInterpreter();
    g.update(frame(0, [tiltedHand(1, 0.6)]), 'chords', false, 0);
    expect(
      g.update(frame(130, [tiltedHand(1, 0.6)]), 'chords', false, 130)
        .chordQuality,
    ).toBe('major');
    expect(
      g.update(frame(180, [tiltedHand(1, 0.6)]), 'chords', false, 180, false)
        .chordQuality,
    ).toBe('diatonic');
    g.update(frame(230, [tiltedHand(1, -0.6)]), 'chords', false, 230);
    g.update(frame(370, [tiltedHand(1, -0.6)]), 'chords', false, 370);
    expect(g.expire(621).chordQuality).toBe('diatonic');
    expect(g.state.fingers).toBe(0);
  });
  it('calibrates a neutral wrist with a preparation window and mutes chords while sampling', () => {
    const g = new GestureInterpreter();
    g.calibrate(0);
    for (const t of [1000, 1200, 1400])
      expect(
        g.update(frame(t, [tiltedHand(2, 0.4)]), 'single', false, t).fingers,
      ).toBe(0);
    expect(g.expire(2000).wristCalibration).toBe('ready');
    g.update(frame(2200, [tiltedHand(2, 0.4)]), 'single', false, 2200);
    expect(
      g.update(frame(2330, [tiltedHand(2, 0.4)]), 'single', false, 2330)
        .chordQuality,
    ).toBe('diatonic');
    g.reset(true);
    expect(g.state.wristCalibration).toBe('ready');
    g.reset();
    expect(g.state.wristCalibration).toBe('idle');
  });
  it('reports failed calibration when the selected hand is not visible', () => {
    const g = new GestureInterpreter();
    g.calibrate(0);
    expect(g.expire(2000).wristCalibration).toBe('failed');
    expect(g.state.fingers).toBe(0);
  });
  it('uses only the selected hand in one-hand mode and supports swapping', () => {
    const g = new GestureInterpreter(),
      left = hand(2),
      other = hand(1, 'Right');
    g.update(frame(0, [left, other]), 'single', false, 0);
    const result = g.update(frame(130, [left, other]), 'single', false, 130);
    expect(result.fingers).toBe(2);
    expect(result.melodySeen).toBe(false);
    expect(result.melodyIndex).toBeNull();
    g.reset();
    g.update(frame(200, [other]), 'single', true, 200);
    expect(g.update(frame(330, [other]), 'single', true, 330).fingers).toBe(1);
  });
  it('provides chord volume from the playing hand height', () => {
    const g = new GestureInterpreter(),
      lower = hand(1),
      higher = hand(1);
    for (const p of higher.points) p.y -= 0.2;
    const low = g.update(frame(0, [lower]), 'single', false, 0).chordVolume;
    const high = g.update(
      frame(130, [higher]),
      'single',
      false,
      130,
    ).chordVolume;
    expect(high).toBeGreaterThan(low);
  });
});
describe('stable musical intent', () => {
  it('debounces a chord pose for 120 ms and filters momentary flicker', () => {
    const g = new GestureInterpreter();
    expect(g.update(frame(0, [hand(1)]), 'combined', false, 0).fingers).toBe(0);
    expect(
      g.update(frame(100, [hand(1)]), 'combined', false, 100).fingers,
    ).toBe(0);
    expect(
      g.update(frame(125, [hand(1)]), 'combined', false, 125).fingers,
    ).toBe(1);
    expect(
      g.update(frame(150, [hand(2)]), 'combined', false, 150).fingers,
    ).toBe(1);
    expect(
      g.update(frame(170, [hand(1)]), 'combined', false, 170).fingers,
    ).toBe(1);
  });
  it('releases a held chord when the hand closes', () => {
    const g = new GestureInterpreter();
    g.update(frame(0, [hand(2)]), 'combined', false, 0);
    g.update(frame(130, [hand(2)]), 'combined', false, 130);
    g.update(frame(150, [hand(0)]), 'combined', false, 150);
    expect(
      g.update(frame(275, [hand(0)]), 'combined', false, 275).fingers,
    ).toBe(0);
  });
  it('expires notes after 250ms even if the worker delivers no further frames', () => {
    const g = new GestureInterpreter();
    g.update(frame(0, [hand(3)]), 'combined', false, 0);
    g.update(frame(130, [hand(3)]), 'combined', false, 130);
    expect(g.expire(380).fingers).toBe(3);
    expect(g.expire(381).fingers).toBe(0);
    expect(g.state.chordSeen).toBe(false);
  });
  it('does not resurrect sound from stale or out-of-order results', () => {
    const g = new GestureInterpreter();
    g.update(frame(100, [hand(1)]), 'combined', false, 100);
    g.update(frame(230, [hand(1)]), 'combined', false, 230);
    g.expire(600);
    expect(
      g.update(frame(250, [hand(1)]), 'combined', false, 650).fingers,
    ).toBe(0);
    expect(
      g.update(frame(220, [hand(1)]), 'combined', false, 660).fingers,
    ).toBe(0);
  });
  it('releases ambiguous duplicate handedness immediately', () => {
    const g = new GestureInterpreter();
    g.update(frame(0, [hand(1)]), 'combined', false, 0);
    g.update(frame(130, [hand(1)]), 'combined', false, 130);
    expect(
      g.update(frame(150, [hand(1), hand(2)]), 'combined', false, 150).fingers,
    ).toBe(0);
  });
  it('ignores low confidence and invalid landmark coordinates', () => {
    const g = new GestureInterpreter(),
      h = hand(1);
    h.confidence = 0.3;
    expect(g.update(frame(0, [h]), 'combined', false, 0).chordSeen).toBe(false);
    h.confidence = 0.9;
    h.points[8].x = NaN;
    expect(g.update(frame(130, [h]), 'combined', false, 130).fingers).toBe(0);
  });
  it('uses pinch hysteresis and mirrored horizontal pitch', () => {
    const g = new GestureInterpreter(),
      h = hand(1, 'Right');
    const setPinch = (ratio: number) => {
      h.points[8] = { x: 0.2, y: 0.3, z: 0 };
      h.points[4] = { x: 0.2 + ratio * 0.3, y: 0.3, z: 0 };
    };
    setPinch(0.25);
    const first = g.update(frame(0, [h]), 'melody', false, 0);
    expect(first.pinched).toBe(true);
    expect(first.melodyIndex).toBeGreaterThan(10);
    setPinch(0.45);
    expect(g.update(frame(50, [h]), 'melody', false, 50).pinched).toBe(true);
    setPinch(0.65);
    const released = g.update(frame(100, [h]), 'melody', false, 100);
    expect(released.pinched).toBe(false);
    expect(released.melodyIndex).toBeNull();
  });
  it('respects playing mode and resets all state', () => {
    const g = new GestureInterpreter();
    g.update(frame(0, [hand(2)]), 'melody', false, 0);
    expect(g.update(frame(150, [hand(2)]), 'melody', false, 150).fingers).toBe(
      0,
    );
    g.reset();
    expect(g.expire(160).chordSeen).toBe(false);
    expect(g.state.melodyIndex).toBeNull();
  });
  it('releases sound rather than exchanging identities during a label flip', () => {
    const g = new GestureInterpreter(),
      left = hand(1),
      right = hand(0, 'Right');
    for (const point of left.points) point.x -= 0.2;
    for (const point of right.points) point.x += 0.2;
    g.update(frame(0, [left, right]), 'combined', false, 0);
    expect(
      g.update(frame(130, [left, right]), 'combined', false, 130).fingers,
    ).toBe(1);
    const flipped = g.update(
      frame(150, [
        { ...left, side: 'Right' },
        { ...right, side: 'Left' },
      ]),
      'combined',
      false,
      150,
    );
    expect(flipped.fingers).toBe(0);
    expect(flipped.melodyIndex).toBeNull();
    g.update(frame(180, [left, right]), 'combined', false, 180);
    expect(
      g.update(frame(310, [left, right]), 'combined', false, 310).fingers,
    ).toBe(1);
  });
});
