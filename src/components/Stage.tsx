import { useEffect, useRef, useState, type RefObject } from 'react';
import { mirroredX, type TrackingFrame } from '../lib/gestures';
import { noteName, type Mode } from '../lib/music';
import { Icon } from './Icon';

const CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];
interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  frameRef: RefObject<TrackingFrame | null>;
  live: boolean;
  loading: boolean;
  mode: Mode;
  chord: string | null;
  melody: number | null;
  fps: number;
  inferenceMs: number;
  onStart: () => void;
  onStop: () => void;
  onGuide: () => void;
  primaryHand?: 'Left' | 'Right';
  wristLabel?: string;
}
export default function Stage(p: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const ownedNativeFullscreen = useRef(false);
  useEffect(() => {
    const changed = () => {
      if (document.fullscreenElement === stageRef.current) {
        ownedNativeFullscreen.current = true;
        setExpanded(true);
      } else if (ownedNativeFullscreen.current) {
        ownedNativeFullscreen.current = false;
        setExpanded(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.fullscreenElement)
        setExpanded(false);
    };
    document.addEventListener('fullscreenchange', changed);
    window.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('fullscreenchange', changed);
      window.removeEventListener('keydown', escape);
    };
  }, []);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [expanded]);
  const toggleFullscreen = async () => {
    if (expanded) {
      if (document.fullscreenElement === stageRef.current) {
        try {
          await document.exitFullscreen();
        } catch {
          /* Always restore the in-page layout. */
        }
      }
      setExpanded(false);
      return;
    }
    setExpanded(true);
    // Embedded browsers may disallow the native API. The same control still
    // expands the stage to fill its browser viewport and can always restore it.
    try {
      await stageRef.current?.requestFullscreen?.();
    } catch {
      /* Use viewport expansion. */
    }
  };
  useEffect(() => {
    let raf = 0;
    const trails: { x: number; y: number; life: number }[] = [];
    const draw = () => {
      const canvas = canvasRef.current,
        box = stageRef.current;
      if (!canvas || !box) return;
      const w = box.clientWidth,
        h = box.clientHeight,
        dpr = window.devicePixelRatio || 1;
      if (
        canvas.width !== Math.round(w * dpr) ||
        canvas.height !== Math.round(h * dpr)
      ) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const frame = p.frameRef.current;
      if (p.live && frame && performance.now() - frame.capturedAt < 250) {
        // object-fit: contain keeps the same aspect ratio as the landmark input.
        const vw = p.videoRef.current?.videoWidth || 640,
          vh = p.videoRef.current?.videoHeight || 480;
        const scale = Math.min(w / vw, h / vh),
          fw = vw * scale,
          fh = vh * scale;
        const ox = (w - fw) / 2,
          oy = (h - fh) / 2;
        const xy = (i: number, points: (typeof frame.hands)[0]['points']) => ({
          x: ox + mirroredX(points[i].x) * fw,
          y: oy + points[i].y * fh,
        });
        for (const hand of frame.hands) {
          if (hand.confidence < 0.65) continue;
          ctx.lineWidth = 1.4;
          ctx.strokeStyle = '#f9bd79aa';
          for (const [a, b] of CONNECTIONS) {
            const start = xy(a, hand.points),
              end = xy(b, hand.points);
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
          }
          for (let i = 0; i < hand.points.length; i++) {
            const point = xy(i, hand.points);
            ctx.beginPath();
            ctx.arc(
              point.x,
              point.y,
              [4, 8, 12, 16, 20].includes(i) ? 4 : 2.4,
              0,
              Math.PI * 2,
            );
            ctx.fillStyle = '#ffe4bd';
            ctx.fill();
          }
          const tip = xy(8, hand.points);
          trails.push({ ...tip, life: 1 });
          ctx.font = '11px monospace';
          ctx.fillStyle = '#fff1da';
          const wrist = xy(0, hand.points);
          ctx.fillText(
            `${hand.side.toUpperCase()} HAND`,
            wrist.x + 12,
            wrist.y + 20,
          );
        }
      }
      for (let i = trails.length - 1; i >= 0; i--) {
        const t = trails[i];
        t.life -= 0.028;
        if (t.life <= 0) {
          trails.splice(i, 1);
          continue;
        }
        ctx.beginPath();
        ctx.arc(t.x, t.y, 3 * t.life, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(241,167,91,${t.life * 0.45})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [p.live, p.frameRef, p.videoRef]);
  return (
    <div
      className={`stage ${p.live ? 'is-live' : ''} ${expanded ? 'stage-expanded' : ''}`}
      ref={stageRef}
    >
      <video
        ref={p.videoRef}
        className="camera-video"
        autoPlay
        playsInline
        muted
        aria-hidden={!p.live}
        aria-label="Mirrored camera preview"
      />
      <div className="stage-shade" />
      <canvas ref={canvasRef} className="hand-canvas" aria-hidden="true" />
      <div className="stage-top">
        <span className="stage-badge">
          <span className={`status-dot ${p.live ? 'on' : ''}`} />
          {p.live ? 'CAMERA LIVE' : 'YOUR PLAYING SPACE'}
        </span>
        <div className="stage-actions">
          {expanded && (
            <button className="stage-stop" onClick={p.onStop}>
              <Icon name="stop" size={14} /> Stop <kbd>SPACE</kbd>
            </button>
          )}
          <button
            className="stage-help"
            onClick={p.onGuide}
            aria-label="Open gesture guide"
          >
            <Icon name="help" />
          </button>
          <button
            className="stage-fullscreen"
            onClick={() => void toggleFullscreen()}
            aria-label={
              expanded ? 'Exit full screen camera' : 'Full screen camera'
            }
            title={expanded ? 'Return to normal view' : 'Full screen camera'}
          >
            <Icon name={expanded ? 'collapse' : 'expand'} size={17} />
            <span>{expanded ? 'Return' : 'Full screen'}</span>
          </button>
        </div>
      </div>
      {!p.live && (
        <div className="stage-welcome">
          <div className="orbit-art" aria-hidden="true">
            <div />
            <div />
            <div />
            <span>
              m<span>♪</span>
            </span>
            <i />
            <i />
            <i />
          </div>
          <span className="eyebrow">A LITTLE MOVEMENT. A LOT OF MUSIC.</span>
          <h2>
            Your hands.
            <br />A whole new <em>instrument.</em>
          </h2>
          <p>
            Turn the space in front of you into sound.
            <br />
            No keys, no strings. Just you.
          </p>
          <button
            className="button amber"
            onClick={p.onStart}
            disabled={p.loading}
          >
            <Icon name="camera" />
            {p.loading ? 'Preparing your stage…' : 'Start camera'}
            <Icon name="arrow" />
          </button>
          <span className="camera-note">Your camera stays on your device.</span>
        </div>
      )}
      {p.live && (
        <div className="live-hint">
          {p.mode === 'single' || p.mode === 'chords'
            ? `Keep your ${p.primaryHand?.toLowerCase() || 'left'} hand in view`
            : p.mode === 'melody'
              ? 'Keep your melody hand in view'
              : 'Keep both hands in view'}{' '}
          · <button onClick={p.onStop}>Turn camera off</button>
        </div>
      )}
      {p.live && p.wristLabel && p.mode !== 'melody' && (
        <div className="stage-wrist-label">{p.wristLabel}</div>
      )}
      <div className="stage-bottom">
        <span>
          <span className="tiny-cross">+</span>{' '}
          {p.live
            ? p.fps
              ? `${p.fps} FPS · ${p.inferenceMs} ms inference`
              : 'FINDING YOUR HANDS'
            : 'WEBCAM INSTRUMENT / VOL. 01'}
        </span>
        <span>
          {p.mode === 'combined'
            ? 'TWO HANDS. ONE SESSION.'
            : p.mode === 'single'
              ? 'ONE HAND. EVERY CHORD.'
              : p.mode === 'chords'
                ? 'FIND YOUR HARMONY.'
                : 'FOLLOW YOUR MELODY.'}
        </span>
      </div>
      <div className="stage-readout" aria-live="polite">
        <div>
          <span>CHORD</span>
          <strong>{p.chord || '—'}</strong>
        </div>
        <span className="readout-divider" />
        <div>
          <span>MELODY</span>
          <strong>{p.melody === null ? '—' : noteName(p.melody)}</strong>
        </div>
        <svg
          viewBox="0 0 220 36"
          className={p.chord || p.melody !== null ? 'wave active' : 'wave'}
          aria-hidden="true"
        >
          <path d="M0 18 Q11 18 22 18 T44 18 Q55 -9 66 18 T88 18 Q99 42 110 18 T132 18 Q143 -4 154 18 T176 18 Q187 33 198 18 T220 18" />
        </svg>
      </div>
    </div>
  );
}
