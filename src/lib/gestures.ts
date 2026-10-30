import {
  clamp,
  noteIndex,
  type ChordQuality,
  type Mode,
  type Role,
} from './music';

export interface Point {
  x: number;
  y: number;
  z: number;
}
export interface TrackedHand {
  side: 'Left' | 'Right';
  confidence: number;
  points: Point[];
}
export interface TrackingFrame {
  hands: TrackedHand[];
  capturedAt: number;
  inferenceMs: number;
}
export interface GestureState {
  fingers: number;
  melodyIndex: number | null;
  melodyVolume: number;
  chordSeen: boolean;
  melodySeen: boolean;
  pinched: boolean;
  chordQuality: ChordQuality;
  chordVolume: number;
  wristBend: number;
  wristCalibration: 'idle' | 'calibrating' | 'ready' | 'failed';
}
export const EMPTY_GESTURE: GestureState = {
  fingers: 0,
  melodyIndex: null,
  melodyVolume: 0.6,
  chordSeen: false,
  melodySeen: false,
  pinched: false,
  chordQuality: 'diatonic',
  chordVolume: 0.65,
  wristBend: 0,
  wristCalibration: 'idle',
};
const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
function angle(a: Point, b: Point, c: Point) {
  const ab = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const cb = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  return (
    (Math.acos(
      clamp(
        (ab.x * cb.x + ab.y * cb.y + ab.z * cb.z) /
          (Math.hypot(ab.x, ab.y, ab.z) * Math.hypot(cb.x, cb.y, cb.z) || 1),
        -1,
        1,
      ),
    ) *
      180) /
    Math.PI
  );
}
export function countFingers(p: Point[]) {
  if (p.length !== 21) return 0;
  let count = 0;
  for (const base of [5, 9, 13, 17]) {
    if (
      angle(p[base], p[base + 1], p[base + 3]) > 155 &&
      distance(p[base + 3], p[0]) > distance(p[base + 1], p[0]) * 1.12
    )
      count++;
  }
  const palm = distance(p[5], p[17]);
  if (
    angle(p[2], p[3], p[4]) > 150 &&
    distance(p[4], p[5]) > palm * 0.65 &&
    distance(p[4], p[17]) > palm * 1.15
  )
    count++;
  return count;
}
export const mirroredX = (x: number) => 1 - x;
export function roleFor(side: TrackedHand['side'], swapped: boolean): Role {
  return (side === 'Left') !== swapped ? 'chord' : 'melody';
}

/** Relative palm depth is a wrist-tilt proxy, not forearm motion capture.
 * Facing a webcam, inward/body bends move the palm away (+z); outward bends
 * move it toward the lens (-z). Palm length normalizes distance to the camera.
 */
export function wristTilt(points: Point[]) {
  const palmLength = distance(points[0], points[9]);
  if (palmLength < 0.035) return null;
  const depth =
    [5, 9, 13, 17].reduce((sum, i) => sum + points[i].z - points[0].z, 0) / 4;
  return clamp(depth / palmLength, -1, 1);
}

