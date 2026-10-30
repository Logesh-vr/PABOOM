# Publication history

This repository was published on 30 October 2026 as **18 non-empty logical commits**. The application was developed before this Git history was created. These commits group the finished source for review; they are not a claim that development happened in this order. Commit timestamps are the actual publication times and have not been backdated.

| # | Commit | Contents |
| --- | --- | --- |
| 1 | chore: establish repository hygiene and runtime conventions | Ignore rules, line endings, editor settings, Node version |
| 2 | build: configure React TypeScript and Vite dependencies | Package manifest, lockfile, TypeScript and Vite configuration |
| 3 | feat: add musical scales and chord voicings | Keys, scales, finger mappings, quality overrides, persisted settings |
| 4 | feat: interpret stable hand and wrist gestures | Finger counting, pinch, smoothing, identity checks, wrist calibration |
| 5 | feat: run hand tracking in a background worker | Video-only camera lifecycle, worker source, worker bundler |
| 6 | build: bundle local hand tracking runtimes | Model, WASM, and classic worker payload |
| 7 | feat: synthesize independent chord and melody voices | Tone.js audio channels, presets, effects, stopping and sampling |
| 8 | assets: include the local acoustic piano bank | Thirteen sample recordings |
| 9 | docs: preserve asset attribution and license notices | Upstream source and license notices |
| 10 | build: verify and restore bundled runtime assets | Download/restore helper, SHA-256 manifest, integrity checks |
| 11 | feat: add the camera performance stage and fullscreen controls | Stage, landmarks, trails, fullscreen/return, icons and favicon |
| 12 | feat: connect one-hand and two-hand instrument controls | App state, settings, keyboard/pointer inputs, guide, bootstrap and styles |
| 13 | test: cover music and gesture interpretation | Scale/chord tests, wrist/one-hand/stability tests |
| 14 | test: cover camera lifecycle and fullscreen behavior | Stream cleanup, frame queue, permission failures, fullscreen tests |
| 15 | test: verify instrument interaction and audio recovery | React interaction, input lifecycle and loading/error tests |
| 16 | test: add browser audio and hand reference checks | Development harness and public MediaPipe fixtures |
| 17 | ci: check tests and production build on GitHub | CI workflow and Windows launch helper |
| 18 | docs: publish setup validation and project history | README, validation results, and this commit map |

The history is a publication breakdown, so intermediate commits are not advertised as independently runnable releases. The final tree contains the complete tested application. Vendored runtime/sample files are intentionally committed so normal play does not require external asset requests. Dependencies, build outputs, generated test screenshots and local credentials are excluded.
