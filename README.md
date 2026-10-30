# PABOOM — Mein Instrument

A local webcam instrument: one hand plays chords, the other plays melody. React + TypeScript + Vite, MediaPipe Tasks Vision, and Tone.js. Inspired by Eric Wei's [Gesture Synth](https://www.indecisiveeric.com/gesture-synth), with independent controls and a warm, camera-first interface.

Published in [Logesh-vr/PABOOM](https://github.com/Logesh-vr/PABOOM). Features include chord/melody modes, one-hand accompaniment, inward-major/outward-minor wrist control, camera fullscreen/return, four sounds, and keyboard/pointer play. Camera frames stay on the device.

## Start playing

Use Node.js **22.12 or newer** and desktop Chrome or Edge. From this folder:

```powershell
npm install
npm run dev
```

Open the local address printed in the terminal, normally **http://127.0.0.1:5173/**. On Windows, after installing dependencies, double-click **Start Instrument.cmd** to launch the server and browser together. Keep its window open while playing.

The model, WASM runtimes, piano recordings, and notices are already included. Internet is needed for initial dependency installation, but normal play only requests files from the local server. Do not open `index.html` directly: camera access requires localhost or HTTPS. There is no backend, account, API key, microphone capture, or paid service.

Click **Start camera** and allow camera access. Face the camera in good light with both palms visible and apart. The guide explains the gestures; the lower keyboard also works without a camera. If the in-app browser does not complete its camera permission request, open the same local address in Chrome or Edge.

## Controls

| Action | Gesture / keyboard |
| --- | --- |
| Chords | Left hand: extend 1–5 fingers, or hold number keys 1–5 |
| Chord mapping | I, IV, V, vi, ii in major; harmonized diatonic equivalents in natural minor |
| Release chord | Close the hand or release the number key |
| Melody | Right hand: pinch thumb and index to play; release the pinch to stop |
| Pitch | Move the pinch left to right across the mirrored preview; two octaves of scale notes |
| Melody volume | Raise the pinched hand to increase volume |
| Keyboard melody | `A S D F G H J K L ; ' Z X C V`, in ascending scale order |
| Pointer melody/chords | Hold an on-screen note/chord; short taps have a minimum audible duration |
| Focused note button | Hold Enter to play; Space remains the emergency stop |
| Stop | Stop button, Space, or Escape; silences sound and turns the camera off |
| Swap hands | Arrow button between hand-role labels |
| Fullscreen camera | Full screen in the stage's upper-right corner; Return restores the layout |
| Major / minor chord | Bend the chord wrist inward toward your body for major; outward away from the body for minor |
| Neutral wrist | Start the camera, click Set neutral wrist below it, then hold the playing hand upright |
| One-hand mode | Choose One hand; fingers select chords, wrist sets quality, height sets volume, and a fist releases |

Choose Chords, Melody, Both hands, or One hand. Defaults: Both hands, C major, Warm Pad chords, Soft Pluck melody, wrist control on. One hand uses the selected chord hand only (left by default); the other hand is ignored and melody controls are inactive. The swap control selects right-hand play. All twelve roots and major/natural-minor scales are available. Upright/neutral uses the usual diatonic chord; a wrist bend overrides only its third/fifth to make it major or minor while keeping the selected root. Turn Wrist chords off to keep the original scale-based harmony. Sound choices are independent: Warm Pad, Soft Pluck, Synth Lead, Acoustic Piano. Musical preferences persist in local storage.

The camera estimates wrist tilt from palm depth relative to the wrist, normalized by palm length. This is a gesture proxy, not an anatomical wrist/forearm measurement. Hold the forearm steady and use Set neutral wrist to adapt it to your camera angle. Calibration gives you 900 ms to position the hand, then collects about one second of observations; at least three reliable frames are required. Chords are silent while sampling. Musical setting changes keep a successful calibration; stopping/changing cameras or swapping hands resets it. Neutral has a dead zone, smoothing, and 120 ms stabilization to limit quality flicker. Physical-camera wrist accuracy remains unmeasured.

Full screen keeps the same video element/session, note readouts, Stop, and Return visible. When the native Fullscreen API is blocked in an embedded browser, it expands to fill the browser viewport instead. Return preserves the session; Escape exits the expanded view and may also trigger the instrument's emergency stop. Set the neutral wrist before expanding the camera.

Changing mode, key, scale, hand assignment, or sound releases held notes. A held physical gesture can sound again after its new mapping stabilizes. Opening the guide, hiding the tab, or leaving the page stops the camera session. Changing cameras stops the current camera; press Start camera again to activate the new one.

## Architecture and behavior

`CameraSession` requests video only. It transfers one bitmap at a time to a **classic background worker**; no queue accumulates behind inference. The worker uses the local CPU/WASM Hand Landmarker with up to two hands. Classic bundling is intentional: this MediaPipe release's WASM loader uses `importScripts`, which fails in a module worker. `predev` and `prebuild` regenerate the worker from TypeScript.

Tracking frames flow through a pure gesture interpreter into musical intentions and then independent chord/melody audio channels. Labels come from the unmirrored Tasks Vision input; only the displayed image and horizontal coordinates are mirrored. A swap control handles the user's preference. Duplicate labels, overlapping wrists, implausible jumps, and conflicting identity continuity release affected notes rather than assigning them to another hand.

Finger changes require 120 ms of stable input. Pinch thresholds are normalized to palm width, with separate engage/release thresholds. Position smoothing and note-boundary hysteresis reduce flicker. Observations older than 250 ms are discarded; a separate 40 ms watchdog releases lost hands after the 250 ms grace period (up to one watchdog interval later). A stalled worker reports a restart error after three seconds. Hand identity is heuristic, not person identification; occlusion and fast crossing can release notes.

Tone.js handles polyphonic synthesis and sampled piano. Notes are diffed so a held pose does not retrigger every frame. Gain ramps, envelopes, and a limiter manage transitions. Stop mutes **after** reverb, so effects cannot leave an audible tail. Audio starts from an explicit interaction. Pending taps are cleared by Stop; they cannot play later when loading finishes.

The compact piano bank contains thirteen unmodified Salamander MP3 recordings, repitched between sample positions. It has one velocity layer and a smaller range than a full piano library. Source notes and licenses appear in the in-app guide and [attributions](public/ATTRIBUTIONS.md). Piano loads on demand; failure is visible with retry, and synth presets remain available.

## Build and checks

```powershell
npm test
npm run build
npm run preview
```

The production output is `dist/`. Preview normally serves **http://127.0.0.1:4173/**. The source is published on GitHub; the app is local-only and no website deployment is configured. The development-only `verification.html` page and its image fixtures are excluded from production.

`npm run build` bundles the tracker, checks the runtime asset hashes/notices, checks TypeScript, and builds the application. To restore bundled assets from their official sources, run `npm run assets` with network access. This also refreshes the source/size/SHA-256 manifest. Exact dependency versions are recorded in `package-lock.json`.

For browser checks, start the dev server and open `/verification.html`. Its buttons exercise the actual sound engine, locally packaged worker, and Google's reference hand images. They play short notes but do not use a webcam. See [VALIDATION.md](VALIDATION.md) for results and remaining manual checks.

## Limits

- Physical webcam gesture accuracy and human listening/playability are separate from automated or still-image checks. Follow the manual checklist in `VALIDATION.md` before treating it as performance-tested.
- Tracking speed depends on lighting, hand size, camera, CPU load, and browser. Low confidence, crossing, or leaving the frame can interrupt sound. The interface reports actual tracking FPS and inference time while live.
- Chrome and Edge are the intended desktop targets. Chromium browser checks were performed through the available in-app browser; separate Chrome/Edge hardware sessions remain to be verified. Mobile and Safari are not validated.
- Keep the local server running, even when disconnected from the internet. This is a local web app, not an installed offline PWA.
- Recording, looping, MIDI, song playback, cloud sync, and hosting are outside this version.

## Project and publication history

The project brief came from the supplied Gesture Synth reference videos and requested chord/melody, fullscreen, wrist-quality, and one-hand behaviors. This repository contains the independent implementation created for that brief, with its own controls and UI; it does not include the reference creator's source code.

The GitHub publication uses exactly **18 logical commits** grouping the already-developed application. These are a retrospective publication breakdown, not a reconstructed timeline of development; timestamps are not backdated. See the [commit map](docs/COMMIT-MAP.md). GitHub Actions runs the tests, TypeScript/build, and bundled-asset checks. Physical webcam and listening limitations remain documented in [VALIDATION.md](VALIDATION.md).
