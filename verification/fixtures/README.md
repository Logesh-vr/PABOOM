# Reference fixtures

These images and expected landmarks are Google MediaPipe's public test fixtures, used to validate the actual bundled tracker without accessing a user's camera.

Source: `https://storage.googleapis.com/mediapipe-assets/`

Files: `thumb_up.jpg`, `pointing_up.jpg`, `right_hands.jpg`, `thumb_up_landmarks.pbtxt`.

Upstream tests: https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/python/test/vision/hand_landmarker_test.py

The expected `Right` label for the unmirrored thumb-up image is recorded in the upstream landmark fixture. This checks against accidentally copying the mirrored-label convention from the older Solutions API.

The development checks serve this directory through Vite. The production build includes only `index.html` and `public/`, so these fixtures and the verification interface are excluded. MediaPipe is Apache 2.0; see the included MediaPipe notice in `public/licenses`.
