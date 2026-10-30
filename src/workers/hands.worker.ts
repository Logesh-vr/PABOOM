/// <reference lib="webworker" />
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

let detector: HandLandmarker | null = null;
self.onmessage = async (event: MessageEvent) => {
  const { type, bitmap, capturedAt, base } = event.data;
  try {
    if (type === 'init') {
      detector = await HandLandmarker.createFromOptions(
        await FilesetResolver.forVisionTasks(`${base}vision/wasm`),
        {
          baseOptions: {
            modelAssetPath: `${base}vision/hand_landmarker.task`,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.6,
          minTrackingConfidence: 0.6,
        },
      );
      self.postMessage({ type: 'ready' });
    } else if (type === 'frame' && detector) {
      const started = performance.now();
      const result = detector.detectForVideo(bitmap, capturedAt);
      self.postMessage({
        type: 'result',
        capturedAt,
        inferenceMs: performance.now() - started,
        // Tasks Vision labels the unmirrored source. Mirror only the drawing;
        // inverting these labels would exchange the player's two hand roles.
        hands: result.landmarks.map((points, i) => ({
          points,
          side: result.handedness[i][0].categoryName,
          confidence: result.handedness[i][0].score,
        })),
      });
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Hand tracking failed.',
    });
  } finally {
    bitmap?.close();
  }
};
