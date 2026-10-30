# Validation — 24 October 2026

Publication recheck on **30 October 2026**: all 52 automated tests and the production build passed again. The browser/audio/hand-image results below are retained from the original 24 October checks; they were not remeasured for publication. Live-camera gesture accuracy and human listening remain unverified.

## Automated checks

- **52 tests pass** across music mappings, gesture geometry/stability, camera lifecycle, fullscreen, and React interactions.
- Music: all 12 roots in both scales, five diatonic chord choices, diminished chords, two-octave melody range, and boundary hysteresis.
- Gestures: 0–5 fingers, mirrored pitch, hand swapping, 120 ms stabilization, closed-hand release, stale/out-of-order frames, 250 ms expiry, pinch hysteresis, confidence checks, duplicate labels, and identity conflicts.
- Camera lifecycle (mock streams/workers): video-only request, selected device, late permission after Stop, denied permission, one frame in flight, disconnect feedback, and track/worker cleanup.
- React interactions (mock audio/camera): simultaneous chord/melody keys, short first taps, canceling pending sound with Stop, pointer cancellation, mode switches, Space while a slider is focused, permission feedback, sound failures/retry, page exit and unmount cleanup.
- TypeScript and production build were checked. Runtime model/audio/license hashes are verified during build. Package audit reported **0 known vulnerabilities** after upgrading the test tooling.

Mock-backed tests verify the application's data flow and cleanup; they do not establish that a physical webcam or speakers work.

### Fullscreen, wrist quality, and one-hand additions

- Added synthetic geometry tests for inward-major/outward-minor tilt, unchanged chord roots with major/minor overrides (including formerly diminished chords), finger counts while tilted, stabilization and neutral jitter, disabling wrist control, hand loss, calibration success/failure, and height-controlled one-hand volume.
- Added tests for selecting one-hand mode, ignoring the other hand, swapping the playing hand, inactive melody, preference persistence, native fullscreen/return without replacing the video element, fallback expansion when the native API is rejected, Escape restoration, visible Stop, and scroll cleanup.
- The actual in-app browser expanded the stage to bounds **1536 × 864, top-left (0, 0)** and returned to normal view. This session used viewport expansion (`nativeFullscreen: false`). Native fullscreen is covered by mocked API tests, not a separate physical-browser session.
- Actual browser UI checks confirmed One hand selection, the left-hand instruction, the hand-switch control, and disabled melody controls. No webcam was used for these UI checks. The new wrist detector is validated with synthetic landmarks; physical accuracy and the feel of chord transitions remain manual checks.

## Actual browser audio

The development verification page exercised the real Tone.js engine in the available Chromium in-app browser at 48,000 Hz:

| Check | Result |
| --- | --- |
| Warm Pad | Nonzero waveform RMS, 0.026490 |
| Soft Pluck | Nonzero waveform RMS, 0.006807 |
| Synth Lead | Nonzero waveform RMS, 0.008059 |
| Acoustic Piano | Local MP3s decoded and produced RMS 0.010943 |
| Simultaneous channels | Chord MIDI 48/52/55 and melody MIDI 72 active together |
| Repeated start/stop | Empty voice sets and measured RMS 0.00000000 after stopping |

These are electronic output measurements, not a human evaluation of tone, latency, or speaker output.

## Actual worker and model

The real local WASM runtime and model initialized in a background worker. A blank frame returned zero hands; the cold first inference took **187.6 ms**.

The development check then ran 12 sequential frames per Google reference image, excluding the first frame from warm timing statistics:

| Image | Last-frame detection | Warm inference p50 / p95 |
| --- | --- | --- |
| `thumb_up.jpg` | One Right hand; one extended finger; 99.2% handedness score | 81.1 / 95.3 ms |
| `pointing_up.jpg` | One Right hand; one extended finger; 99.3% handedness score | 89.3 / 109.4 ms |
| `right_hands.jpg` | Two Right hands; five extended fingers each; 93.5% / 93.1% scores | 71.8 / 117.9 ms |

Handedness was checked against Google's expected thumb-up landmark fixture. Both hands in the two-hand fixture are intentionally labeled Right; the application treats duplicate physical-hand labels as ambiguous instead of using them for combined play.

These still-image timings are from the tool-controlled browser. They are **not** live camera FPS, gesture-to-sound latency, or a benchmark of the user's physical playing conditions. The blank-frame and positive-image checks caught and resolved both an incompatible module-worker loader and an inverted hand-label assumption before delivery.

## Browser interface checks and physical limits

### Startup regression repair

A later user session reproduced a completely empty application root in the development browser, despite successful HTTP responses for the entry and dependency modules. No console error was captured, so the exact underlying dependency-loading failure was not established. The entry now loads React, the application, and styles asynchronously from an independent bootstrap, catches module-loading failures, and supplies a visible loading/retry screen in the initial HTML. The repaired interface rendered in the same user tab and passed a fresh reload check. This browser check is separate from the existing unit tests and build checks.

The local application rendered with its warm stage and settings, and camera startup reached the browser permission request. The request did not complete in the tool-controlled session and was canceled through Stop. This does not establish a physical camera failure; actual permission and playing need a user session.

Remaining manual acceptance checks in desktop Chrome and Edge:

- [ ] Allow camera access; confirm the correct camera and mirrored overlay alignment.
- [ ] Try all five chord poses and fist release in good light. Check thumb-only versus index-first gestures.
- [ ] Check physical left/right roles and the swap setting.
- [ ] Pinch and move through the full melody range; verify release, volume and note-boundary stability.
- [ ] Set neutral wrist with the playing hand upright, then bend inward for major and outward for minor. Verify neutral recovery, smooth held-chord quality changes, and hand loss. Check different camera/forearm angles; recalibrate as needed.
- [ ] In One hand, play with the left hand only, then swap to right-hand play. Check finger selection, wrist quality, height-volume, fist release, and that the other hand cannot play melody.
- [ ] Enter/exit fullscreen during a live camera session; confirm it keeps the preview/overlay aligned, preserves the stream, and leaves Stop/Return reachable.
- [ ] Hold a chord and melody simultaneously; check hand crossing, occlusion and leaving the frame.
- [ ] Stop with the button and Space, hide the tab, switch cameras, disconnect/reconnect, and repeat starts. Confirm the camera indicator turns off.
- [ ] Listen through actual speakers/headphones to all presets, volume/reverb changes, attacks, releases and Stop. Judge latency by playing; do not infer it from model inference timing.
- [ ] Test both browsers at narrow and wide desktop widths. Mobile is outside the target.

No deployment or cloud verification applies: this build is local-only.
