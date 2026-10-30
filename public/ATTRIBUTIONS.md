# Credits and third-party notices

Mein Instrument is an independent implementation inspired by **Gesture Synth**, created by Eric Wei: https://www.indecisiveeric.com/gesture-synth. The application layout, controls, music mapping, and source code here were implemented for this project. No source, branding, or audiovisual content from Gesture Synth is bundled.

## Piano recordings

**Salamander Grand Piano V3** — Alexander Holm.

- Source collection and author: https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html
- MP3 distribution: https://github.com/Tonejs/audio/tree/master/salamander
- Distributed under Creative Commons Attribution 3.0, https://creativecommons.org/licenses/by/3.0/
- Bundled license: `licenses/CC-BY-3.0.txt`.
- Thirteen MP3 recordings (C, D-sharp, F-sharp, A in octaves 3–5, plus C6) are copied unmodified. The instrument selects, repitches, envelopes, mixes and adds reverb during playback. This small bank uses one velocity layer; it is not the full Salamander collection.
- Credit does not imply endorsement by Alexander Holm or Tone.js.

## Tracking and audio software

- **MediaPipe Tasks Vision**, Google / MediaPipe authors, Apache License 2.0: https://github.com/google-ai-edge/mediapipe. Hand Landmarker model: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker. The model and WASM runtime are served locally. License: `licenses/MediaPipe-Apache-2.0.txt`.
- **Tone.js**, Yotam Mann and contributors, MIT: https://github.com/Tonejs/Tone.js. License: `licenses/Tone-MIT.txt`.
- **React**, Meta Platforms, Inc. and affiliates, MIT: https://github.com/facebook/react. License: `licenses/React-MIT.txt`.

Development dependencies retain their upstream licenses in `node_modules` and the lockfile records exact package versions. Public reference-image fixtures used by development checks come from the MediaPipe project and are excluded from the production build.
