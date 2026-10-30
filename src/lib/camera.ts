import type { TrackingFrame } from './gestures';

export interface CameraStats {
  fps: number;
  inferenceMs: number;
}
export class CameraSession {
  private stream: MediaStream | null = null;
  private worker: Worker | null = null;
  private timer = 0;
  private timeout = 0;
  private disposed = false;
  private busy = false;
  private lastTime = -1;
  private delivered = 0;
  private statsAt = 0;
  private frameAt = 0;
  private cancelStart: (() => void) | null = null;
  constructor(
    private video: HTMLVideoElement,
    private onFrame: (frame: TrackingFrame) => void,
    private onError: (message: string) => void,
    private onStats: (stats: CameraStats) => void,
  ) {}
  async start(deviceId?: string) {
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error(
        'Camera access needs localhost or HTTPS in a supported browser.',
      );
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30, max: 30 },
      },
      audio: false,
    });
    if (this.disposed) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stream = stream;
    stream.getVideoTracks().forEach((t) => {
      t.onended = () => {
        if (!this.disposed)
          this.onError(
            'The camera disconnected. Reconnect it and start again.',
          );
      };
    });
    this.video.srcObject = stream;
    await this.video.play();
    if (this.disposed) return;
    const worker = new Worker(
      `${import.meta.env.BASE_URL}vision/hands.worker.js`,
    );
    this.worker = worker;
    await new Promise<void>((resolve, reject) => {
      this.cancelStart = () => reject(new Error('Camera start cancelled.'));
      this.timeout = window.setTimeout(
        () =>
          reject(
            new Error('Hand tracking took too long to load. Stop and retry.'),
          ),
        25000,
      );
      worker.onerror = () =>
        reject(
          new Error(
            'Could not load hand tracking. Check the local model files and retry.',
          ),
        );
      worker.onmessage = (e) => {
        if (e.data.type === 'ready') {
          clearTimeout(this.timeout);
          this.cancelStart = null;
          resolve();
        }
        if (e.data.type === 'error') {
          clearTimeout(this.timeout);
          reject(
            new Error(
              'Hand tracking could not start. Check the model files and retry.',
            ),
          );
        }
      };
      worker.postMessage({
        type: 'init',
        base: new URL(import.meta.env.BASE_URL, location.href).href,
      });
    });
    if (this.disposed) return;
    this.statsAt = performance.now();
    worker.onerror = () =>
      this.onError(
        'Hand tracking stopped unexpectedly. Please restart the camera.',
      );
    worker.onmessage = (e) => {
      if (this.disposed) return;
      this.busy = false;
      if (e.data.type === 'error') {
        this.onError('Hand tracking failed. Please restart the camera.');
        return;
      }
      if (e.data.type !== 'result') return;
      this.onFrame(e.data);
      this.delivered++;
      const now = performance.now();
      if (now - this.statsAt >= 1000) {
        this.onStats({
          fps: Math.round((this.delivered * 1000) / (now - this.statsAt)),
          inferenceMs: Math.round(e.data.inferenceMs),
        });
        this.statsAt = now;
        this.delivered = 0;
      }
    };
    this.timer = window.setInterval(() => {
      void this.capture();
    }, 40);
  }
  private async capture() {
    if (this.disposed) return;
    if (this.busy && performance.now() - this.frameAt > 3000) {
      this.onError(
        'Hand tracking stopped responding. Please restart the camera.',
      );
      return;
    }
    if (
      this.busy ||
      this.video.readyState < 2 ||
      this.video.currentTime === this.lastTime
    )
      return;
    this.busy = true;
    this.lastTime = this.video.currentTime;
    const capturedAt = performance.now();
    this.frameAt = capturedAt;
    try {
      const bitmap = await createImageBitmap(this.video, {
        resizeWidth: 640,
        resizeHeight: 480,
      });
      if (this.disposed) {
        bitmap.close();
        return;
      }
      this.worker?.postMessage({ type: 'frame', bitmap, capturedAt }, [bitmap]);
    } catch {
      this.busy = false;
      this.onError('Could not read a camera frame. Please restart the camera.');
    }
  }
  stop() {
    this.disposed = true;
    clearInterval(this.timer);
    clearTimeout(this.timeout);
    this.cancelStart?.();
    this.cancelStart = null;
    this.worker?.terminate();
    this.worker = null;
    this.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    this.stream = null;
    this.video.pause();
    this.video.srcObject = null;
  }
}
