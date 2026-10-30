import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './components/Icon';
import Stage from './components/Stage';
import { InstrumentAudio } from './lib/audio';
import { CameraSession, type CameraStats } from './lib/camera';
import {
  EMPTY_GESTURE,
  GestureInterpreter,
  type GestureState,
  type TrackingFrame,
} from './lib/gestures';
import {
  chordFor,
  loadSettings,
  noteName,
  PRESETS,
  ROOTS,
  scaleNotes,
  type Mode,
  type Preset,
  type Role,
  type Settings,
  type ChordQuality,
} from './lib/music';

const MELODY_KEYS = [
  'a',
  's',
  'd',
  'f',
  'g',
  'h',
  'j',
  'k',
  'l',
  ';',
  "'",
  'z',
  'x',
  'c',
  'v',
];
type SoundStatus = 'waiting' | 'loading' | 'ready' | 'error';
const isInput = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  !!target.closest('input,select,textarea,button,a,[contenteditable="true"]');

export default function App() {
  const [settings, setSettings] = useState(loadSettings);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [guide, setGuide] = useState(false);
  const [live, setLive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraMessage, setCameraMessage] = useState('');
  const [audioMessage, setAudioMessage] = useState('');
  const [audioReady, setAudioReady] = useState(false);
  const [soundStatus, setSoundStatus] = useState<Record<Role, SoundStatus>>({
    chord: 'waiting',
    melody: 'waiting',
  });
  const [retry, setRetry] = useState(0);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [gesture, setGesture] = useState<GestureState>({ ...EMPTY_GESTURE });
  const [playing, setPlaying] = useState<{
    fingers: number;
    melodyIndex: number | null;
    quality: ChordQuality;
  }>({ fingers: 0, melodyIndex: null, quality: 'diatonic' });
  const [stats, setStats] = useState<CameraStats>({ fps: 0, inferenceMs: 0 });
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<TrackingFrame | null>(null);
  const interpreter = useRef(new GestureInterpreter());
  const session = useRef<CameraSession | null>(null);
  const engine = useRef<InstrumentAudio | null>(null);
  if (!engine.current) engine.current = new InstrumentAudio();
  const initPromise = useRef<Promise<void> | null>(null);
  const audioReadyRef = useRef(false);
  const cameraRevision = useRef(0);
  const manualChords = useRef(new Map<string, number>());
  const manualMelody = useRef(new Map<string, number>());
  const manualBegan = useRef(new Map<string, number>());
  const manualReleased = useRef(new Map<string, { role: Role; at: number }>());
  const configureRevisions = useRef({ chord: 0, melody: 0 });
  const soundReady = useRef({ chord: false, melody: false });

  const apply = useCallback(() => {
    const now = performance.now();
    for (const [key, released] of manualReleased.current) {
      if (released.at === Infinity && soundReady.current[released.role])
        released.at = now + 110;
      if (released.at <= now) {
        manualChords.current.delete(key);
        manualMelody.current.delete(key);
        manualBegan.current.delete(key);
        manualReleased.current.delete(key);
      }
    }
    const s = settingsRef.current,
      g = interpreter.current.state;
    const chordManual = [...manualChords.current.values()].at(-1);
    const melodyManual = [...manualMelody.current.values()].at(-1);
    const fingers = s.mode === 'melody' ? 0 : (chordManual ?? g.fingers);
    const melodyIndex =
      s.mode === 'chords' || s.mode === 'single'
        ? null
        : (melodyManual ?? g.melodyIndex);
    const quality = s.wristControl ? g.chordQuality : 'diatonic';
    const chord = chordFor(fingers, s.root, s.scale, quality);
    if (audioReadyRef.current) {
      engine.current!.setNotes(
        'chord',
        soundReady.current.chord ? chord?.notes || [] : [],
        s.mode === 'single' && chordManual === undefined ? g.chordVolume : 0.65,
      );
      engine.current!.setNotes(
        'melody',
        soundReady.current.melody && melodyIndex !== null
          ? [scaleNotes(s.root, s.scale)[melodyIndex]]
          : [],
        melodyManual !== undefined ? 0.7 : g.melodyVolume,
      );
    }
    setPlaying((previous) =>
      previous.fingers === fingers &&
      previous.melodyIndex === melodyIndex &&
      previous.quality === quality
        ? previous
        : { fingers, melodyIndex, quality },
    );
  }, []);

  const silence = useCallback(() => {
    manualChords.current.clear();
    manualMelody.current.clear();
    manualBegan.current.clear();
    manualReleased.current.clear();
    interpreter.current.reset(true);
    frameRef.current = null;
    engine.current!.silence();
    setGesture({ ...EMPTY_GESTURE });
    setPlaying({ fingers: 0, melodyIndex: null, quality: 'diatonic' });
  }, []);
  const stopCamera = useCallback(() => {
    cameraRevision.current++;
    session.current?.stop();
    session.current = null;
    setLive(false);
    setCameraLoading(false);
    setStats({ fps: 0, inferenceMs: 0 });
    interpreter.current.reset();
    silence();
  }, [silence]);
  const stopAll = useCallback(() => {
    stopCamera();
    setCameraMessage('');
  }, [stopCamera]);

  const ensureAudio = useCallback(async () => {
    try {
      if (audioReadyRef.current) {
        await engine.current!.start();
        return;
      }
      if (!initPromise.current) {
        setAudioMessage('');
        initPromise.current = engine.current!.start().then(() => {
          audioReadyRef.current = true;
          setAudioReady(true);
        });
      }
      await initPromise.current;
    } catch {
      silence();
      audioReadyRef.current = false;
      setAudioReady(false);
      initPromise.current = null;
      setAudioMessage(
        'Audio could not start. Click a key or Start camera to retry.',
      );
    }
  }, [silence]);

  useEffect(() => {
    try {
      localStorage.setItem('mein-settings-v1', JSON.stringify(settings));
    } catch {
      /* Private browsing can disable storage. */
    }
    engine.current!.settings(settings.volume, settings.reverb);
  }, [settings]);

  useEffect(() => {
    let cancelled = false;
    const media = navigator.mediaDevices;
    const refresh = () => {
      void media
        ?.enumerateDevices()
        .then((list) => {
          if (!cancelled)
            setDevices(list.filter((d) => d.kind === 'videoinput'));
        })
        .catch(() => {});
    };
    refresh();
    media?.addEventListener('devicechange', refresh);
    return () => {
      cancelled = true;
      media?.removeEventListener('devicechange', refresh);
    };
  }, []);

  useEffect(() => {
    if (!audioReady) return;
    let cancelled = false;
    for (const role of ['chord', 'melody'] as const) {
      const revision = ++configureRevisions.current[role];
      const preset =
        role === 'chord' ? settings.chordPreset : settings.melodyPreset;
      soundReady.current[role] = false;
      setSoundStatus((s) => ({ ...s, [role]: 'loading' }));
      void engine
        .current!.setPreset(role, preset)
        .then(() => {
          if (cancelled || configureRevisions.current[role] !== revision)
            return;
          soundReady.current[role] = true;
          setSoundStatus((s) => ({ ...s, [role]: 'ready' }));
          apply();
        })
        .catch((error) => {
          if (cancelled || configureRevisions.current[role] !== revision)
            return;
          const held =
            role === 'chord' ? manualChords.current : manualMelody.current;
          for (const key of held.keys()) {
            manualReleased.current.delete(key);
            manualBegan.current.delete(key);
          }
          held.clear();
          apply();
          setSoundStatus((s) => ({ ...s, [role]: 'error' }));
          setAudioMessage(
            error instanceof Error ? error.message : 'Sound loading failed.',
          );
        });
    }
    return () => {
      cancelled = true;
    };
  }, [audioReady, settings.chordPreset, settings.melodyPreset, retry, apply]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = interpreter.current.expire(performance.now());
      setGesture((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
      apply();
    }, 40);
    const hide = () => {
      if (document.hidden) stopAll();
    };
    const blur = () => {
      manualChords.current.clear();
      manualMelody.current.clear();
      manualReleased.current.clear();
      manualBegan.current.clear();
      apply();
    };
    const pagehide = () => stopAll();
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('blur', blur);
    window.addEventListener('pagehide', pagehide);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('blur', blur);
      window.removeEventListener('pagehide', pagehide);
      session.current?.stop();
      engine.current?.dispose();
    };
  }, [apply, stopAll]);

  const press = useCallback(
    (role: Role, key: string, value: number) => {
      manualBegan.current.set(key, performance.now());
      manualReleased.current.delete(key);
      (role === 'chord' ? manualChords : manualMelody).current.set(key, value);
      apply();
      void ensureAudio().then(apply);
    },
    [apply, ensureAudio],
  );
  const release = useCallback(
    (key: string) => {
      const role = manualChords.current.has(key)
        ? 'chord'
        : manualMelody.current.has(key)
          ? 'melody'
          : null;
      if (!role) return;
      manualReleased.current.set(key, {
        role,
        at:
          audioReadyRef.current && soundReady.current[role]
            ? Math.max(
                performance.now(),
                (manualBegan.current.get(key) || 0) + 110,
              )
            : Infinity,
      });
      apply();
    },
    [apply],
  );

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        stopAll();
        return;
      }
      if (e.key === 'Escape') {
        setGuide(false);
        stopAll();
        return;
      }
      if (
        e.repeat ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        isInput(e.target) ||
        guide
      )
        return;
      if (/^[1-5]$/.test(e.key)) {
        e.preventDefault();
        press('chord', `key:${e.code}`, Number(e.key));
      }
      const index = MELODY_KEYS.indexOf(e.key.toLowerCase());
      if (index >= 0) {
        e.preventDefault();
        press('melody', `key:${e.code}`, index);
      }
    };
    const up = (e: KeyboardEvent) => release(`key:${e.code}`);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [press, release, stopAll, guide]);

  const startCamera = async () => {
    stopCamera();
    setCameraMessage('');
    setCameraLoading(true);
    const revision = cameraRevision.current;
    void ensureAudio();
    const current = new CameraSession(
      videoRef.current!,
      (frame) => {
        frameRef.current = frame;
        const s = settingsRef.current;
        setGesture(
          interpreter.current.update(
            frame,
            s.mode,
            s.swapped,
            performance.now(),
            s.wristControl,
          ),
        );
        apply();
      },
      (message) => {
        if (cameraRevision.current === revision) {
          stopCamera();
          setCameraMessage(message);
        }
      },
      setStats,
    );
    session.current = current;
    try {
      await current.start(deviceId || undefined);
      if (revision !== cameraRevision.current) return;
      setCameraLoading(false);
      setLive(true);
      const list = await navigator.mediaDevices.enumerateDevices();
      if (revision === cameraRevision.current)
        setDevices(list.filter((d) => d.kind === 'videoinput'));
    } catch (error) {
      if (revision !== cameraRevision.current) return;
      stopCamera();
      const name = error instanceof DOMException ? error.name : '';
      setCameraMessage(
        name === 'NotAllowedError'
          ? 'Camera permission is blocked. Allow camera access in your browser, then try again. You can still play below.'
          : name === 'NotFoundError'
            ? 'No camera found. Connect a webcam, or use the keys below.'
            : name === 'NotReadableError'
              ? 'Your camera is busy. Close other apps using it and try again.'
              : name === 'OverconstrainedError'
                ? 'That camera is no longer available. Choose another camera and start again.'
                : error instanceof Error
                  ? error.message
                  : 'The camera could not start. Please retry.',
      );
    }
  };

  function change<K extends keyof Settings>(key: K, value: Settings[K]) {
    if (!['volume', 'reverb'].includes(key)) silence();
    if (key === 'swapped') interpreter.current.reset();
    if (key === 'chordPreset' || key === 'melodyPreset') setAudioMessage('');
    setSettings((s) => ({ ...s, [key]: value }));
  }
  const chord = chordFor(
    playing.fingers,
    settings.root,
    settings.scale,
    playing.quality,
  );
  const notes = scaleNotes(settings.root, settings.scale);
  const melody =
    playing.melodyIndex === null ? null : notes[playing.melodyIndex];
  const chordEnabled = settings.mode !== 'melody',
    melodyEnabled = settings.mode !== 'chords' && settings.mode !== 'single';
  const pointer = (role: Role, value: number) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      press(role, `pointer:${e.pointerId}`, value);
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) =>
      release(`pointer:${e.pointerId}`),
    onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) =>
      release(`pointer:${e.pointerId}`),
    onLostPointerCapture: (e: React.PointerEvent<HTMLButtonElement>) =>
      release(`pointer:${e.pointerId}`),
    onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'Enter' && !e.repeat)
        press(role, `button:${role}:${value}`, value);
    },
    onKeyUp: (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'Enter') release(`button:${role}:${value}`);
    },
    onBlur: () => release(`button:${role}:${value}`),
  });

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Mein Instrument home">
          <span className="brand-mark">m.</span>
          <span>
            mein<span className="brand-light"> instrument</span>
            <small>MUSIC IN YOUR HANDS</small>
          </span>
        </a>
        <div className="header-right">
          <span className="local-label">
            <span className="status-dot on" /> LOCAL SESSION
          </span>
          <button
            className="text-button"
            onClick={() => {
              stopAll();
              setGuide(true);
            }}
          >
            <Icon name="help" />
            How to play
          </button>
          <button className="stop-button" onClick={stopAll}>
            <Icon name="stop" size={15} />
            Stop<span className="shortcut">SPACE</span>
          </button>
        </div>
      </header>
      <main>
        <div className="page-intro">
          <div>
            <span className="eyebrow">THE EVERYDAY, REIMAGINED</span>
            <h1>
              Make room for <em>play.</em>
            </h1>
          </div>
          <p>
            A small gesture. A new way to make music.
            <br />
            <span>Find your sound, then follow your hands.</span>
          </p>
        </div>
        <div className="instrument-layout">
          <section
            className="stage-section"
            aria-label="Camera performance stage"
          >
            <Stage
              videoRef={videoRef}
              frameRef={frameRef}
              live={live}
              loading={cameraLoading}
              mode={settings.mode}
              primaryHand={settings.swapped ? 'Right' : 'Left'}
              wristLabel={
                settings.wristControl
                  ? gesture.wristCalibration === 'calibrating'
                    ? 'Hold your wrist upright…'
                    : playing.quality === 'major'
                      ? 'INWARD · MAJOR'
                      : playing.quality === 'minor'
                        ? 'OUTWARD · MINOR'
                        : 'NEUTRAL · SCALE CHORDS'
                  : undefined
              }
              chord={chord?.name || null}
              melody={melody}
              fps={stats.fps}
              inferenceMs={stats.inferenceMs}
              onStart={() => void startCamera()}
              onStop={stopCamera}
              onGuide={() => {
                stopAll();
                setGuide(true);
              }}
            />
            <div className="stage-caption">
              <span>
                <span className="status-dot" />{' '}
                {live
                  ? gesture.chordSeen || gesture.melodySeen
                    ? 'Hands in view. You’re ready to play.'
                    : 'Raise your hands into the frame.'
                  : 'Good light + a little space = a better session.'}
              </span>
              <span>100% ON-DEVICE</span>
            </div>
            {chordEnabled && (
              <div className="wrist-controls">
                <label className="wrist-toggle" htmlFor="wrist-control">
                  <span>Wrist chords</span>
                  <input
                    id="wrist-control"
                    type="checkbox"
                    checked={settings.wristControl}
                    onChange={(e) => change('wristControl', e.target.checked)}
                  />
                </label>
                <p>
                  Bend inward → major
                  <br />
                  Bend outward → minor
                </p>
                {settings.wristControl && (
                  <>
                    <span className={`wrist-quality ${playing.quality}`}>
                      {gesture.wristCalibration === 'calibrating'
                        ? 'Hold your wrist upright…'
                        : playing.quality === 'major'
                          ? 'Inward · major'
                          : playing.quality === 'minor'
                            ? 'Outward · minor'
                            : 'Neutral · scale chords'}
                    </span>
                    <button
                      className="calibrate-wrist"
                      disabled={
                        !live || gesture.wristCalibration === 'calibrating'
                      }
                      onClick={() => {
                        silence();
                        interpreter.current.calibrate(performance.now());
                        setGesture({ ...interpreter.current.state });
                      }}
                    >
                      Set neutral wrist
                    </button>
                    {gesture.wristCalibration === 'ready' && (
                      <small>
                        Neutral position set for this camera session.
                      </small>
                    )}
                    {gesture.wristCalibration === 'failed' && (
                      <small role="status">
                        Keep your playing hand visible and try again.
                      </small>
                    )}
                    {!live && (
                      <small>Start the camera to set your neutral wrist.</small>
                    )}
                  </>
                )}
              </div>
            )}
          </section>
          <aside className="control-panel" aria-label="Instrument settings">
            <div className="panel-heading">
              <span className="eyebrow">YOUR INSTRUMENT</span>
              <span className="panel-number">01 /</span>
            </div>
            <label className="field-label">Playing mode</label>
            <div className="mode-tabs" role="group" aria-label="Playing mode">
              {(['chords', 'melody', 'combined', 'single'] as Mode[]).map(
                (mode) => (
                  <button
                    key={mode}
                    aria-pressed={settings.mode === mode}
                    className={settings.mode === mode ? 'selected' : ''}
                    onClick={() => change('mode', mode)}
                  >
                    {mode === 'combined'
                      ? 'Both hands'
                      : mode === 'single'
                        ? 'One hand'
                        : mode[0].toUpperCase() + mode.slice(1)}
                  </button>
                ),
              )}
            </div>
            <div className="hand-roles">
              <div>
                <span
                  className={`hand-dot ${gesture.chordSeen ? 'detected' : ''}`}
                />
                {settings.swapped ? 'RIGHT' : 'LEFT'}{' '}
                <strong>{chordEnabled ? 'Chords' : 'Rest'}</strong>
              </div>
              <button
                className="swap"
                onClick={() => change('swapped', !settings.swapped)}
                aria-label={
                  settings.mode === 'single'
                    ? 'Change the playing hand'
                    : 'Swap chord and melody hands'
                }
                title={
                  settings.mode === 'single'
                    ? 'Use the other hand'
                    : 'Swap hands'
                }
              >
                <Icon name="swap" size={15} />
              </button>
              <div>
                <span
                  className={`hand-dot ${gesture.melodySeen ? 'detected' : ''}`}
                />
                {settings.swapped ? 'LEFT' : 'RIGHT'}{' '}
                <strong>{melodyEnabled ? 'Melody' : 'Rest'}</strong>
              </div>
            </div>
            {settings.mode === 'single' && (
              <p className="one-hand-note">
                Only your {settings.swapped ? 'right' : 'left'} hand plays.
                Fingers choose the chord; raise your hand for volume. The other
                hand can rest.
              </p>
            )}

            <div className="rule" />
            <div className="sound-field">
              <label htmlFor="chord-sound" className="field-label">
                Chord sound{' '}
                <span>{settings.swapped ? 'RIGHT HAND' : 'LEFT HAND'}</span>
              </label>
              <select
                id="chord-sound"
                value={settings.chordPreset}
                onChange={(e) =>
                  change('chordPreset', e.target.value as Preset)
                }
              >
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <small>
                {soundStatus.chord === 'loading'
                  ? 'Loading sound…'
                  : soundStatus.chord === 'error'
                    ? 'Could not load sound'
                    : PRESETS.find((p) => p.id === settings.chordPreset)
                        ?.description}
              </small>
            </div>
            <div className="sound-field">
              <label htmlFor="melody-sound" className="field-label">
                Melody sound{' '}
                <span>{settings.swapped ? 'LEFT HAND' : 'RIGHT HAND'}</span>
              </label>
              <select
                id="melody-sound"
                disabled={!melodyEnabled}
                value={settings.melodyPreset}
                onChange={(e) =>
                  change('melodyPreset', e.target.value as Preset)
                }
              >
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <small>
                {soundStatus.melody === 'loading'
                  ? 'Loading sound…'
                  : soundStatus.melody === 'error'
                    ? 'Could not load sound'
                    : PRESETS.find((p) => p.id === settings.melodyPreset)
                        ?.description}
              </small>
            </div>
            <div className="key-fields">
              <div>
                <label htmlFor="tonic" className="field-label">
                  Key
                </label>
                <select
                  id="tonic"
                  value={settings.root}
                  onChange={(e) => change('root', Number(e.target.value))}
                >
                  {ROOTS.map((r, i) => (
                    <option key={r} value={i}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="scale" className="field-label">
                  Scale
                </label>
                <select
                  id="scale"
                  value={settings.scale}
                  onChange={(e) =>
                    change('scale', e.target.value as Settings['scale'])
                  }
                >
                  <option value="major">Major</option>
                  <option value="minor">Natural minor</option>
                </select>
              </div>
            </div>
            <div className="rule" />
            <label className="slider-label" htmlFor="volume">
              <span>
                <Icon name="volume" size={15} /> Volume
              </span>
              <output>{Math.round(settings.volume * 100)}%</output>
            </label>
            <input
              id="volume"
              type="range"
              min="0"
              max="1"
              step=".01"
              value={settings.volume}
              onChange={(e) => change('volume', Number(e.target.value))}
              style={
                { '--fill': `${settings.volume * 100}%` } as React.CSSProperties
              }
            />
            <label className="slider-label reverb-label" htmlFor="reverb">
              <span>Room reverb</span>
              <output>{Math.round(settings.reverb * 100)}%</output>
            </label>
            <input
              id="reverb"
              type="range"
              min="0"
              max=".7"
              step=".01"
              value={settings.reverb}
              onChange={(e) => change('reverb', Number(e.target.value))}
              style={
                {
                  '--fill': `${(settings.reverb / 0.7) * 100}%`,
                } as React.CSSProperties
              }
            />
            {devices.length > 0 && (
              <div className="device-field">
                <label htmlFor="camera" className="field-label">
                  Camera
                </label>
                <select
                  id="camera"
                  value={deviceId}
                  onChange={(e) => {
                    stopCamera();
                    setDeviceId(e.target.value);
                  }}
                >
                  <option value="">Default camera</option>
                  {devices.map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Camera ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="panel-footnote">
              <Icon name="check" size={13} />
              <span>
                {audioReady
                  ? 'Audio ready. Make it yours.'
                  : 'No setup. No music theory needed.'}
              </span>
            </div>
          </aside>
        </div>
        {(cameraMessage || audioMessage) && (
          <div className="notice" role="alert">
            <div>
              {cameraMessage && <p>{cameraMessage}</p>}
              {audioMessage && <p>{audioMessage}</p>}
            </div>
            {audioMessage && (
              <button
                onClick={() => {
                  setAudioMessage('');
                  setRetry((r) => r + 1);
                  void ensureAudio();
                }}
              >
                Retry sound
              </button>
            )}
            <button
              className="notice-close"
              aria-label="Dismiss message"
              onClick={() => {
                setAudioMessage('');
                setCameraMessage('');
              }}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
        <section className="play-deck" aria-label="Play without a camera">
          <div className="deck-heading">
            <div>
              <span className="eyebrow">A FEEL FOR THE SOUND</span>
              <h2>Try a little something.</h2>
            </div>
            <p>
              Hold a key or click a note.<span>No camera needed.</span>
            </p>
          </div>
          <div className="deck-controls">
            <div className={`chord-deck ${!chordEnabled ? 'inactive' : ''}`}>
              <div className="deck-label">
                <span>CHORDS</span>
                <span>KEYS 1–5</span>
              </div>
              <div className="chord-buttons">
                {[1, 2, 3, 4, 5].map((fingers) => {
                  const c = chordFor(
                    fingers,
                    settings.root,
                    settings.scale,
                    playing.quality,
                  )!;
                  return (
                    <button
                      key={fingers}
                      disabled={!chordEnabled || guide}
                      className={playing.fingers === fingers ? 'playing' : ''}
                      aria-label={`Play ${c.name} chord, ${fingers} fingers`}
                      aria-pressed={playing.fingers === fingers}
                      {...pointer('chord', fingers)}
                    >
                      <span>{fingers}</span>
                      <strong>{c.name}</strong>
                      <small>{c.roman}</small>
                    </button>
                  );
                })}
              </div>
              <div className="deck-tip">
                {settings.swapped ? 'Right' : 'Left'} hand: extend 1–5 fingers.
                Close to release.
              </div>
            </div>
            <div className="melody-deck">
              <div className="deck-label">
                <span>MELODY</span>
                <span>PINCH + MOVE TO EXPLORE</span>
              </div>
              <div className={`piano-keys ${!melodyEnabled ? 'inactive' : ''}`}>
                {notes.map((note, index) => (
                  <button
                    key={index}
                    disabled={!melodyEnabled || guide}
                    aria-label={`Play ${noteName(note)}`}
                    aria-pressed={playing.melodyIndex === index}
                    className={`${index % 7 === 0 ? 'root-key' : ''} ${playing.melodyIndex === index ? 'playing' : ''}`}
                    {...pointer('melody', index)}
                  >
                    <span>
                      {index % 7 === 0 ? noteName(note) : ROOTS[note % 12]}
                    </span>
                    <kbd>{MELODY_KEYS[index].toUpperCase()}</kbd>
                  </button>
                ))}
              </div>
              <div className="deck-tip">
                {settings.swapped ? 'Left' : 'Right'} hand: pinch to play · move
                sideways for pitch · up for volume
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer>
        <span>Made for the joy of making something.</span>
        <div>
          <span className="footer-brand">mein instrument</span>
          <button
            onClick={() => {
              stopAll();
              setGuide(true);
            }}
          >
            Guide & credits <Icon name="arrow" size={13} />
          </button>
        </div>
      </footer>
      {guide && <Guide settings={settings} onClose={() => setGuide(false)} />}
    </div>
  );
}

function Guide({
  settings,
  onClose,
}: {
  settings: Settings;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={dialogRef}
      className="guide-dialog"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="guide-title"
    >
      <div className="guide-body">
        <button
          className="guide-close"
          onClick={onClose}
          aria-label="Close guide"
        >
          <Icon name="close" />
        </button>
        <span className="eyebrow">YOUR FIRST SESSION</span>
        <h2 id="guide-title">
          A little guide to <em>letting go.</em>
        </h2>
        <p>
          Face the webcam in good light, with room for{' '}
          {settings.mode === 'single' ? 'your playing hand' : 'both hands'}.
          Start camera, allow access, and bring your hands into view.
        </p>
        <div className="guide-step">
          <span>01</span>
          <div>
            <h3>Find a chord</h3>
            <p>
              With your {settings.swapped ? 'right' : 'left'} hand, hold up
              fingers to choose a chord. Start with index, then add middle,
              ring, little finger, and finally thumb. Keep your palm facing the
              camera; close your fist to release.
            </p>
            <div className="guide-chords">
              {[1, 2, 3, 4, 5].map((f) => (
                <span key={f}>
                  {f}
                  <strong>
                    {chordFor(f, settings.root, settings.scale)!.name}
                  </strong>
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="guide-step">
          <span>02</span>
          <div>
            <h3>Bend for major or minor</h3>
            <p>
              Turn on Wrist chords. Bend your chord hand inward, toward your
              body, for a major chord; bend it outward, away from your body, for
              a minor chord. The chosen chord root stays the same. Return
              upright for the usual scale chord.
            </p>
            <p>
              Click Set neutral wrist, then hold the playing hand upright with
              your forearm steady. You have a moment to raise it before
              calibration begins. Keep it visible until the position is set.
              This uses the camera's depth estimate, so recalibrate if your arm
              position changes.
            </p>
          </div>
        </div>
        <div className="guide-step">
          <span>03</span>
          <div>
            <h3>Play with one hand, or two</h3>
            <p>
              Choose One hand to play chord accompaniment with only your{' '}
              {settings.swapped ? 'right' : 'left'} hand. Fingers choose the
              chord, your wrist chooses major/minor, and raising the hand
              increases volume. Close your fist to release. Use the swap button
              to choose the other hand.
            </p>
            <p>
              In Both hands, pinch thumb and index on your{' '}
              {settings.swapped ? 'left' : 'right'} hand for melody. Move
              sideways for pitch and upward for volume; unpinch to release. Keep
              hands apart and in view. If tracking gets uncertain, sound
              releases automatically.
            </p>
          </div>
        </div>
        <div className="guide-note">
          <strong>Always within reach</strong>
          <p>
            Full screen on the camera stage enlarges it; Return restores the
            normal layout while keeping the same camera session. Stop and the
            return control stay visible. Embedded browsers use an expanded
            camera view if native fullscreen is unavailable.
          </p>
          <p>
            Stop, Space, or Escape silences the instrument and turns off the
            camera. Changing tabs also stops the session. For keyboard play,
            hold 1–5 for chords and the labeled letter keys for melody; focused
            note buttons play with Enter.
          </p>
        </div>
        <details>
          <summary>Privacy, sounds & credits</summary>
          <p>
            Camera frames stay in this browser. No microphone, accounts,
            analytics, or external requests are used during normal play.
            Preferences are stored on this device.
          </p>
          <p>
            Inspired by Eric Wei’s{' '}
            <a
              href="https://www.indecisiveeric.com/gesture-synth"
              target="_blank"
              rel="noreferrer"
            >
              Gesture Synth
            </a>
            . This is an independent implementation with its own controls.
          </p>
          <p>
            Piano: Salamander Grand Piano V3 by Alexander Holm. MP3 distribution
            from Tone.js; selected recordings are unmodified and repitched
            during playback.{' '}
            <a href="/licenses/CC-BY-3.0.txt" target="_blank" rel="noreferrer">
              CC BY 3.0 license
            </a>
            . Tracking: MediaPipe (Apache 2.0). Audio: Tone.js (MIT).{' '}
            <a href="/ATTRIBUTIONS.md" target="_blank" rel="noreferrer">
              Full attributions
            </a>
            .
          </p>
        </details>
        <button className="button amber guide-done" onClick={onClose}>
          Let’s play <Icon name="arrow" />
        </button>
      </div>
    </dialog>
  );
}
