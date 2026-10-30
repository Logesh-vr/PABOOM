import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CameraSession } from './camera';

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn((message: { type: string }) => {
    if (message.type === 'init')
      queueMicrotask(() => this.onmessage?.({ data: { type: 'ready' } }));
  });
  constructor() {
    FakeWorker.instances.push(this);
  }
}
describe('camera lifecycle', () => {
  let track: { stop: ReturnType<typeof vi.fn>; onended: (() => void) | null };
  let video: HTMLVideoElement;
  let getUserMedia: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWorker.instances = [];
    track = { stop: vi.fn(), onended: null };
    const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
    getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('location', { href: 'http://localhost:5173/' });
    vi.stubGlobal('Worker', FakeWorker);
    video = {
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      srcObject: null,
      currentTime: 1,
      readyState: 4,
    } as unknown as HTMLVideoElement;
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ close: vi.fn() }),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it('requests video only and releases the camera, worker and video on stop', async () => {
    const camera = new CameraSession(video, vi.fn(), vi.fn(), vi.fn());
    await camera.start('camera-id');
    expect(getUserMedia.mock.calls[0][0].audio).toBe(false);
    expect(getUserMedia.mock.calls[0][0].video.deviceId).toEqual({
      exact: 'camera-id',
    });
    camera.stop();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('releases a late permission result after Stop was pressed', async () => {
    let resolve!: (stream: unknown) => void;
    getUserMedia.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const camera = new CameraSession(video, vi.fn(), vi.fn(), vi.fn());
    const starting = camera.start();
    camera.stop();
    resolve({ getTracks: () => [track] });
    await starting;
    expect(track.stop).toHaveBeenCalledOnce();
    expect(FakeWorker.instances).toHaveLength(0);
  });
  it('propagates denied permission without creating a worker', async () => {
    getUserMedia.mockRejectedValue(
      new DOMException('Denied', 'NotAllowedError'),
    );
    const camera = new CameraSession(video, vi.fn(), vi.fn(), vi.fn());
    await expect(camera.start()).rejects.toHaveProperty(
      'name',
      'NotAllowedError',
    );
    expect(FakeWorker.instances).toHaveLength(0);
  });
  it('does not queue a second frame while the worker is busy', async () => {
    const camera = new CameraSession(video, vi.fn(), vi.fn(), vi.fn());
    await camera.start();
    await vi.advanceTimersByTimeAsync(45);
    video.currentTime = 2;
    await vi.advanceTimersByTimeAsync(45);
    const frames = FakeWorker.instances[0].postMessage.mock.calls.filter(
      ([m]) => m.type === 'frame',
    );
    expect(frames).toHaveLength(1);
    camera.stop();
  });
  it('reports camera disconnection and detaches the callback on stop', async () => {
    const error = vi.fn(),
      camera = new CameraSession(video, vi.fn(), error, vi.fn());
    await camera.start();
    track.onended?.();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('disconnected'));
    camera.stop();
    expect(track.onended).toBeNull();
  });
  it('reports an unavailable camera API', async () => {
    vi.stubGlobal('navigator', {});
    const camera = new CameraSession(video, vi.fn(), vi.fn(), vi.fn());
    await expect(camera.start()).rejects.toThrow('localhost or HTTPS');
  });
});
