// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Stage from './Stage';

let fullscreen: Element | null = null;
const props = () => ({
  videoRef: { current: null },
  frameRef: { current: null },
  live: false,
  loading: false,
  mode: 'combined' as const,
  chord: null,
  melody: null,
  fps: 0,
  inferenceMs: 0,
  onStart: vi.fn(),
  onStop: vi.fn(),
  onGuide: vi.fn(),
});
beforeEach(() => {
  fullscreen = null;
  vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => fullscreen,
  });
  HTMLElement.prototype.requestFullscreen = vi.fn(async function (
    this: HTMLElement,
  ) {
    fullscreen = this;
    fireEvent(document, new Event('fullscreenchange'));
  });
  document.exitFullscreen = vi.fn(async () => {
    fullscreen = null;
    fireEvent(document, new Event('fullscreenchange'));
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('camera performance view', () => {
  it('enters native fullscreen and restores the same camera element', async () => {
    const p = props(),
      view = render(<Stage {...p} />),
      video = view.container.querySelector('video');
    fireEvent.click(screen.getByRole('button', { name: 'Full screen camera' }));
    await screen.findByRole('button', { name: 'Exit full screen camera' });
    expect(document.body.style.overflow).toBe('hidden');
    expect(view.container.querySelector('video')).toBe(video);
    fireEvent.click(
      screen.getByRole('button', { name: 'Exit full screen camera' }),
    );
    await screen.findByRole('button', { name: 'Full screen camera' });
    expect(document.exitFullscreen).toHaveBeenCalledOnce();
    expect(document.body.style.overflow).toBe('');
  });
  it('falls back to viewport expansion if the native API is rejected and Escape restores it', async () => {
    HTMLElement.prototype.requestFullscreen = vi
      .fn()
      .mockRejectedValue(new Error('Denied by embed'));
    const view = render(<Stage {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Full screen camera' }));
    await screen.findByRole('button', { name: 'Exit full screen camera' });
    expect(view.container.querySelector('.stage-expanded')).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() =>
      expect(view.container.querySelector('.stage-expanded')).toBeNull(),
    );
  });
  it('keeps an operable Stop control in fullscreen and unlocks scrolling on unmount', async () => {
    const p = props(),
      view = render(<Stage {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Full screen camera' }));
    fireEvent.click(await screen.findByRole('button', { name: /Stop/ }));
    expect(p.onStop).toHaveBeenCalledOnce();
    view.unmount();
    expect(document.body.style.overflow).toBe('');
  });
});