/** Operates on timestamps and landmarks only, independent of React and the camera. */
export class GestureInterpreter {
  state: GestureState = { ...EMPTY_GESTURE };
  private lastSeen = { chord: -Infinity, melody: -Infinity };
  private candidate = 0;
  private candidateAt = 0;
  private smoothed: { x: number; y: number } | null = null;
  private lastFrameAt = -Infinity;
  private previousHands: Partial<Record<Role, Point>> = {};
  private neutralTilt = 0;
  private smoothedTilt: number | null = null;
  private qualityCandidate: ChordQuality = 'diatonic';
  private qualityCandidateAt = 0;
  private calibrationFrom = 0;
  private calibrationUntil = 0;
  private calibrationSamples: number[] = [];
  calibrate(now: number) {
    this.calibrationFrom = now + 900;
    this.calibrationUntil = now + 1900;
    this.calibrationSamples = [];
    this.state.wristCalibration = 'calibrating';
    this.state.fingers = 0;
    this.state.chordQuality = 'diatonic';
    this.candidate = 0;
  }
  reset(keepCalibration = false) {
    const savedNeutral = this.neutralTilt;
    const savedCalibration = this.state.wristCalibration;
    this.state = { ...EMPTY_GESTURE };
    this.lastSeen = { chord: -Infinity, melody: -Infinity };
    this.candidate = 0;
    this.candidateAt = 0;
    this.smoothed = null;
    this.lastFrameAt = -Infinity;
    this.previousHands = {};
    this.neutralTilt = 0;
    this.smoothedTilt = null;
    this.qualityCandidate = 'diatonic';
    this.qualityCandidateAt = 0;
    this.calibrationUntil = 0;
    this.calibrationSamples = [];
    if (keepCalibration && savedCalibration === 'ready') {
      this.neutralTilt = savedNeutral;
      this.state.wristCalibration = 'ready';
    }
  }
  expire(now: number) {
    if (this.calibrationUntil && now >= this.calibrationUntil) {
      if (this.calibrationSamples.length >= 3) {
        const sorted = [...this.calibrationSamples].sort((a, b) => a - b);
        this.neutralTilt = sorted[Math.floor(sorted.length / 2)];
        this.state.wristCalibration = 'ready';
      } else this.state.wristCalibration = 'failed';
      this.calibrationUntil = 0;
      this.smoothedTilt = null;
    }
    if (now - this.lastSeen.chord > 250) {
      this.state.fingers = 0;
      this.state.chordSeen = false;
      this.candidate = 0;
      this.state.chordQuality = 'diatonic';
      this.state.wristBend = 0;
      this.qualityCandidate = 'diatonic';
      this.smoothedTilt = null;
      delete this.previousHands.chord;
    }
    if (now - this.lastSeen.melody > 250) {
      this.state.melodyIndex = null;
      this.state.melodySeen = false;
      this.state.pinched = false;
      this.smoothed = null;
      delete this.previousHands.melody;
    }
    return { ...this.state };
  }
  update(
    frame: TrackingFrame,
    mode: Mode,
    swapped: boolean,
    now: number,
    wristControl = true,
  ): GestureState {
    // Out-of-order or delayed results must never resurrect a voice.
    if (frame.capturedAt <= this.lastFrameAt || now - frame.capturedAt > 250)
      return this.expire(now);
    const dt = clamp(frame.capturedAt - this.lastFrameAt, 1, 100);
    this.lastFrameAt = frame.capturedAt;
    const valid = frame.hands
      .filter(
        (h) =>
          h.confidence >= 0.65 &&
          h.points.length === 21 &&
          h.points.every(
            (p) =>
              Number.isFinite(p.x) &&
              Number.isFinite(p.y) &&
              Number.isFinite(p.z),
          ),
      )
      .filter((h) =>
        mode === 'single' || mode === 'chords'
          ? roleFor(h.side, swapped) === 'chord'
          : mode === 'melody'
            ? roleFor(h.side, swapped) === 'melody'
            : true,
      );
    const chordHand = valid.find((h) => roleFor(h.side, swapped) === 'chord');
    const melodyHand = valid.find((h) => roleFor(h.side, swapped) === 'melody');
    const oldChord = this.previousHands.chord,
      oldMelody = this.previousHands.melody;
    const identityConflict =
      chordHand &&
      melodyHand &&
      oldChord &&
      oldMelody &&
      distance(chordHand.points[0], oldMelody) +
        distance(melodyHand.points[0], oldChord) +
        0.06 <
        distance(chordHand.points[0], oldChord) +
          distance(melodyHand.points[0], oldMelody);
    if (identityConflict) {
      // Keep the last reliable identities until labels recover or expire.
      this.state.fingers = 0;
      this.state.melodyIndex = null;
      this.state.pinched = false;
      this.state.chordSeen = false;
      this.state.melodySeen = false;
      this.candidate = 0;
      this.state.chordQuality = 'diatonic';
      this.qualityCandidate = 'diatonic';
      return this.expire(now);
    }
    for (const role of ['chord', 'melody'] as const) {
      const matching = valid.filter((h) => roleFor(h.side, swapped) === role);
      const hand = matching.length === 1 ? matching[0] : null;
      // Duplicate handedness and physically overlapping wrists are ambiguous.
      const overlap =
        valid.length === 2 &&
        distance(valid[0].points[0], valid[1].points[0]) < 0.09;
      const previous = this.previousHands[role];
      const jumped =
        hand && previous && distance(previous, hand.points[0]) > 0.35;
      if (!hand || overlap || jumped) {
        if (matching.length > 1 || overlap || jumped) {
          this.lastSeen[role] = -Infinity;
          if (role === 'chord') {
            this.state.fingers = 0;
            this.candidate = 0;
          } else {
            this.state.melodyIndex = null;
            this.state.pinched = false;
          }
          delete this.previousHands[role];
        }
        continue;
      }
      this.previousHands[role] = hand.points[0];
      this.lastSeen[role] = frame.capturedAt;
      if (role === 'chord') {
        this.state.chordSeen = true;
        const rawTilt = wristTilt(hand.points);
        this.state.chordVolume = clamp(1 - hand.points[9].y, 0.15, 0.95);
        if (this.calibrationUntil) {
          if (
            rawTilt !== null &&
            frame.capturedAt >= this.calibrationFrom &&
            frame.capturedAt < this.calibrationUntil
          )
            this.calibrationSamples.push(rawTilt);
          this.state.fingers = 0;
          continue;
        }
        if (wristControl && rawTilt !== null) {
          const alpha = 1 - Math.exp(-dt / 65);
          this.smoothedTilt =
            this.smoothedTilt === null
              ? rawTilt
              : this.smoothedTilt + alpha * (rawTilt - this.smoothedTilt);
          const bend = this.smoothedTilt - this.neutralTilt;
          this.state.wristBend = bend;
          let desired: ChordQuality = 'diatonic';
          if (
            bend > 0.22 ||
            (this.state.chordQuality === 'major' && bend > 0.1)
          )
            desired = 'major';
          if (
            bend < -0.22 ||
            (this.state.chordQuality === 'minor' && bend < -0.1)
          )
            desired = 'minor';
          if (desired !== this.qualityCandidate) {
            this.qualityCandidate = desired;
            this.qualityCandidateAt = frame.capturedAt;
          }
          if (frame.capturedAt - this.qualityCandidateAt >= 120)
            this.state.chordQuality = desired;
        } else {
          this.state.chordQuality = 'diatonic';
          this.state.wristBend = 0;
          this.qualityCandidate = 'diatonic';
          this.smoothedTilt = null;
        }
        const fingers = countFingers(hand.points);
        if (fingers !== this.candidate) {
          this.candidate = fingers;
          this.candidateAt = frame.capturedAt;
        }
        if (frame.capturedAt - this.candidateAt >= 120)
          this.state.fingers = fingers;
      } else {
        this.state.melodySeen = true;
        const p = hand.points,
          palm = Math.max(distance(p[5], p[17]), 0.025);
        const ratio = distance(p[4], p[8]) / palm;
        this.state.pinched = ratio < (this.state.pinched ? 0.55 : 0.35);
        const x = mirroredX((p[4].x + p[8].x) / 2),
          y = (p[4].y + p[8].y) / 2;
        const a = 1 - Math.exp(-dt / 65);
        this.smoothed = this.smoothed
          ? {
              x: this.smoothed.x + a * (x - this.smoothed.x),
              y: this.smoothed.y + a * (y - this.smoothed.y),
            }
          : { x, y };
        this.state.melodyVolume = clamp(1 - this.smoothed.y, 0.15, 0.95);
        this.state.melodyIndex = this.state.pinched
          ? noteIndex(this.smoothed.x, 15, this.state.melodyIndex)
          : null;
      }
    }
    this.expire(now);
    if (mode === 'melody') this.state.fingers = 0;
    if (mode === 'chords' || mode === 'single') {
      this.state.melodyIndex = null;
      this.state.melodySeen = false;
      this.state.pinched = false;
    }
    return { ...this.state };
  }
}
