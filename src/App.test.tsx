// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { RefObject } from 'react';

const fakes = vi.hoisted(() => ({
  start: vi.fn().mockResolvedValue(undefined),
  setPreset: vi.fn().mockResolvedValue(undefined),
  setNotes: vi.fn(),
  silence: vi.fn(),
  settings: vi.fn(),
  dispose: vi.fn(),
  cameraStart: vi
    .fn()
    .mockRejectedValue(new DOMException('Denied', 'NotAllowedError')),
  cameraStop: vi.fn(),
}));
vi.mock('./lib/audio', () => ({
  InstrumentAudio: class {
    start = fakes.start;
    setPreset = fakes.setPreset;
    setNotes = fakes.setNotes;
    silence = fakes.silence;
    settings = fakes.settings;
    dispose = fakes.dispose;
  },
}));
vi.mock('./lib/camera', () => ({
  CameraSession: class {
    start = fakes.cameraStart;
    stop = fakes.cameraStop;
  },
}));
vi.mock('./components/Stage', () => ({
  default: ({
    videoRef,
    onStart,
  }: {
    videoRef: RefObject<HTMLVideoElement | null>;
    onStart: () => void;
  }) => (
    <div>
      <video ref={videoRef} />
      <button onClick={onStart}>Start camera</button>
    </div>
  ),
}));

const lastNotes = (role: string) =>
  fakes.setNotes.mock.calls.filter(([r]) => r === role).at(-1)?.[1];
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  fakes.start.mockResolvedValue(undefined);
  fakes.setPreset.mockResolvedValue(undefined);
  fakes.cameraStart.mockRejectedValue(
    new DOMException('Denied', 'NotAllowedError'),
  );
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      enumerateDevices: vi.fn().mockResolvedValue([]),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
});
afterEach(cleanup);

