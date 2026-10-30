import { InstrumentAudio } from '../src/lib/audio';
import { countFingers, type TrackingFrame } from '../src/lib/gestures';

const output = document.querySelector('#results')!;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (message: string) => {
  output.textContent += `${message}\n`;
};
document.querySelector<HTMLButtonElement>('#audio')!.onclick = async () => {
  output.textContent = 'Running audio checks…\n';
  const engine = new InstrumentAudio();
  try {
    await engine.start();
    engine.settings(0.5, 0.2);
    for (const preset of ['pad', 'pluck', 'lead', 'piano'] as const) {
      await engine.setPreset('melody', preset);
      engine.setNotes('melody', [60], 0.7);
      await wait(400);
      const rms = engine.stats().rms;
      if (rms < 0.00001)
        throw new Error(`${preset} produced no measurable audio`);
      log(`PASS ${preset}: RMS ${rms.toFixed(6)}`);
      engine.silence();
      await wait(100);
    }
    await engine.setPreset('chord', 'pad');
    engine.setNotes('chord', [48, 52, 55]);
    engine.setNotes('melody', [72], 0.7);
    await wait(250);
    const active = engine.stats();
    if (
      active.active.chord.length !== 3 ||
      active.active.melody.length !== 1 ||
      active.rms < 0.00001
    )
      throw new Error('Simultaneous voices failed');
    log(`PASS simultaneous chord + melody: ${JSON.stringify(active.active)}`);
    for (let i = 0; i < 3; i++) {
      engine.silence();
      await wait(100);
      await engine.start();
      engine.setNotes('chord', [48, 52, 55]);
      await wait(100);
    }
    engine.silence();
    await wait(300);
    const stopped = engine.stats();
    if (
      stopped.active.chord.length ||
      stopped.active.melody.length ||
      stopped.rms > 0.000001
    )
      throw new Error(`Stop left audio active: ${JSON.stringify(stopped)}`);
    log(
      `PASS repeated start / stop: RMS ${stopped.rms.toFixed(8)}, voices empty`,
    );
    log(`AUDIO CHECKS PASSED · sample rate ${stopped.sampleRate} Hz`);
  } catch (e) {
    log(`FAIL ${String(e)}`);
  } finally {
    engine.dispose();
  }
};
document.querySelector<HTMLButtonElement>('#worker')!.onclick = async () => {
  output.textContent = 'Running tracking worker check…\n';
  const worker = new Worker('/vision/hands.worker.js');
  const timer = setTimeout(() => {
    log('FAIL worker timeout');
    worker.terminate();
  }, 30000);
  worker.onerror = (e) => {
    log(`FAIL worker error ${e.message}`);
    clearTimeout(timer);
    worker.terminate();
  };
  worker.onmessage = async (e) => {
    if (e.data.type === 'ready') {
      log('PASS local WASM + model initialized');
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#6a6a6a';
      ctx.fillRect(0, 0, 640, 480);
      const bitmap = await createImageBitmap(canvas);
      worker.postMessage(
        { type: 'frame', bitmap, capturedAt: performance.now() },
        [bitmap],
      );
    } else if (e.data.type === 'result') {
      log(
        `PASS blank frame inference: ${e.data.hands.length} hands, ${e.data.inferenceMs.toFixed(1)} ms`,
      );
      log('TRACKING WORKER CHECK PASSED · no real webcam was used');
      clearTimeout(timer);
      worker.terminate();
    } else if (e.data.type === 'error') {
      log(`FAIL ${e.data.message}`);
      clearTimeout(timer);
      worker.terminate();
    }
  };
  worker.postMessage({ type: 'init', base: new URL('/', location.href).href });
};

document.querySelector<HTMLButtonElement>('#fixtures')!.onclick = async () => {
  output.textContent = 'Running Google reference image checks…\n';
  const worker = new Worker('/vision/hands.worker.js');
  let reply: ((data: TrackingFrame) => void) | null = null;
  const request = (bitmap: ImageBitmap) =>
    new Promise<TrackingFrame>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Reference inference timed out')),
        5000,
      );
      reply = (data) => {
        clearTimeout(timer);
        resolve(data);
      };
      worker.postMessage(
        { type: 'frame', bitmap, capturedAt: performance.now() },
        [bitmap],
      );
    });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Worker startup timed out')),
        25000,
      );
      worker.onerror = (e) => reject(new Error(e.message));
      worker.onmessage = (e) => {
        if (e.data.type === 'ready') {
          clearTimeout(timer);
          resolve();
        }
        if (e.data.type === 'result') reply?.(e.data);
        if (e.data.type === 'error') {
          clearTimeout(timer);
          reject(new Error(e.data.message));
        }
      };
      worker.postMessage({
        type: 'init',
        base: new URL('/', location.href).href,
      });
    });
    for (const [file, expected] of [
      ['thumb_up.jpg', 1],
      ['pointing_up.jpg', 1],
      ['right_hands.jpg', 2],
    ] as const) {
      const img = new Image();
      img.src = `/verification/fixtures/${file}`;
      await img.decode();
      const timings: number[] = [];
      let last: TrackingFrame | undefined;
      for (let i = 0; i < 12; i++) {
        last = await request(await createImageBitmap(img));
        timings.push(last.inferenceMs);
        await wait(45);
      }
      if (last!.hands.length !== expected)
        throw new Error(
          `${file}: expected ${expected} hand(s), got ${last!.hands.length}`,
        );
      if (file === 'thumb_up.jpg' && last!.hands[0].side !== 'Right')
        throw new Error(
          'Hand labels are inverted relative to Google reference',
        );
      if (expected === 1 && countFingers(last!.hands[0].points) !== 1)
        throw new Error(
          `${file}: expected one extended finger, got ${countFingers(last!.hands[0].points)}`,
        );
      timings.shift();
      timings.sort((a, b) => a - b);
      log(
        `PASS ${file}: ${last!.hands.map((h) => `${h.side}, ${countFingers(h.points)} fingers, ${(h.confidence * 100).toFixed(1)}%`).join(' / ')}; warm inference p50 ${timings[5].toFixed(1)} ms, p95 ${timings[10].toFixed(1)} ms`,
      );
    }
    log(
      'REFERENCE HAND CHECKS PASSED · still images, not live webcam performance',
    );
  } catch (e) {
    log(`FAIL ${String(e)}`);
  } finally {
    worker.terminate();
  }
};
