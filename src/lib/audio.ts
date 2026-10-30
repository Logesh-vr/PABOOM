import * as Tone from 'tone';
import { type Preset, type Role } from './music';

type Voice = Tone.PolySynth | Tone.Sampler;
interface Channel {
  voice: Voice | null;
  gain: Tone.Gain;
  active: Set<number>;
  preset: Preset | null;
  revision: number;
}
export const PIANO_FILES = Object.fromEntries(
  [3, 4, 5]
    .flatMap((o) =>
      [
        ['C', 'C'],
        ['D#', 'Ds'],
        ['F#', 'Fs'],
        ['A', 'A'],
      ].map(([note, file]) => [`${note}${o}`, `${file}${o}.mp3`]),
    )
    .concat([['C6', 'C6.mp3']]),
);

/** One graph, two independently voiced channels, no camera or React dependencies. */
export class InstrumentAudio {
  private channels: Record<Role, Channel> | null = null;
  private master: Tone.Gain | null = null;
  private reverb: Tone.Reverb | null = null;
  private limiter: Tone.Limiter | null = null;
  private analyser: Tone.Analyser | null = null;
  private startPromise: Promise<void> | null = null;
  private volume = 0.65;
  private wet = 0.2;
  private disposed = false;
  async start() {
    if (this.disposed)
      throw new Error('The audio session has ended. Reload to start again.');
    if (!this.startPromise) {
      Tone.setContext(
        new Tone.Context({
          latencyHint: 'interactive',
          lookAhead: 0.015,
          updateInterval: 0.01,
        }),
      );
      this.startPromise = Tone.start()
        .then(async () => {
          this.master = new Tone.Gain(this.volume);
          this.reverb = new Tone.Reverb({
            decay: 1.6,
            preDelay: 0.01,
            wet: this.wet,
          });
          this.limiter = new Tone.Limiter(-1).toDestination();
          this.reverb.connect(this.master);
          this.master.connect(this.limiter);
          this.analyser = new Tone.Analyser('waveform', 1024);
          this.limiter.connect(this.analyser);
          const make = (): Channel => ({
            voice: null,
            gain: new Tone.Gain(0.65).connect(this.reverb!),
            active: new Set(),
            preset: null,
            revision: 0,
          });
          this.channels = { chord: make(), melody: make() };
          await this.reverb.ready;
        })
        .catch((error) => {
          this.startPromise = null;
          throw error;
        });
    }
    await this.startPromise;
    await Tone.start();
  }
  async setPreset(role: Role, preset: Preset) {
    if (!this.channels) throw new Error('Start audio first.');
    const channel = this.channels[role];
    if (channel.preset === preset && channel.voice) return;
    const revision = ++channel.revision;
    this.release(role);
    channel.voice?.dispose();
    channel.voice = null;
    channel.preset = null;
    let voice: Voice;
    if (preset === 'piano') {
      let sampler: Tone.Sampler | undefined;
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(
            () =>
              reject(
                new Error(
                  'Piano loading timed out. Retry or choose a synth sound.',
                ),
              ),
            15000,
          );
          sampler = new Tone.Sampler({
            urls: PIANO_FILES,
            baseUrl: `${import.meta.env.BASE_URL}audio/piano/`,
            attack: 0.005,
            release: 0.35,
            onload: () => {
              clearTimeout(timer);
              resolve();
            },
            onerror: () => {
              clearTimeout(timer);
              reject(
                new Error(
                  'Piano samples could not load. Retry or choose a synth sound.',
                ),
              );
            },
          });
        });
        voice = sampler!;
      } catch (error) {
        sampler?.dispose();
        throw error;
      }
    } else {
      voice = new Tone.PolySynth(Tone.Synth, {
        oscillator: {
          type:
            preset === 'pad'
              ? 'triangle'
              : preset === 'pluck'
                ? 'sine'
                : 'sawtooth',
        },
        envelope:
          preset === 'pad'
            ? { attack: 0.08, decay: 0.3, sustain: 0.65, release: 0.28 }
            : preset === 'pluck'
              ? { attack: 0.006, decay: 0.8, sustain: 0.12, release: 0.15 }
              : { attack: 0.025, decay: 0.18, sustain: 0.5, release: 0.12 },
        volume: preset === 'lead' ? -17 : -10,
      });
      voice.maxPolyphony = 12;
    }
    if (this.disposed || channel.revision !== revision) {
      voice.dispose();
      return;
    }
    channel.voice = voice.connect(channel.gain);
    channel.preset = preset;
  }
  setNotes(role: Role, notes: number[], volume = 0.65) {
    const c = this.channels?.[role];
    if (!c?.voice) return;
    const now = Tone.now();
    if (notes.length) this.master?.gain.rampTo(this.volume, 0.015);
    c.gain.gain.rampTo(volume, 0.04);
    const desired = new Set(notes);
    const off = [...c.active].filter((n) => !desired.has(n));
    const on = notes.filter((n) => !c.active.has(n));
    if (off.length)
      c.voice.triggerRelease(
        off.map((n) => Tone.Frequency(n, 'midi').toNote()),
        now,
      );
    if (on.length)
      c.voice.triggerAttack(
        on.map((n) => Tone.Frequency(n, 'midi').toNote()),
        now,
        0.7,
      );
    c.active = desired;
  }
  release(role: Role) {
    const c = this.channels?.[role];
    if (c) {
      c.voice?.releaseAll();
      c.active.clear();
    }
  }
  silence() {
    this.release('chord');
    this.release('melody');
    this.master?.gain.rampTo(0, 0.02);
  }
  settings(volume: number, reverb: number) {
    this.volume = volume;
    this.wet = reverb;
    this.master?.gain.rampTo(volume, 0.05);
    this.reverb?.wet.rampTo(reverb, 0.1);
  }
  stats() {
    const values = this.analyser?.getValue() as Float32Array | undefined;
    const rms = values
      ? Math.sqrt(values.reduce((sum, v) => sum + v * v, 0) / values.length)
      : 0;
    return {
      state: Tone.getContext().state,
      active: {
        chord: [...(this.channels?.chord.active || [])],
        melody: [...(this.channels?.melody.active || [])],
      },
      sampleRate: Tone.getContext().sampleRate,
      rms,
    };
  }
  dispose() {
    this.disposed = true;
    this.silence();
    if (this.channels)
      Object.values(this.channels).forEach((c) => {
        c.revision++;
        c.voice?.dispose();
        c.gain.dispose();
      });
    this.reverb?.dispose();
    this.master?.dispose();
    this.limiter?.dispose();
    this.analyser?.dispose();
  }
}