describe('instrument interactions', () => {
  it('offers complete one-hand chord play without enabling the melody channel', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'One hand' }));
    expect(screen.getByText(/Only your left hand plays/)).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Play C4' }).hasAttribute('disabled'),
    ).toBe(true);
    fireEvent.keyDown(document.body, { key: '1', code: 'Digit1' });
    fireEvent.keyDown(document.body, { key: 'a', code: 'KeyA' });
    await waitFor(() => expect(lastNotes('chord')).toEqual([48, 52, 55]));
    expect(lastNotes('melody')).toEqual([]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Change the playing hand' }),
    );
    expect(screen.getByText(/Only your right hand plays/)).toBeDefined();
  });
  it('lets the player disable wrist quality changes and saves that preference', async () => {
    render(<App />);
    const toggle = screen.getByRole('checkbox', { name: 'Wrist chords' });
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem('mein-settings-v1')!).wristControl,
      ).toBe(false),
    );
    expect(
      screen.queryByRole('button', { name: 'Set neutral wrist' }),
    ).toBeNull();
  });
  it('routes simultaneous keyboard chords and melody to independent audio channels', async () => {
    render(<App />);
    fireEvent.keyDown(document.body, { key: '1', code: 'Digit1' });
    fireEvent.keyDown(document.body, { key: 'a', code: 'KeyA' });
    await waitFor(() => {
      expect(lastNotes('chord')).toEqual([48, 52, 55]);
      expect(lastNotes('melody')).toEqual([60]);
    });
    fireEvent.keyUp(document.body, { key: '1', code: 'Digit1' });
    fireEvent.keyUp(document.body, { key: 'a', code: 'KeyA' });
    await waitFor(() => {
      expect(lastNotes('chord')).toEqual([]);
      expect(lastNotes('melody')).toEqual([]);
    });
  });
  it('makes even a short first tap audible after asynchronous audio startup', async () => {
    let ready!: () => void;
    fakes.start.mockReturnValueOnce(
      new Promise<void>((r) => {
        ready = r;
      }),
    );
    render(<App />);
    fireEvent.keyDown(document.body, { key: 'a', code: 'KeyA' });
    fireEvent.keyUp(document.body, { key: 'a', code: 'KeyA' });
    ready();
    await waitFor(() =>
      expect(
        fakes.setNotes.mock.calls.some(
          ([role, notes]) => role === 'melody' && notes[0] === 60,
        ),
      ).toBe(true),
    );
    await waitFor(() => expect(lastNotes('melody')).toEqual([]));
  });
  it('does not play a pending tap after emergency Stop', async () => {
    let ready!: () => void;
    fakes.start.mockReturnValueOnce(
      new Promise<void>((r) => {
        ready = r;
      }),
    );
    render(<App />);
    fireEvent.keyDown(document.body, { key: 'a', code: 'KeyA' });
    fireEvent.click(screen.getByRole('button', { name: /Stop/ }));
    ready();
    await screen.findByText('Audio ready. Make it yours.');
    expect(
      fakes.setNotes.mock.calls.some(([, notes]) => notes.length > 0),
    ).toBe(false);
    expect(fakes.silence).toHaveBeenCalled();
  });
  it('plays and releases pointer notes, including cancellation', async () => {
    render(<App />);
    const note = screen.getByRole('button', { name: 'Play E4' });
    fireEvent.pointerDown(note, { button: 0, pointerId: 3 });
    await waitFor(() => expect(lastNotes('melody')).toEqual([64]));
    fireEvent.pointerCancel(note, { pointerId: 3 });
    await waitFor(() => expect(lastNotes('melody')).toEqual([]));
  });
  it('clears held voices on a mode change and disables the inactive keyboard', async () => {
    render(<App />);
    fireEvent.keyDown(document.body, { key: '1', code: 'Digit1' });
    await waitFor(() => expect(lastNotes('chord')).toEqual([48, 52, 55]));
    fireEvent.click(screen.getByRole('button', { name: 'Melody' }));
    await waitFor(() => expect(lastNotes('chord')).toEqual([]));
    expect(
      screen
        .getByRole('button', { name: 'Play C chord, 1 fingers' })
        .hasAttribute('disabled'),
    ).toBe(true);
  });
  it('keeps Space available while a volume slider is focused', () => {
    render(<App />);
    const slider = screen.getByRole('slider', { name: /Volume/ });
    slider.focus();
    fireEvent.keyDown(slider, { key: ' ', code: 'Space' });
    expect(fakes.silence).toHaveBeenCalled();
  });
  it('explains denied camera permission and cleans up the session', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
    await screen.findByText(/Camera permission is blocked/);
    expect(fakes.cameraStop).toHaveBeenCalled();
  });
  it('surfaces sound-loading failure with a retry action', async () => {
    fakes.setPreset.mockRejectedValue(
      new Error('Piano samples could not load.'),
    );
    render(<App />);
    fireEvent.keyDown(document.body, { key: 'a', code: 'KeyA' });
    await screen.findByText('Piano samples could not load.');
    expect(screen.getByRole('button', { name: 'Retry sound' })).toBeDefined();
  });
  it('clears pending taps when audio startup fails', async () => {
    fakes.start.mockRejectedValueOnce(new Error('Audio unavailable'));
    render(<App />);
    fireEvent.keyDown(document.body, { key: 'a', code: 'KeyA' });
    await screen.findByText(/Audio could not start/);
    fireEvent.click(screen.getByRole('button', { name: 'Retry sound' }));
    await screen.findByText('Audio ready. Make it yours.');
    expect(
      fakes.setNotes.mock.calls.some(([, notes]) => notes.length > 0),
    ).toBe(false);
  });
  it('cleans up camera and audio on unmount and page exit', () => {
    const view = render(<App />);
    fireEvent(window, new Event('pagehide'));
    expect(fakes.silence).toHaveBeenCalled();
    view.unmount();
    expect(fakes.dispose).toHaveBeenCalledOnce();
  });
});
